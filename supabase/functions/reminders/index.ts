import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
import { identityToken, notificationContent, notificationUrl } from '../_shared/notifications.js';

const env = (name: string) => { const value = Deno.env.get(name); if (!value) throw Error(`Missing ${name}`); return value; };
const json = (body: unknown, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
Deno.serve(async req => {
  let cors: Record<string, string> = {};
  try {
    const appUrl = env('APP_URL');
    const origin = req.headers.get('origin');
    if (origin && origin !== new URL(appUrl).origin) return json({ error: 'Nguồn truy cập không hợp lệ.' }, 403);
    cors = { 'Access-Control-Allow-Origin': new URL(appUrl).origin, 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin' };
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method !== 'POST') return json({ error: 'Phương thức không hợp lệ.' }, 405, cors);
    const { action } = await req.json();
    const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
    let userId: string | null = null;
    if (action === 'cron') {
      const secret = env('REMINDER_CRON_SECRET');
      if (secret.length < 32 || req.headers.get('x-cron-secret') !== secret) return json({ error: 'Không có quyền.' }, 401, cors);
    } else {
      const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
      if (!token) return json({ error: 'Cần đăng nhập.' }, 401, cors);
      const { data, error } = await db.auth.getUser(token);
      if (error || !data.user?.email_confirmed_at) return json({ error: 'Cần đăng nhập bằng email đã xác minh.' }, 401, cors);
      userId = data.user.id;
    }
    const appId = env('ONESIGNAL_APP_ID');
    if (action === 'identity') return json({ token: await identityToken(appId, userId, env('ONESIGNAL_IDENTITY_KEY')) }, 200, cors);
    async function send(job: { id: string; user_id: string; kind: string; local_date: string }) {
      if (job.kind !== 'test') {
        const { data: setting, error: settingError } = await db.from('reminder_settings').select('enabled').eq('user_id', job.user_id).eq('kind', job.kind).single();
        if (settingError) throw Error('database');
        if (!setting.enabled) {
          const { error } = await db.from('notification_jobs').update({ status: 'skipped', error: 'disabled' }).eq('id', job.id);
          if (error) throw Error('database');
          return false;
        }
      }
      const { data: tasks, error } = await db.from('tasks').select('completed').eq('user_id', job.user_id).eq('date', job.local_date);
      if (error) throw Error('database');
      const contents = notificationContent(job.kind, tasks.filter(t => t.completed).length, tasks.length);
      const response = await fetch('https://api.onesignal.com/notifications', {
        method: 'POST', signal: AbortSignal.timeout(20000),
        headers: { 'Authorization': `Key ${env('ONESIGNAL_REST_API_KEY')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_id: appId, include_aliases: { external_id: [job.user_id] }, target_channel: 'push', headings: { en: 'Super Day', vi: 'Super Day' }, contents: { en: contents, vi: contents }, url: notificationUrl(appUrl, job.kind), idempotency_key: job.id })
      });
      const result = await response.json();
      if (!response.ok) throw Error(`provider_http_${response.status}`);
      if (!result.id) {
        const { error: updateError } = await db.from('notification_jobs').update({ status: 'skipped', error: 'no_active_subscription' }).eq('id', job.id);
        if (updateError) throw Error('database');
        return false;
      }
      const { error: updateError } = await db.from('notification_jobs').update({ status: 'sent', provider_id: result.id, sent_at: new Date().toISOString(), error: null }).eq('id', job.id);
      if (updateError) throw Error('database');
      return true;
    }
    if (action === 'test') {
      const now = new Date();
      const { data: profile, error: profileError } = await db.from('profiles').select('timezone').eq('id', userId).single();
      if (profileError) throw Error('database');
      const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: profile.timezone }).format(now);
      const { data: job, error } = await db.from('notification_jobs').insert({ user_id: userId, kind: 'test', local_date: localDate, event_key: `test:${Math.floor(now.getTime() / 60000)}`, status: 'processing', attempts: 1, claimed_at: now.toISOString() }).select().single();
      if (error?.code === '23505') return json({ error: 'Bạn vừa gửi thử. Hãy đợi một phút trước khi gửi lại.' }, 429, cors);
      if (error) throw Error('database');
      try {
        const sent = await send(job);
        return sent ? json({ accepted: true, received: false }, 200, cors) : json({ error: 'Chưa có thiết bị nhận. Hãy cho phép thông báo, chờ đăng ký xong rồi thử lại.' }, 409, cors);
      } catch (err) {
        await db.from('notification_jobs').update({ status: 'failed', error: err.message }).eq('id', job.id);
        throw err;
      }
    }
    if (action === 'cron') {
      const { data: jobs, error } = await db.rpc('claim_due_reminders');
      if (error) throw Error('database');
      let sent = 0, failed = 0, skipped = 0;
      for (let i = 0; i < jobs.length; i += 10) {
        await Promise.all(jobs.slice(i, i + 10).map(async job => {
          try { if (await send(job)) sent++; else skipped++; }
          catch (err) { failed++; await db.from('notification_jobs').update({ status: 'failed', error: err.message }).eq('id', job.id); }
        }));
      }
      return json({ sent, failed, skipped }, 200, cors);
    }
    return json({ error: 'Thao tác không hợp lệ.' }, 400, cors);
  } catch {
    // Do not expose provider responses, bearer tokens or service secrets.
    return json({ error: 'Hệ thống thông báo chưa sẵn sàng. Hãy kiểm tra cấu hình rồi thử lại.' }, 503, cors);
  }
});
