begin;
insert into auth.users values ('11111111-1111-4111-8111-111111111111', now()), ('22222222-2222-4222-8222-222222222222', now()), ('33333333-3333-4333-8333-333333333333', null);
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select public.mutate('aaaaaaaa-0000-4000-8000-000000000001', 'task', '{"date":"2026-11-01","slot":1,"patch":{"title":"Việc thứ nhất"},"expected":{"title":""}}');
-- Replay after a lost response must return the original result without applying again or conflicting.
select public.mutate('aaaaaaaa-0000-4000-8000-000000000001', 'task', '{"date":"2026-11-01","slot":1,"patch":{"title":"Việc thứ nhất"},"expected":{"title":""}}');
select public.mutate(gen_random_uuid(), 'task', '{"date":"2026-11-01","slot":2,"patch":{"title":"Việc thứ hai"}}');
select public.mutate(gen_random_uuid(), 'task', '{"date":"2026-11-01","slot":3,"patch":{"title":"Việc thứ ba"}}');
select public.mutate(gen_random_uuid(), 'day', '{"date":"2026-11-01","patch":{"reflection":"Ghi chép riêng tư"}}');
do $$ begin
  if (select count(*) from public.tasks) <> 3 then raise exception 'Expected 3 tasks'; end if;
  begin perform public.mutate(gen_random_uuid(), 'task', '{"date":"2026-11-01","slot":4,"patch":{"title":"Fourth"}}'); raise exception 'Fourth task accepted'; exception when raise_exception then if sqlerrm = 'Fourth task accepted' then raise; end if; end;
  begin insert into public.tasks(user_id,date,slot,title) values(auth.uid(),'2026-11-01',4,'Bypass'); raise exception 'Direct write accepted'; exception when insufficient_privilege then null; end;
  begin perform public.mutate(gen_random_uuid(), 'task', '{"date":"2026-11-01","slot":1,"patch":{"title":"Stale change"},"expected":{"title":"Wrong old value"}}'); raise exception 'Conflict not detected'; exception when serialization_failure then null; end;
  begin perform public.mutate(gen_random_uuid(), 'task', '{"date":"2026-11-01","slot":1,"patch":{"carry_count":99}}'); raise exception 'Forged lineage accepted'; exception when raise_exception then if sqlerrm = 'Forged lineage accepted' then raise; end if; end;
  begin perform public.mutate(gen_random_uuid(), 'profile', '{"patch":{"timezone":"Not/A_Zone"}}'); raise exception 'Bad timezone accepted'; exception when raise_exception then if sqlerrm = 'Bad timezone accepted' then raise; end if; end;
end $$;
-- User B cannot read A's rows or move A's task. All lists/export use these same RLS-protected tables.
reset role;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select set_config('test.private_task', (select id::text from public.tasks where slot=1), true);
set local role authenticated;
do $$ begin
  if (select count(*) from public.tasks) <> 0 or (select count(*) from public.days) <> 0 then raise exception 'Cross-account read'; end if;
  if (select count(*) from public.profiles) <> 1 then raise exception 'Cross-account profile read'; end if;
  begin update public.days set reflection='Hijack'; raise exception 'Cross-account write'; exception when insufficient_privilege then null; end;
  begin perform public.claim_due_reminders(); raise exception 'Client can claim jobs'; exception when insufficient_privilege then null; end;
end $$;
do $$ begin
  begin perform public.mutate(gen_random_uuid(), 'carry', jsonb_build_object('id', current_setting('test.private_task'), 'target','2026-11-02')); raise exception 'Cross-account carry accepted'; exception when raise_exception then if sqlerrm = 'Cross-account carry accepted' then raise; end if; end;
end $$;
-- Unverified accounts cannot mutate even with the authenticated database role.
select set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
do $$ begin
  begin perform public.mutate(gen_random_uuid(), 'task', '{"date":"2026-11-01","slot":1,"patch":{"title":"Unverified"}}'); raise exception 'Unverified mutation'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
do $$ declare first_id uuid; next_id uuid; result jsonb; begin
  select id into first_id from public.tasks where slot=1 and date='2026-11-01';
  result := public.mutate(gen_random_uuid(), 'carry', jsonb_build_object('id',first_id,'target','2026-11-02'));
  next_id := (result->>'id')::uuid;
  result := public.mutate(gen_random_uuid(), 'carry', jsonb_build_object('id',next_id,'target','2026-11-03'));
  if (result->>'carry_count')::integer <> 2 then raise exception 'Carry count wrong'; end if;
  if (result->>'previous_task_id')::uuid <> next_id then raise exception 'Lineage missing'; end if;
  if not exists(select 1 from public.tasks where id=first_id and date='2026-11-01' and not completed) then raise exception 'History overwritten'; end if;
  begin perform public.mutate(gen_random_uuid(), 'carry', jsonb_build_object('id',first_id,'target','2026-11-04')); raise exception 'Duplicate carry accepted'; exception when raise_exception then if sqlerrm = 'Duplicate carry accepted' then raise; end if; end;
  perform public.mutate(gen_random_uuid(), 'task', '{"date":"2026-11-03","slot":1,"patch":{"completed":true}}');
  begin perform public.mutate(gen_random_uuid(), 'carry', jsonb_build_object('id',result->>'id','target','2026-11-04')); raise exception 'Completed task carried'; exception when raise_exception then if sqlerrm = 'Completed task carried' then raise; end if; end;
end $$;
-- The test account without a verified email must not receive scheduled notifications.
reset role;
set local role service_role;
select count(*) as claimed from public.claim_due_reminders('2026-11-06 23:01:00+00');
do $$ begin
  if (select count(*) from public.notification_jobs where local_date='2026-11-07' and kind='morning') <> 2 then raise exception 'Timezone scheduling or verified-account filtering wrong'; end if;
  if (select count(*) from public.claim_due_reminders('2026-11-06 23:02:00+00')) <> 0 then raise exception 'Duplicate daily notifications'; end if;
  if (select count(*) from public.claim_due_reminders('2026-11-06 23:05:00+00')) <> 2 then raise exception 'Expired lease not retried'; end if;
  if (select count(*) from public.notification_jobs) <> 2 then raise exception 'Retries created extra jobs'; end if;
end $$;
reset role;
set local role anon;
do $$ begin
  begin perform public.mutate(gen_random_uuid(),'profile','{}'); raise exception 'Anonymous RPC accepted'; exception when insufficient_privilege then null; end;
  begin perform * from public.tasks; raise exception 'Anonymous read accepted'; exception when insufficient_privilege then null; end;
end $$;
rollback;
