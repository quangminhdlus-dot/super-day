import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { transform } from 'esbuild';
import { notificationContent, notificationUrl } from '../supabase/functions/_shared/notifications.js';

const pushSource = (await readFile(new URL('../src/lib/push.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\n/gm, '').replace(/^export /gm, '')
  .replaceAll('import.meta.url', JSON.stringify('https://example.github.io/super-day/src/lib/push.js?v=test-release'));
const workerSource = await readFile(new URL('../public/push/OneSignalSDKWorker.js', import.meta.url), 'utf8');
function events() {
  const listeners = new Map();
  return {
    addEventListener(name, fn) { const group = listeners.get(name) || new Set(); group.add(fn); listeners.set(name, group); },
    removeEventListener(name, fn) { listeners.get(name)?.delete(fn); },
    emit(name) { for (const fn of listeners.get(name) || []) fn({}); },
    count() { return [...listeners.values()].reduce((sum, group) => sum + group.size, 0); },
  };
}
function pushHarness({ installed = true, permission = 'granted', rootWorker = false, workerStatus = 200, workerType = 'application/javascript' } = {}) {
  const calls = { login: [], init: [], optOut: 0, logout: 0, permission: 0, optIn: 0, lookups: [], removedScripts: 0 };
  const native = { present: false }, subscriptionEvents = events(), notificationEvents = events(), userEvents = events();
  let customRequest, keepOptedOut = false, scriptFails = false;
  const window = { Notification: Object.assign(function () {}, { permission }), PushManager() {}, isSecureContext: true, matchMedia: () => ({ matches: installed }) };
  const sdk = {
    init: async config => { calls.init.push(config); }, login: async (...args) => { calls.login.push(args); sdk.User.externalId = args[0]; userEvents.emit('change'); },
    Notifications: {
      ...notificationEvents,
      get permission() { return window.Notification.permission === 'granted'; },
      get permissionNative() { return window.Notification.permission; },
      requestPermission: async () => {
        calls.permission++;
        if (customRequest) return customRequest();
        window.Notification.permission = 'granted'; notificationEvents.emit('permissionChange');
        native.present = true;
        sdk.User.PushSubscription.id = 'test-subscription-id'; sdk.User.PushSubscription.token = 'https://web.push.apple.com/test-token'; subscriptionEvents.emit('change');
        return true;
      },
    },
    User: {
      ...userEvents, externalId: null,
      PushSubscription: {
        ...subscriptionEvents, id: null, token: null, optedIn: false,
        optIn: async () => { calls.optIn++; sdk.User.PushSubscription.optedIn = !keepOptedOut; subscriptionEvents.emit('change'); },
        optOut: async () => { calls.optOut++; sdk.User.PushSubscription.optedIn = false; },
      },
    },
    logout: async () => { calls.logout++; sdk.User.externalId = null; },
  };
  const registration = {
    scope: 'https://example.github.io' + (rootWorker ? '/super-day/' : '/super-day/push/'),
    active: { state: 'activated', scriptURL: 'https://example.github.io' + (rootWorker ? '/super-day/sw.js' : '/super-day/push/OneSignalSDKWorker.js?appId=test&sdkVersion=16') },
    pushManager: { getSubscription: async () => native.present ? { endpoint: 'https://web.push.apple.com/native-test-token' } : null },
  };
  const document = { createElement: () => ({ remove() { calls.removedScripts++; } }), head: { append: script => queueMicrotask(() => scriptFails ? script.onerror() : window.OneSignalDeferred[0](sdk)) } };
  const api = runInNewContext(pushSource + '\n;({ preparePush, detachPush, registerPush, inspectPush, readPushState, observePush, pushStateLabel })', {
    window, document, navigator: { userAgent: 'iPhone', platform: 'iPhone', serviceWorker: { getRegistration: async url => { calls.lookups.push(url); return registration; } } },
    location: { origin: 'https://example.github.io' },
    config: { oneSignalAppId: 'test-app-id' }, URL, setTimeout, clearTimeout,
    fetch: async () => new Response(workerSource, { status: workerStatus, headers: { 'Content-Type': workerType } }),
    edge: () => { throw Error('Device registration must not call the identity Edge Function'); },
  });
  return { ...api, sdk, calls, native, window, subscriptionEvents, notificationEvents, userEvents,
    setRequest: fn => { customRequest = fn; }, setOptOut: value => { keepOptedOut = value; },
    setWorkerHTTP: (status, type = 'application/javascript') => { workerStatus = status; workerType = type; },
    setScriptFailure: value => { scriptFails = value; },
  };
}
test('SDK v16 uses a directory plus a filename, overrides Typical Website worker settings, and keeps both scopes separate', async () => {
  const app = pushHarness(); await app.preparePush('verified-user-id');
  const config = app.calls.init[0];
  assert.equal(config.path, '/super-day/push/');
  assert.equal(config.serviceWorkerPath, 'OneSignalSDKWorker.js');
  assert.equal(config.path + config.serviceWorkerPath, '/super-day/push/OneSignalSDKWorker.js');
  assert.equal(config.serviceWorkerParam.scope, '/super-day/push/');
  assert.equal(config.serviceWorkerOverrideForTypical, true);
  assert.equal(config.autoResubscribe, true);
  assert.equal(app.calls.login[0].length, 1); assert.equal(app.calls.login[0][0], 'verified-user-id');
  await app.preparePush('second-verified-user');
  assert.equal(app.calls.init.length, 1); assert.equal(app.calls.login[1][0], 'second-verified-user');
  await app.detachPush(); assert.equal(app.calls.optOut, 1); assert.equal(app.calls.logout, 1);
});
test('iPhone notification setup requires the installed PWA', async () => {
  const app = pushHarness({ installed: false });
  await assert.rejects(app.preparePush('verified-user-id'), /Màn hình chính/);
  assert.equal(app.calls.init.length, 0);
});
test('Native permission alone is not a registered device; a fresh click creates and verifies its token', async () => {
  const app = pushHarness(); await app.preparePush('user');
  const before = await app.inspectPush(app.sdk, 'user');
  assert.equal(before.permission, 'granted'); assert.equal(before.ready, false);
  assert.match(app.pushStateLabel(before), /chưa đăng ký/);
  const pending = app.registerPush(app.sdk, 'user', { timeoutMs: 40, pollMs: 1 });
  assert.equal(app.calls.permission, 1, 'native registration must start synchronously within the click gesture');
  const after = await pending;
  assert.equal(after.ready, true); assert.equal(after.tokenPresent, true); assert.equal(after.nativeTokenPresent, true); assert.equal(after.optedIn, true);
  assert.ok(app.calls.lookups.every(url => url === 'https://example.github.io/super-day/push/'));
  assert.equal(app.calls.login.at(-1)[0], 'user');
});
test('Never Subscribed with permission granted remains an error instead of a false success', async () => {
  const app = pushHarness(); await app.preparePush('user');
  app.sdk.User.PushSubscription.id = 'existing-id-with-no-token'; app.setRequest(async () => false);
  await assert.rejects(app.registerPush(app.sdk, 'user', { timeoutMs: 8, pollMs: 1 }), error => error.code === 'PUSH_NOT_READY' && error.pushDetails.tokenPresent === false && error.pushDetails.ready === false && /token=chưa/.test(error.message));
});
test('Registration waits for asynchronous SDK subscription/token updates', async () => {
  const app = pushHarness(); await app.preparePush('user');
  app.setRequest(async () => { app.native.present = true; return true; });
  let finished = false;
  const pending = app.registerPush(app.sdk, 'user', { timeoutMs: 500, pollMs: 1 }).then(info => { finished = true; return info; });
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(finished, false);
  app.sdk.User.PushSubscription.id = 'delayed-id'; app.sdk.User.PushSubscription.token = 'https://web.push.apple.com/delayed-token'; app.subscriptionEvents.emit('change');
  assert.equal((await pending).ready, true);
});
test('A PWA root registration cannot be mistaken for the OneSignal push registration', async () => {
  const app = pushHarness({ rootWorker: true }); await app.preparePush('user');
  await assert.rejects(app.registerPush(app.sdk, 'user', { timeoutMs: 8, pollMs: 1 }), error => error.code === 'PUSH_NOT_READY' && /Scope đang là/.test(error.message) && error.pushDetails.workerScript === '/super-day/sw.js');
});
test('Token/id without optedIn or without a native PushSubscription never enables test sends', async () => {
  const app = pushHarness(); await app.preparePush('user'); app.setOptOut(true);
  await assert.rejects(app.registerPush(app.sdk, 'user', { timeoutMs: 8, pollMs: 1 }), /optedIn=false/);
  app.sdk.User.PushSubscription.optedIn = true; app.native.present = false;
  assert.equal((await app.inspectPush(app.sdk, 'user')).ready, false);
  app.native.present = true; app.sdk.User.PushSubscription.token = '   ';
  assert.equal((await app.inspectPush(app.sdk, 'user')).ready, false);
});
test('Blocked notification permission gives actionable instructions and does not claim success', async () => {
  const app = pushHarness({ permission: 'denied' }); await app.preparePush('user');
  await assert.rejects(app.registerPush(app.sdk, 'user'), /Cài đặt iPhone/);
  assert.equal(app.calls.permission, 0);
});
test('Worker HTTP/MIME and SDK download failures are visible and recoverable', async () => {
  const missing = pushHarness({ workerStatus: 404 });
  await assert.rejects(missing.preparePush('user'), /HTTP 404/); assert.equal(missing.calls.init.length, 0);
  missing.setWorkerHTTP(200, 'text/html'); await assert.rejects(missing.preparePush('user'), /JavaScript/);
  missing.setWorkerHTTP(200); await missing.preparePush('user'); assert.equal(missing.calls.init.length, 1);
  const sdk = pushHarness(); sdk.setScriptFailure(true);
  await assert.rejects(sdk.preparePush('user'), /cdn.onesignal.com/);
  sdk.setScriptFailure(false); await sdk.preparePush('user'); assert.equal(sdk.calls.init.length, 1);
});
test('SDK change listeners refresh registration state and are removed on account changes', async () => {
  const app = pushHarness(); await app.preparePush('user'); let changes = 0;
  const stop = app.observePush(app.sdk, () => { changes++; });
  app.subscriptionEvents.emit('change'); app.notificationEvents.emit('permissionChange'); app.userEvents.emit('change');
  assert.equal(changes, 3); stop();
  app.subscriptionEvents.emit('change'); assert.equal(changes, 3);
  assert.equal(app.subscriptionEvents.count() + app.notificationEvents.count() + app.userEvents.count(), 0);
});
test('A registration attempt cannot relink a device after the Supabase account changes', async () => {
  const app = pushHarness(); await app.preparePush('user');
  await assert.rejects(app.registerPush(app.sdk, 'user', { isCurrentUser: () => false }), /Tài khoản đã thay đổi/);
  assert.equal(app.calls.login.length, 1);
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
