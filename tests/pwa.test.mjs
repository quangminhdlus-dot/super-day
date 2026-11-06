import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
const worker = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
function harness() {
  const handlers = new Map(), calls = { urls: [], deleted: [], skipped: false, claimed: false, puts: [] };
  const self = { location: { href: 'https://example.github.io/super-day/sw.js' }, addEventListener: (name, fn) => handlers.set(name, fn), skipWaiting: async () => { calls.skipped = true; }, clients: { claim: async () => { calls.claimed = true; } } };
  runInNewContext(worker, {
    self, URL,
    caches: { open: async () => ({ addAll: async urls => { calls.urls.push(...urls); }, put: async key => { calls.puts.push(key); } }), keys: async () => ['super-day-shell-old', 'super-day-shell-dev', 'other-app-cache'], delete: async name => { calls.deleted.push(name); }, match: async () => undefined },
    fetch: async () => new Response('current release'),
  });
  return { handlers, calls };
}
test('PWA caches versioned modules including password/push and activates without closing every tab', async () => {
  const app = harness(); let pending;
  app.handlers.get('install')({ waitUntil(value) { pending = value; } }); await pending;
  assert.ok(app.calls.urls.includes('https://example.github.io/super-day/src/app.js?v=dev'));
  assert.ok(app.calls.urls.includes('https://example.github.io/super-day/src/lib/auth.js?v=dev'));
  assert.ok(app.calls.urls.includes('https://example.github.io/super-day/src/lib/push.js?v=dev'));
  assert.ok(app.calls.urls.includes('https://example.github.io/super-day/config.js'));
  assert.equal(app.calls.skipped, true);
  app.handlers.get('activate')({ waitUntil(value) { pending = value; } }); await pending;
  assert.deepEqual(app.calls.deleted, ['super-day-shell-old']);
  assert.equal(app.calls.claimed, true);
});
test('PWA never intercepts the separate push worker or private Supabase requests', () => {
  const app = harness();
  for (const url of ['https://example.github.io/super-day/push/OneSignalSDKWorker.js', 'https://example.supabase.co/rest/v1/tasks']) {
    app.handlers.get('fetch')({ request: { method: 'GET', url }, respondWith() { assert.fail('Must not intercept this request'); } });
  }
});
