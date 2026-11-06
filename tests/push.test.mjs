import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { transform } from 'esbuild';
import { notificationContent, notificationUrl } from '../supabase/functions/_shared/notifications.js';

const pushSource = (await readFile(new URL('../src/lib/push.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\n/gm, '').replace(/^export /gm, '')
  .replaceAll('import.meta.url', JSON.stringify('https://example.github.io/super-day/src/lib/push.js?v=test-release'));
function pushHarness({ installed = true } = {}) {
  const calls = { login: [], init: [], optOut: 0, logout: 0 };
  const sdk = {
    init: async config => { calls.init.push(config); }, login: async (...args) => { calls.login.push(args); },
    User: { PushSubscription: { optOut: async () => { calls.optOut++; } } }, logout: async () => { calls.logout++; },
  };
  const window = { Notification() {}, matchMedia: () => ({ matches: installed }) };
  const document = { createElement: () => ({}), head: { append: () => queueMicrotask(() => window.OneSignalDeferred[0](sdk)) } };
  const api = runInNewContext(pushSource + '\n;({ preparePush, detachPush })', {
    window, document, navigator: { userAgent: 'iPhone', platform: 'iPhone', serviceWorker: {} },
    config: { oneSignalAppId: 'test-app-id' }, URL,
    // Any legacy identity request fails this test immediately.
    edge: () => { throw Error('Device registration must not call the identity Edge Function'); },
  });
  return { ...api, calls };
}
test('Web SDK v16 logs in with only the Supabase UUID and preserves the separate worker scope', async () => {
  const app = pushHarness();
  await app.preparePush('verified-user-id');
  assert.equal(app.calls.login.length, 1);
  assert.equal(app.calls.login[0].length, 1);
  assert.equal(app.calls.login[0][0], 'verified-user-id');
  assert.equal(app.calls.init[0].serviceWorkerPath, '/super-day/push/OneSignalSDKWorker.js');
  assert.equal(app.calls.init[0].serviceWorkerParam.scope, '/super-day/push/');
  await app.preparePush('second-verified-user');
  assert.equal(app.calls.init.length, 1);
  assert.equal(app.calls.login[1][0], 'second-verified-user');
  await app.detachPush();
  assert.equal(app.calls.optOut, 1); assert.equal(app.calls.logout, 1);
});
test('iPhone notification setup still requires the installed PWA', async () => {
  const app = pushHarness({ installed: false });
  await assert.rejects(app.preparePush('verified-user-id'), /Màn hình chính/);
  assert.equal(app.calls.init.length, 0);
});

const edgeSource = (await readFile(new URL('../supabase/functions/reminders/index.ts', import.meta.url), 'utf8')).replace(/^import .*;\n/gm, '');
const { code: edgeCode } = await transform(edgeSource, { loader: 'ts', target: 'es2022' });
function serverHarness({ valid = true, confirmed = true } = {}) {
  const userId = '11111111-1111-4111-8111-111111111111';
  const calls = { users: [], sent: [], jobs: [], env: [] }; let handler;
  const values = { APP_URL: 'https://example.github.io/super-day/', SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'server-test-key', ONESIGNAL_APP_ID: 'test-app-id', ONESIGNAL_REST_API_KEY: 'test-api-key', REMINDER_CRON_SECRET: 'test-cron-secret-at-least-32-characters' };
  const db = {
    auth: { getUser: async token => { calls.users.push(token); return valid ? { data: { user: { id: userId, email_confirmed_at: confirmed ? '2026-11-06T00:00:00Z' : null } }, error: null } : { data: { user: null }, error: { message: 'invalid token' } }; } },
    from(table) {
      let inserted;
      return {
        select() { return this; }, eq() { return this; },
        insert(value) { inserted = value; calls.jobs.push(value); return this; }, update() { return this; },
        async single() { return { data: table === 'profiles' ? { timezone: 'Asia/Ho_Chi_Minh' } : { id: '22222222-2222-4222-8222-222222222222', ...inserted }, error: null }; },
        then(resolve, reject) { return Promise.resolve({ data: table === 'tasks' ? [{ completed: true }] : [], error: null }).then(resolve, reject); },
      };
    },
    rpc() { throw Error('Unauthorized cron must not claim jobs'); },
  };
  runInNewContext(edgeCode, {
    Deno: { env: { get(name) { calls.env.push(name); return values[name]; } }, serve(fn) { handler = fn; } },
    createClient: () => db, notificationContent, notificationUrl, URL, Response, AbortSignal,
    fetch: async (_url, options) => { calls.sent.push(JSON.parse(options.body)); return Response.json({ id: 'provider-notification-id' }); },
  });
  const request = (action, token, extra = {}) => handler(new Request('https://example.supabase.co/functions/v1/reminders', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...extra }, body: JSON.stringify({ action, user_id: 'untrusted-client-target' }) }));
  return { request, calls, userId };
}
test('Test sends still require a verified Supabase session, and cron still requires its own secret', async () => {
  const missing = serverHarness(); assert.equal((await missing.request('test')).status, 401);
  assert.equal(missing.calls.sent.length, 0);
  assert.equal((await missing.request('cron', null, { 'x-cron-secret': 'wrong-secret' })).status, 401);
  const invalid = serverHarness({ valid: false }); assert.equal((await invalid.request('test', 'invalid-session')).status, 401);
  const unverified = serverHarness({ confirmed: false }); assert.equal((await unverified.request('test', 'test-session')).status, 401);
  assert.equal(invalid.calls.sent.length + unverified.calls.sent.length, 0);
});
test('Authenticated test sends target the verified account and need no identity key', async () => {
  const app = serverHarness(); const response = await app.request('test', 'test-session');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { accepted: true, received: false });
  assert.equal(app.calls.users[0], 'test-session');
  assert.equal(app.calls.jobs[0].user_id, app.userId);
  assert.deepEqual(app.calls.sent[0].include_aliases.external_id, [app.userId]);
  assert.equal(app.calls.sent[0].url, 'https://example.github.io/super-day/?view=today');
  assert.ok(!app.calls.env.includes('ONESIGNAL_IDENTITY_KEY'));
  assert.equal((await app.request('identity', 'test-session')).status, 400);
});
