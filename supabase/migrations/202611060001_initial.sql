-- Super Day MVP. All client writes go through the authenticated, idempotent mutate RPC.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  timezone text not null default 'Asia/Ho_Chi_Minh',
  created_at timestamptz not null default now()
);
create table public.days (
  user_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  reflection text not null default '' check (char_length(reflection) <= 100000),
  closed_at timestamptz,
  primary key (user_id, date)
);
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  slot smallint not null check (slot between 1 and 3),
  title text not null check (char_length(trim(title)) between 1 and 500),
  completed boolean not null default false,
  chain_id uuid not null default gen_random_uuid(),
  previous_task_id uuid unique,
  carry_count integer not null default 0 check (carry_count >= 0),
  reason text not null default '' check (char_length(reason) <= 5000),
  created_at timestamptz not null default now(),
  unique (user_id, date, slot),
  unique (user_id, id),
  foreign key (user_id, date) references public.days(user_id, date) on delete cascade,
  foreign key (user_id, previous_task_id) references public.tasks(user_id, id)
);
create index tasks_user_date on public.tasks(user_id, date);
create table public.reminder_settings (
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('morning', 'noon', 'evening')),
  time time not null,
  enabled boolean not null default true,
  primary key (user_id, kind)
);
create table public.mutation_receipts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  mutation_id uuid not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, mutation_id)
);
-- Jobs are server-only. Stable UUIDs are also OneSignal idempotency keys.
create table public.notification_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('morning', 'noon', 'evening', 'test')),
  local_date date not null,
  event_key text not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  provider_id text,
  error text,
  unique (user_id, event_key)
);
create index notification_jobs_pending on public.notification_jobs(status, created_at);

alter table public.profiles enable row level security;
alter table public.days enable row level security;
alter table public.tasks enable row level security;
alter table public.reminder_settings enable row level security;
alter table public.mutation_receipts enable row level security;
alter table public.notification_jobs enable row level security;
create policy own_profile on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy own_days on public.days for select to authenticated using (user_id = (select auth.uid()));
create policy own_tasks on public.tasks for select to authenticated using (user_id = (select auth.uid()));
create policy own_reminders on public.reminder_settings for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.profiles, public.days, public.tasks, public.reminder_settings, public.mutation_receipts, public.notification_jobs from anon, authenticated;
grant select on public.profiles, public.days, public.tasks, public.reminder_settings to authenticated;
grant all on public.profiles, public.days, public.tasks, public.reminder_settings, public.mutation_receipts, public.notification_jobs to service_role;

create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id) values (new.id);
  insert into public.reminder_settings(user_id, kind, time) values
    (new.id, 'morning', '06:00'), (new.id, 'noon', '13:00'), (new.id, 'evening', '20:30');
  return new;
end; $$;
revoke all on function public.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
insert into public.profiles(id) select id from auth.users on conflict do nothing;
insert into public.reminder_settings(user_id, kind, time)
select p.id, v.kind, v.time::time from public.profiles p cross join (values ('morning', '06:00'), ('noon', '13:00'), ('evening', '20:30')) v(kind, time) on conflict do nothing;

create function public.mutate(p_mutation_id uuid, p_kind text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  u uuid := auth.uid();
  result jsonb;
  t public.tasks;
  d public.days;
  base jsonb;
  patch jsonb := coalesce(p_payload->'patch', '{}'::jsonb);
  expected jsonb := coalesce(p_payload->'expected', '{}'::jsonb);
  k text;
  target date;
  s integer;
begin
  if u is null or not exists (select 1 from auth.users where id = u and email_confirmed_at is not null) then
    raise exception 'Cần đăng nhập bằng email đã xác minh.' using errcode = '42501';
  end if;
  if p_mutation_id is null then raise exception 'Thiếu mã thao tác.'; end if;
  -- Serialize writes for each account, including concurrent requests from different devices.
  perform pg_advisory_xact_lock(hashtextextended(u::text, 0));
  select r.result into result from public.mutation_receipts r where r.user_id = u and r.mutation_id = p_mutation_id;
  if found then return result; end if;
  if p_kind = 'task' then
    target := (p_payload->>'date')::date; s := (p_payload->>'slot')::integer;
    if target is null or s is null or s not between 1 and 3 then raise exception 'Mỗi ngày có tối đa ba vị trí.'; end if;
    select * into t from public.tasks where user_id = u and date = target and slot = s;
    base := case when found then to_jsonb(t) else '{"title":"","completed":false,"reason":""}'::jsonb end;
    for k in select jsonb_object_keys(patch) loop
      if k not in ('title', 'completed', 'reason') then raise exception 'Trường công việc không hợp lệ.'; end if;
      if expected ? k and base->k is distinct from expected->k then raise exception 'CONFLICT: Nội dung đã thay đổi trên thiết bị khác.' using errcode = '40001'; end if;
    end loop;
    base := base || patch;
    if trim(coalesce(base->>'title', '')) = '' then
      if t.id is not null and exists(select 1 from public.tasks where user_id = u and previous_task_id = t.id) then raise exception 'Công việc đã chuyển ngày cần được giữ lại trong lịch sử.'; end if;
      delete from public.tasks where user_id = u and date = target and slot = s;
      result := '{}'::jsonb;
    else
      insert into public.days(user_id, date) values (u, target) on conflict do nothing;
      insert into public.tasks(id, user_id, date, slot, title, completed, reason)
        values (coalesce(t.id, (p_payload->>'id')::uuid, gen_random_uuid()), u, target, s, trim(base->>'title'), (base->>'completed')::boolean, base->>'reason')
        on conflict (user_id, date, slot) do update set title = excluded.title, completed = excluded.completed, reason = excluded.reason
        returning to_jsonb(tasks.*) into result;
    end if;
  elsif p_kind = 'day' then
    target := (p_payload->>'date')::date;
    select * into d from public.days where user_id = u and date = target;
    base := case when found then to_jsonb(d) else '{"reflection":"","closed_at":null}'::jsonb end;
    for k in select jsonb_object_keys(patch) loop
      if k not in ('reflection', 'closed_at') then raise exception 'Trường ngày không hợp lệ.'; end if;
      if expected ? k and base->k is distinct from expected->k then raise exception 'CONFLICT: Ghi chép đã thay đổi trên thiết bị khác.' using errcode = '40001'; end if;
    end loop;
    base := base || patch;
    insert into public.days(user_id, date, reflection, closed_at) values (u, target, base->>'reflection', (base->>'closed_at')::timestamptz)
      on conflict (user_id, date) do update set reflection = excluded.reflection, closed_at = excluded.closed_at returning to_jsonb(days.*) into result;
  elsif p_kind = 'carry' then
    select * into t from public.tasks where user_id = u and id = (p_payload->>'id')::uuid;
    if not found then raise exception 'Không tìm thấy công việc của bạn.'; end if;
    target := (p_payload->>'target')::date;
    if t.completed then raise exception 'Chỉ chuyển công việc chưa hoàn thành.'; end if;
    if target is null or target <= t.date then raise exception 'Hãy chọn một ngày sau ngày gốc.'; end if;
    if exists (select 1 from public.tasks where user_id = u and previous_task_id = t.id) then raise exception 'Công việc này đã được chuyển ngày.'; end if;
    select min(n) into s from generate_series(1,3) n where not exists(select 1 from public.tasks where user_id = u and date = target and slot = n);
    if s is null then raise exception 'Ngày mới đã có đủ ba công việc.'; end if;
    insert into public.days(user_id, date) values (u, target) on conflict do nothing;
    insert into public.tasks(user_id, date, slot, title, chain_id, previous_task_id, carry_count, reason)
      values (u, target, s, t.title, t.chain_id, t.id, t.carry_count + 1, t.reason) returning to_jsonb(tasks.*) into result;
  elsif p_kind = 'profile' then
    for k in select jsonb_object_keys(patch) loop
      if k not in ('display_name', 'timezone') then raise exception 'Trường hồ sơ không hợp lệ.'; end if;
    end loop;
    if patch ? 'timezone' and not exists(select 1 from pg_timezone_names where name = patch->>'timezone') then raise exception 'Múi giờ không hợp lệ.'; end if;
    update public.profiles set display_name = coalesce(patch->>'display_name', display_name), timezone = coalesce(patch->>'timezone', timezone) where id = u returning to_jsonb(profiles.*) into result;
  elsif p_kind = 'reminder' then
    for k in select jsonb_object_keys(patch) loop
      if k not in ('time', 'enabled') then raise exception 'Trường nhắc nhở không hợp lệ.'; end if;
    end loop;
    update public.reminder_settings set time = coalesce((patch->>'time')::time, time), enabled = coalesce((patch->>'enabled')::boolean, enabled)
      where user_id = u and kind = p_payload->>'kind' returning to_jsonb(reminder_settings.*) into result;
    if not found then raise exception 'Loại nhắc nhở không hợp lệ.'; end if;
  else raise exception 'Thao tác không hợp lệ.';
  end if;
  insert into public.mutation_receipts(user_id, mutation_id, result) values (u, p_mutation_id, result);
  return result;
end; $$;
revoke all on function public.mutate(uuid, text, jsonb) from public, anon;
grant execute on function public.mutate(uuid, text, jsonb) to authenticated;

create function public.claim_due_reminders(p_now timestamptz default now())
returns setof public.notification_jobs language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notification_jobs(user_id, kind, local_date, event_key, created_at)
  select p.id, r.kind, (p_now at time zone p.timezone)::date,
    r.kind || ':' || ((p_now at time zone p.timezone)::date)::text, p_now
  from public.profiles p join public.reminder_settings r on r.user_id = p.id
  where r.enabled and exists (select 1 from auth.users a where a.id = p.id and a.email_confirmed_at is not null) and p_now >= (((p_now at time zone p.timezone)::date + r.time) at time zone p.timezone)
    and p_now < (((p_now at time zone p.timezone)::date + r.time) at time zone p.timezone) + interval '15 minutes'
  on conflict (user_id, event_key) do nothing;
  return query
  with due as (
    select j.id from public.notification_jobs j
    where j.kind <> 'test' and j.attempts < 5 and j.created_at > p_now - interval '20 minutes'
      and (j.status in ('pending', 'failed') or (j.status = 'processing' and j.claimed_at < p_now - interval '3 minutes'))
    order by j.created_at for update skip locked limit 100
  ) update public.notification_jobs j set status = 'processing', attempts = attempts + 1, claimed_at = p_now
    from due where j.id = due.id returning j.*;
end; $$;
revoke all on function public.claim_due_reminders(timestamptz) from public, anon, authenticated;
grant execute on function public.claim_due_reminders(timestamptz) to service_role;
