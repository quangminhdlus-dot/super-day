
import { devices, expect, test } from '@playwright/test';
import { DAILY_PLACES } from '../../src/lib/daily-places.js';
import { blankData } from '../../src/lib/domain.js';

const firstDay = new Date('2026-11-27T16:56:00Z');
const marker = 'super-day:opening:v1:';
test.use({
  viewport: devices['iPhone 16 Pro Max'].screen,
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 3,
});

test('full-screen opening breaks into fragments and stays seen across reloads, tabs and launches', async ({ page, context }, testInfo) => {
  await page.clock.setFixedTime(firstDay);
  await page.goto('./');
  const intro = page.locator('.daily-opening[open]');
  await expect(intro).toHaveAttribute('data-place', 'santorini');
  await expect(intro.getByRole('heading')).toHaveText('Santorini');
  await expect(intro.locator('.opening-keywords li')).toHaveCount(3);
  await expect(intro.getByRole('button')).toHaveCount(1);
  await expect(page.locator('#app')).toHaveAttribute('inert', '');
  expect(await page.evaluate(() => Boolean(document.elementFromPoint(220, 920)?.closest('.daily-opening')))).toBe(true);
  const box = await intro.boundingBox();
  expect(box).toEqual({ x: 0, y: 0, width: 440, height: 956 });
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe('hidden');
  expect(await page.evaluate(key => localStorage.getItem(key), marker + 'demo:2026-11-27')).toBeNull();
  if (process.env.SUPER_DAY_CAPTURE) {
    await page.screenshot({ path: testInfo.outputPath('iphone-16-pro-max-opening.png'), scale: 'css' });
  }

  await page.reload();
  await expect(intro).toHaveAttribute('data-place', 'santorini');
  const second = await context.newPage();
  await second.clock.setFixedTime(firstDay);
  await second.goto('./');
  await expect(second.locator('.daily-opening[open]')).toBeVisible();

  await page.bringToFront();
  await intro.getByRole('button').tap({ position: { x: 228, y: 595 } });
  await expect(intro).toHaveClass(/opening-is-breaking/);
  const canvas = intro.locator('canvas');
  await expect(canvas).toBeVisible();
  await expect.poll(async () => canvas.evaluate(node => {
    const ctx = node.getContext('2d');
    const { width, height } = node;
    if (width < 10 || height < 10) return false;
    const rgba = ctx.getImageData(0, 0, width, height).data;
    let transparent = 0;
    let colored = 0;
    for (let i = 3; i < rgba.length; i += 157 * 4) {
      if (rgba[i] < 10) transparent++;
      if (rgba[i] > 155) colored++;
    }
    return transparent > 10 && colored > 10;
  })).toBe(true);
  if (process.env.SUPER_DAY_CAPTURE && await intro.count()) {
    await page.screenshot({ path: testInfo.outputPath('iphone-16-pro-max-shatter.png'), scale: 'css', timeout: 2000 });
  }
  await expect(intro).toHaveCount(0);
  await expect(second.locator('.daily-opening[open]')).toHaveCount(0);
  await expect(page.locator('[data-task]')).toHaveCount(3);
  expect(await page.evaluate(key => localStorage.getItem(key), marker + 'demo:2026-11-27')).toBe('1');

  await page.reload();
  await expect(page.locator('[data-task]')).toHaveCount(3);
  await expect(intro).toHaveCount(0);
  await page.close();
  await second.reload();
  await expect(second.locator('[data-task]')).toHaveCount(3);
  await expect(second.locator('.daily-opening[open]')).toHaveCount(0);

  await second.clock.setFixedTime(new Date('2026-11-27T17:00:01Z'));
  await second.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  const next = second.locator('.daily-opening[open]');
  await expect(next).toHaveAttribute('data-date', '2026-11-28');
  await expect(next).toHaveAttribute('data-place', 'aoraki');
});

test('reduced motion goes straight to Today and a failed photograph never blocks it', async ({ page }) => {
  await page.clock.setFixedTime(firstDay);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  await expect(page.locator('.daily-opening[open]')).toBeVisible();
  await page.getByRole('button', { name: 'Mở Hôm nay' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.daily-opening')).toHaveCount(0);
  await expect(page.locator('[data-task]')).toHaveCount(3);

  await page.clock.setFixedTime(new Date('2026-11-28T17:01:00Z'));
  await page.route('**/photos/opening/*.webp', route => route.abort());
  const failure = page.waitForEvent('requestfailed', request => request.url().includes('machu-picchu'));
  await page.reload();
  await failure;
  await expect(page.locator('.daily-opening')).toHaveCount(0);
  await expect(page.locator('[data-task]')).toHaveCount(3);
  expect(await page.evaluate(key => localStorage.getItem(key), marker + 'demo:2026-11-29')).toBeNull();
});

test('the Vietnam date and separate account markers survive logout and sign-in', async ({ page }) => {
  const user = { id: '00000000-0000-4000-8000-000000000009', aud: 'authenticated', role: 'authenticated', email: 'owner@example.test', user_metadata: {}, app_metadata: {} };
  const validUntil = Math.floor(firstDay.valueOf() / 1000) + 7200;
  const token = ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ sub: user.id, exp: validUntil })).toString('base64url'), 'fixture'].join('.');
  const session = { access_token: token, refresh_token: 'fixture', expires_at: validUntil, expires_in: 7200, token_type: 'bearer', user };
  const fixture = blankData();
  fixture.profile.timezone = 'Asia/Tokyo';
  fixture.profile.display_name = 'Tài khoản thử';
  await page.clock.setFixedTime(firstDay); // Nov 27 in Vietnam, Nov 28 in Tokyo.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/config.js', route => route.fulfill({ contentType: 'text/javascript', body: 'window.SUPER_DAY_CONFIG={supabaseUrl:"https://opening-fixture.supabase.co",supabaseAnonKey:"fixture-anon"};' }));
  await page.route('https://opening-fixture.supabase.co/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/auth/v1/token') return route.fulfill({ json: session });
    if (path === '/auth/v1/user') return route.fulfill({ json: user });
    if (path === '/auth/v1/logout') return route.fulfill({ status: 204 });
    const tables = { profiles: [fixture.profile], days: [], tasks: [], reminder_settings: fixture.reminders };
    return route.fulfill({ json: tables[path.split('/').at(-1)] || [] });
  });
  await page.goto('./');
  const intro = page.locator('.daily-opening[open]');
  await expect(intro).toHaveAttribute('data-date', '2026-11-27');
  await intro.getByRole('button').tap();
  const signIn = async () => {
    await page.getByRole('button', { name: 'Mở tài khoản' }).tap();
    await page.locator('#login-email').fill(user.email);
    await page.locator('#login-password').fill('fixture-password');
    await page.locator('#password-login-form button[type=submit]').tap();
    await expect(page.locator('.topbar-avatar')).toHaveAttribute('title', 'Tài khoản thử');
  };
  await signIn();
  await expect(intro).toHaveAttribute('data-date', '2026-11-27');
  await expect(intro).toHaveAttribute('data-place', 'santorini');
  await intro.getByRole('button').tap();
  await page.locator('.sidebar [data-nav=settings]').tap();
  await page.locator('[data-action=logout]').tap();
  await expect(page.locator('.save-state')).toContainText('Bản trải nghiệm');
  await page.locator('.sidebar [data-nav=today]').tap();
  await signIn();
  await expect(intro).toHaveCount(0);
  expect(await page.evaluate(keys => keys.map(key => localStorage.getItem(key)), [
    marker + 'demo:2026-11-27', marker + 'account:' + user.id + ':2026-11-27',
  ])).toEqual(['1', '1']);
});

test('each place in the opening rotation has an image and a source', async ({ request }) => {
  expect(DAILY_PLACES).toHaveLength(8);
  expect(new Set(DAILY_PLACES.map(place => place.id)).size).toBe(8);
  for (const place of DAILY_PLACES) {
    expect(place.country).not.toBe('Việt Nam');
    expect(place.keywords).toHaveLength(3);
    expect(place.photo).toMatch(/^https:/);
    expect(place.license).toMatch(/^https:/);
    const res = await request.get('./' + place.image);
    expect(res.ok(), place.id).toBe(true);
    expect((await res.body()).toString('ascii', 8, 12)).toBe('WEBP');
  }
});
