import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import * as domain from '../src/lib/domain.js';
import * as passwordAuth from '../src/lib/auth.js';

const tick = () => new Promise(resolve => setTimeout(resolve, 15));
const source = (await readFile(new URL('../src/app.js', import.meta.url), 'utf8')).replace(/^import .*;\n/gm, '').replaceAll('import.meta.url', JSON.stringify('https://example.test/super-day/src/app.js'));

// Run the real app event handlers against a small DOM facade. This is not a visual/browser test.
async function appHarness({ signedIn = false, pushEnabled = false } = {}) {
  const user = { id: randomUUID(), email: 'owner@example.test' };
  const data = domain.blankData();
  data.profile.display_name = 'Tài khoản đang có';
  data.tasks.push({ id: randomUUID(), date: domain.localDate(), slot: 1, title: 'Công việc đã lưu', completed: false, carry_count: 0, reason: '' });
  data.days.push({ date: domain.localDate(), reflection: 'Nhật ký đã lưu', closed_at: null });
  const storage = new Map(), listeners = new Map(); let authListener, activeForm;
  const main = { innerHTML: '' }, toast = { textContent: '', classList: { add() {}, remove() {} } };
  const closeListeners = [];
  const dialog = {
    innerHTML: '', open: false,
    showModal() { this.open = true; },
    close() { if (this.open) { this.open = false; closeListeners.forEach(fn => fn()); } },
    addEventListener(name, fn) { if (name === 'close') closeListeners.push(fn); },
    querySelector(selector) { return activeForm && selector.split(',').some(s => s.trim() === '#' + activeForm.id) ? activeForm : null; },
    querySelectorAll() { return activeForm ? Object.values(activeForm.elements).filter(el => ['password', 'nonce'].includes(el.type)) : []; },
  };
  const document = {
    activeElement: null, hidden: false, visibilityState: 'visible',
    querySelector(selector) { return ({ '#app': main, '#dialog': dialog, '#toast': toast })[selector] || null; },
    querySelectorAll() { return []; }, getElementById() { return null; },
    addEventListener(name, fn) { const handlers = listeners.get(name) || []; handlers.push(fn); listeners.set(name, handlers); },
  };
  const calls = { login: [], update: [], reauth: 0, writes: 0, testPush: 0 };
  let pushFailure = null;
  let pushInfo = { permission: 'granted', sdkPermission: true, id: 'existing-no-token', tokenPresent: false, optedIn: false, linked: true, expectedScope: '/super-day/push/', workerScope: '/super-day/push/', workerScript: '/super-day/push/OneSignalSDKWorker.js', workerActive: true, nativeTokenPresent: false, ready: false };
  const pushSdk = { User: { PushSubscription: { id: 'existing-no-token', token: null, optedIn: false } } };
  const auth = {
    onAuthStateChange(fn) { authListener = fn; },
    async getSession() { return { data: { session: signedIn ? { user } : null }, error: null }; },
    async signInWithPassword(credentials) { calls.login.push(credentials); authListener('SIGNED_IN', { user }); return { data: { user, session: { user } }, error: null }; },
    async updateUser(attributes) { calls.update.push(attributes); authListener('USER_UPDATED', { user }); return { data: { user }, error: null }; },
    async reauthenticate() { calls.reauth++; return { error: null }; },
  };
  runInNewContext(source, {
    ...domain, ...passwordAuth, document, navigator: {},
    window: { addEventListener() {}, scrollTo() {} },
    location: { href: 'https://example.test/super-day/', origin: 'https://example.test' },
    history: { replaceState() {} },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    crypto: webcrypto, URL, Intl, Date, setTimeout, clearTimeout, setInterval() {}, requestAnimationFrame(fn) { fn(); },
    configured: true, config: { oneSignalAppId: pushEnabled ? 'test-app-id' : '' }, getClient: async () => ({ auth }), loadAccount: async () => structuredClone(data),
    mutate: async () => { calls.writes++; throw Error('Auth must not mutate application records'); },
    preparePush: async () => pushSdk, detachPush() {}, inspectPush: async () => ({ ...pushInfo }),
    observePush: () => () => {}, pushStateLabel: info => info?.ready ? 'REGISTERED' : 'PENDING', describePushError: error => error.message,
    registerPush: async (_sdk, _uid, { onProgress }) => {
      if (pushFailure) throw pushFailure;
      pushInfo = { ...pushInfo, id: 'valid-subscription-id', tokenPresent: true, optedIn: true, nativeTokenPresent: true, ready: true };
      onProgress({ ...pushInfo }); return { ...pushInfo };
    },
    edge: async action => { assert.equal(action, 'test'); calls.testPush++; return { accepted: true }; },
  });
  await tick();
  async function click(action) {
    const element = { disabled: false, dataset: { action }, hasAttribute: () => false };
    for (const handler of listeners.get('click') || []) await handler({ target: { closest: () => element } });
    await tick();
  }
  function form(id, values) {
    const message = { textContent: '' }, button = { disabled: false }, reauth = { hidden: true }, reauthButton = { disabled: false };
    const elements = Object.fromEntries(Object.entries(values).map(([name, value]) => [name, { value, type: name === 'nonce' ? 'nonce' : ['password', 'confirmation'].includes(name) ? 'password' : 'email', focus() {} }]));
    activeForm = { id, elements, querySelector: s => ({ '#auth-message': message, '#password-reauth': reauth, '[data-action="password-reauth"]': reauthButton, 'button[type="submit"]': button })[s], reset() { Object.values(elements).forEach(el => { el.value = ''; }); } };
    return { node: activeForm, message, button, reauth };
  }
  async function submit(form) {
    for (const handler of listeners.get('submit') || []) await handler({ target: form.node, preventDefault() {} });
    await tick();
  }
  return { auth, user, data, storage, calls, main, dialog, toast, click, form, submit, setPushFailure: error => { pushFailure = error; }, emit: async (event, session) => { authListener(event, session); await tick(); } };
}

test('Password login uses the existing account, preserves password spaces and clears inputs', async () => {
  const app = await appHarness();
  await app.click('login');
  assert.match(app.dialog.innerHTML, /autocomplete="current-password"/);
  assert.match(app.dialog.innerHTML, /autocomplete="username"/);
  const secret = ' ' + randomUUID() + ' ';
  const form = app.form('password-login-form', { email: ' owner@example.test ', password: secret });
  await app.submit(form);
  assert.equal(app.calls.login.length, 1);
  assert.equal(app.calls.login[0].email, app.user.email);
  assert.equal(app.calls.login[0].password, secret);
  assert.equal(form.node.elements.password.value, '');
  assert.equal(app.dialog.open, false);
  assert.match(app.main.innerHTML, /Công việc đã lưu/);
  assert.ok([...app.storage.values()].every(value => !value.includes(secret)));
  assert.equal(app.calls.writes, 0);
});

test('A signed-in user sets a password without changing account/data or closing the result on USER_UPDATED', async () => {
  const app = await appHarness({ signedIn: true });
  await app.click('account');
  assert.match(app.main.innerHTML, /Thiết lập hoặc thay đổi mật khẩu/);
  await app.click('change-password');
  const secret = randomUUID(), cacheBefore = app.storage.get('super-day:account:' + app.user.id);
  const form = app.form('password-change-form', { password: secret, confirmation: secret, nonce: '' });
  await app.submit(form);
  assert.equal(app.calls.update.length, 1);
  assert.deepEqual(Object.keys(app.calls.update[0]), ['password']);
  assert.equal(app.calls.update[0].password, secret);
  assert.equal(app.dialog.open, true);
  assert.match(form.message.textContent, /Đã cập nhật mật khẩu/);
  assert.equal(form.node.elements.password.value, '');
  assert.equal(form.node.elements.confirmation.value, '');
  assert.equal(app.storage.get('super-day:account:' + app.user.id), cacheBefore);
  assert.equal(app.calls.reauth, 0); // Normal updates must not send an email.
  assert.equal(app.calls.writes, 0);
  assert.ok([...app.storage.values()].every(value => !value.includes(secret)));
  await app.emit('TOKEN_REFRESHED', { user: app.user });
  assert.equal(app.dialog.open, true);
});

test('Password validation blocks mismatched/short values before calling Supabase', async () => {
  let updates = 0; const auth = { updateUser: async () => { updates++; } };
  const secret = randomUUID();
  await assert.rejects(passwordAuth.changePassword(auth, { password: secret, confirmation: randomUUID() }), { code: 'password_mismatch' });
  await assert.rejects(passwordAuth.changePassword(auth, { password: 'short', confirmation: 'short' }), { code: 'password_too_short' });
  assert.equal(updates, 0);
});

test('Supabase reauthentication is shown and only requested explicitly, then nonce is passed to updateUser', async () => {
  const app = await appHarness({ signedIn: true });
  await app.click('change-password');
  const secret = randomUUID(), nonce = '123456';
  const form = app.form('password-change-form', { password: secret, confirmation: secret, nonce: '' });
  const update = app.auth.updateUser;
  app.auth.updateUser = async attributes => attributes.nonce !== nonce
    ? { data: { user: null }, error: { code: 'reauthentication_needed' } }
    : update(attributes);
  await app.submit(form);
  assert.equal(form.reauth.hidden, false);
  assert.match(form.message.textContent, /xác thực lại/);
  assert.equal(app.calls.reauth, 0);
  assert.equal(app.calls.update.length, 0);
  await app.click('password-reauth');
  assert.equal(app.calls.reauth, 1);
  form.node.elements.nonce.value = nonce;
  await app.submit(form);
  assert.equal(app.calls.update[0].nonce, nonce);
  assert.equal(form.reauth.hidden, true);
  assert.equal(form.node.elements.nonce.value, '');
  assert.match(form.message.textContent, /Đã cập nhật mật khẩu/);
});

test('Invalid login remains actionable and errors do not expose server-supplied secrets', async () => {
  const app = await appHarness(); await app.click('login');
  const secret = randomUUID();
  app.auth.signInWithPassword = async () => ({ data: null, error: { code: 'invalid_credentials', message: secret } });
  const form = app.form('password-login-form', { email: app.user.email, password: secret });
  await app.submit(form);
  assert.match(form.message.textContent, /Email hoặc mật khẩu chưa đúng/);
  assert.equal(form.button.disabled, false);
  assert.equal(app.dialog.open, true);
  app.dialog.close();
  assert.equal(form.node.elements.password.value, '');
  assert.ok(!passwordAuth.passwordErrorMessage({ message: secret }, true).includes(secret));
  assert.ok([...app.storage.values()].every(value => !value.includes(secret)));
});


test('Settings and test-send handler reject permission-only devices until complete registration', async () => {
  const app = await appHarness({ signedIn: true, pushEnabled: true }); await app.click('account');
  assert.match(app.main.innerHTML, /data-action="test-push" disabled/);
  assert.match(app.main.innerHTML, /PENDING/);
  await app.click('test-push');
  assert.equal(app.calls.testPush, 0);
  assert.match(app.main.innerHTML, /Thiết bị chưa đăng ký đầy đủ/);
  const cached = app.storage.get('super-day:account:' + app.user.id);
  await app.click('enable-push');
  assert.match(app.main.innerHTML, /REGISTERED/);
  assert.doesNotMatch(app.main.innerHTML, /data-action="test-push" disabled/);
  assert.match(app.toast.textContent, /Đã có Push Token/);
  assert.equal(app.storage.get('super-day:account:' + app.user.id), cached);
  await app.click('test-push'); assert.equal(app.calls.testPush, 1);
});
test('A registration error remains visible in Settings without a success message or test send', async () => {
  const app = await appHarness({ signedIn: true, pushEnabled: true }); await app.click('account');
  app.setPushFailure(new Error('[PUSH_NOT_READY] Worker chưa tạo token'));
  await app.click('enable-push');
  assert.match(app.main.innerHTML, /PUSH_NOT_READY/);
  assert.match(app.main.innerHTML, /data-action="test-push" disabled/);
  assert.doesNotMatch(app.toast.textContent, /Đã có Push Token/);
  assert.equal(app.calls.testPush, 0);
});
