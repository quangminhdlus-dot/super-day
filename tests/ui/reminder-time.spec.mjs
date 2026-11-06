import { test, expect } from '@playwright/test';
import { demoData, applyMutation } from '../../src/lib/domain.js';

test.beforeEach(async ({ page }) => {
  await page.route('**/config.js', route => route.fulfill({ contentType: 'text/javascript', body: 'window.SUPER_DAY_CONFIG = {};' }));
});

test('Selecting hours and minutes keeps the native input mounted and saves only on completion', async ({ page }) => {
  await page.goto('./?view=settings');
  const input = page.locator('[data-reminder-time="morning"]');
  await input.focus();
  const original = await input.elementHandle();
  for (const value of ['08:00', '08:15', '08:17']) {
    await original.evaluate((el, value) => {
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
    expect(await original.evaluate(el => el.isConnected)).toBe(true);
    await expect(input).toBeFocused();
    await expect(input).toHaveValue(value);
  }
  await input.blur();
  await page.reload();
  await expect(input).toHaveValue('08:17');
});

async function selectTime(page, kind, value, finish = true) {
  const input = page.locator(`[data-reminder-time="${kind}"]`);
  await input.focus();
  await input.evaluate((el, value) => {
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
  if (finish) await input.blur();
  return input;
}

async function accountFixture(page, timezone = 'Asia/Ho_Chi_Minh') {
  const data = demoData(); data.profile.timezone = timezone;
  const user = { id: '00000000-0000-4000-8000-000000000007', aud: 'authenticated', role: 'authenticated', email: 'owner@example.test', user_metadata: {}, app_metadata: {} };
  const token = ['eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9', Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'), 'fixture-signature'].join('.');
  const session = { access_token: token, refresh_token: 'fixture-only', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer', user };
  const attempts = [], applied = [], receipts = new Set();
  let offline = false, writeGate, readGate, reads = 0, finishedReads = 0, failures = 0;
  const hold = type => {
    let release;
    const promise = new Promise(resolve => { release = resolve; });
    if (type === 'reads') readGate = promise; else writeGate = promise;
    return () => { if (type === 'reads') readGate = null; else writeGate = null; release(); };
  };
  await page.route('**/config.js', route => route.fulfill({ contentType: 'text/javascript', body: 'window.SUPER_DAY_CONFIG = {supabaseUrl:"https://reminder-fixture.supabase.co",supabaseAnonKey:"fixture-anon"};' }));
  await page.route('https://reminder-fixture.supabase.co/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path === '/auth/v1/user' && request.method() === 'PUT') {
      const body = request.postDataJSON();
      expect(Object.keys(body.data)).toEqual(['super_day_appearance']);
      user.user_metadata = { ...user.user_metadata, ...body.data };
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(user) });
    }
    if (path === '/rest/v1/rpc/mutate') {
      const body = request.postDataJSON(); attempts.push(body);
      if (writeGate) await writeGate;
      if (offline) { failures++; return route.abort('internetdisconnected'); }
      if (!receipts.has(body.p_mutation_id)) {
        expect(body.p_kind).toBe('reminder');
        applyMutation(data, { kind: body.p_kind, payload: body.p_payload });
        receipts.add(body.p_mutation_id); applied.push(body);
      }
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data.reminders.find(r => r.kind === body.p_payload.kind)) });
    }
    if (path.startsWith('/rest/v1/')) {
      expect(request.method()).toBe('GET'); reads++;
      const body = structuredClone(({ profiles: [data.profile], days: data.days, tasks: data.tasks, reminder_settings: data.reminders })[path.split('/').at(-1)]);
      if (readGate) await readGate;
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
      finishedReads++; return;
    }
    throw Error(`Unexpected fixture request: ${request.method()} ${path}`);
  });
  await page.addInitScript(value => localStorage.setItem('super-day-auth', JSON.stringify(value)), session);
  await page.goto('./?view=settings');
  await expect(page.locator('[data-sync-status]')).toHaveText('Đã đồng bộ');
  await page.evaluate(() => document.fonts.ready);
  return { user, data, attempts, applied, hold, setOffline(value) { offline = value; }, get reads() { return reads; }, get finishedReads() { return finishedReads; }, get failures() { return failures; } };
}

for (const locale of ['vi-VN', 'en-US']) test.describe(locale, () => {
  test.use({ locale });
  test('All three schedules save precise wall times across AM/PM and midnight', async ({ page }) => {
    const fixture = await accountFixture(page);
    for (const kind of ['morning', 'noon', 'evening']) {
      for (const value of ['23:59', '00:00', '12:00', '00:01', '11:59', '13:05']) {
        const before = structuredClone(fixture.data.reminders);
        const requestCount = fixture.attempts.length;
        const input = await selectTime(page, kind, value, false);
        expect(fixture.attempts).toHaveLength(requestCount);
        await expect(input).toHaveValue(value);
        await input.press('Enter');
        await expect.poll(() => fixture.applied.length).toBe(requestCount + 1);
        expect(fixture.attempts).toHaveLength(requestCount + 1);
        expect(fixture.data.reminders.find(r => r.kind === kind).time).toBe(value);
        expect(fixture.data.reminders.filter(r => r.kind !== kind)).toEqual(before.filter(r => r.kind !== kind));
      }
    }
    await page.reload();
    for (const kind of ['morning', 'noon', 'evening']) await expect(page.locator(`[data-reminder-time="${kind}"]`)).toHaveValue('13:05');
    expect(fixture.data.profile.timezone).toBe('Asia/Ho_Chi_Minh');
  });
});

test('Incomplete, invalid and unchanged times never overwrite a saved schedule', async ({ page }) => {
  const fixture = await accountFixture(page);
  const before = structuredClone(fixture.data.reminders);
  for (const value of ['', '24:00', '12:60', '08:15:30', '06:00']) {
    await selectTime(page, 'morning', value);
    await expect(page.locator('[data-reminder-time="morning"]')).toHaveValue('06:00');
  }
  expect(fixture.attempts).toHaveLength(0);
  expect(fixture.data.reminders).toEqual(before);
});

test('A stale background response and a deferred repaint cannot close the picker or steal a navigation tap', async ({ page }) => {
  const fixture = await accountFixture(page);
  const readsBefore = fixture.reads;
  const releaseReads = fixture.hold('reads');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(() => fixture.reads).toBe(readsBefore + 4);
  const input = await selectTime(page, 'noon', '17:43', false);
  const original = await input.elementHandle();
  await input.evaluate(el => el.scrollIntoView({ behavior: 'instant', block: 'center' }));
  // Establish the baseline after native focus scrolling has reached its frame.
  // Font swaps and focus scrolling are separate from the background response.
  const scrollBefore = await page.evaluate(async () => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return window.scrollY;
  });
  releaseReads();
  await expect.poll(() => fixture.finishedReads).toBe(readsBefore + 4);
  await page.evaluate(async () => {
    window.dispatchEvent(new Event('online'));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  expect(await original.evaluate(el => el.isConnected)).toBe(true);
  await expect(input).toHaveValue('17:43');
  await expect(input).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
  expect(fixture.attempts).toHaveLength(0);
  await page.locator('.sidebar [data-nav="journey"]').click({ delay: 150 });
  await expect(page.locator('.sidebar [data-nav="journey"]')).toHaveAttribute('aria-current', 'page');
  await expect.poll(() => fixture.applied.length).toBe(1);
  await page.locator('.sidebar [data-nav="settings"]').click();
  await expect(page.locator('[data-reminder-time="noon"]')).toHaveValue('17:43');
});

test('Slow saves keep the latest choice visible and preserve the other schedules and timezone', async ({ page }) => {
  const fixture = await accountFixture(page, 'America/New_York');
  const otherSchedules = structuredClone(fixture.data.reminders.filter(r => r.kind !== 'evening'));
  const releaseWrite = fixture.hold('writes');
  await selectTime(page, 'evening', '05:07');
  await expect.poll(() => fixture.attempts.length).toBe(1);
  const input = await selectTime(page, 'evening', '23:59', false);
  const original = await input.elementHandle();
  releaseWrite();
  await expect.poll(() => fixture.applied.length).toBe(1);
  expect(await original.evaluate(el => el.isConnected)).toBe(true);
  await expect(input).toHaveValue('23:59');
  await page.locator('[data-reminder-done="evening"]').click();
  await expect.poll(() => fixture.applied.length).toBe(2);
  await expect(page.locator('[data-reminder-time="evening"]')).toHaveValue('23:59');
  await page.reload();
  await expect(page.locator('[data-reminder-time="evening"]')).toHaveValue('23:59');
  expect(fixture.data.reminders.filter(r => r.kind !== 'evening')).toEqual(otherSchedules);
  expect(fixture.data.profile.timezone).toBe('America/New_York');
});

test('Going to the background offline retains the final complete value and syncs it after reopening', async ({ page }) => {
  const fixture = await accountFixture(page);
  const before = structuredClone(fixture.data);
  fixture.setOffline(true);
  const releaseWrite = fixture.hold('writes');
  await selectTime(page, 'morning', '08:13');
  await expect.poll(() => fixture.attempts.length).toBe(1);
  const input = await selectTime(page, 'noon', '00:01', false);
  const original = await input.elementHandle();
  releaseWrite();
  await expect.poll(() => fixture.failures).toBe(1);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(page.locator('[data-sync-status]')).toHaveText('Đang chọn giờ…');
  expect(await original.evaluate(el => el.isConnected)).toBe(true);
  await expect(input).toHaveValue('00:01');
  expect(fixture.applied).toHaveLength(0);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
  const cacheKey = `super-day:account:${fixture.user.id}`;
  const cached = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), cacheKey);
  expect(cached.outbox).toHaveLength(2);
  expect(cached.data.reminders.find(r => r.kind === 'noon').time).toBe('00:01');
  await page.reload();
  await expect(page.locator('[data-reminder-time="morning"]')).toHaveValue('08:13');
  await expect(page.locator('[data-reminder-time="noon"]')).toHaveValue('00:01');
  fixture.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.locator('[data-sync-status]')).toHaveText('Đã đồng bộ');
  await expect.poll(() => fixture.applied.length).toBe(2);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).outbox.length, cacheKey)).toBe(0);
  const expected = structuredClone(before);
  expected.reminders.find(r => r.kind === 'morning').time = '08:13';
  expected.reminders.find(r => r.kind === 'noon').time = '00:01';
  expect(fixture.data).toEqual(expected);
});

test.describe('Mobile touch viewport', () => {
  test.use({ viewport: { width: 320, height: 700 }, isMobile: true, hasTouch: true });
  test('The native fields and Done buttons stay usable without zoom at every font size', async ({ page }) => {
    const fixture = await accountFixture(page);
    for (const [size, value] of [['small', '09:13'], ['medium', '15:47'], ['large', '23:59']]) {
      await page.locator(`button[data-font-size="${size}"]`).tap();
      for (const kind of ['morning', 'noon', 'evening']) {
        const input = await selectTime(page, kind, value, false);
        const original = await input.elementHandle();
        expect(await input.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
        const count = fixture.applied.length;
        expect(await original.evaluate(el => el.isConnected)).toBe(true);
        await page.locator(`[data-reminder-done="${kind}"]`).tap();
        await expect.poll(() => fixture.applied.length).toBe(count + 1);
        await expect(input).toHaveValue(value);
        const viewport = await page.evaluate(() => ({ scale: visualViewport.scale, width: document.documentElement.clientWidth, contentWidth: document.documentElement.scrollWidth }));
        expect(viewport.scale).toBe(1);
        expect(viewport.contentWidth).toBeLessThanOrEqual(viewport.width + 1);
      }
    }
    const input = await selectTime(page, 'evening', '00:01', false);
    await page.screenshot({ path: 'work/screenshots/time-editing-mobile.png', fullPage: true });
    await input.blur();
  });
});
