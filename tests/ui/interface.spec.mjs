import { test, expect } from '@playwright/test';
import { demoData } from '../../src/lib/domain.js';

test.beforeEach(async ({ page }) => {
  // Isolate layout tests from production accounts, OneSignal and private data.
  await page.route('**/config.js', route => route.fulfill({ contentType: 'text/javascript', body: 'window.SUPER_DAY_CONFIG = {};' }));
});
async function navigate(page, view) {
  await page.locator(`.sidebar [data-nav="${view}"]`).click();
  await expect(page.locator(`.sidebar [data-nav="${view}"]`)).toHaveAttribute('aria-current', 'page');
}
async function checkLayout(page) {
  const issues = await page.evaluate(() => {
    const viewport = document.documentElement.clientWidth, issues = [];
    if (document.documentElement.scrollWidth > viewport + 1) issues.push(`page overflow ${document.documentElement.scrollWidth}/${viewport}`);
    for (const el of document.querySelectorAll('input,textarea,select')) {
      if (!el.getClientRects().length) continue;
      if (parseFloat(getComputedStyle(el).fontSize) < 16) issues.push(`small input: ${el.id || el.dataset.reminderTime}`);
    }
    for (const el of document.querySelectorAll('.task-check,.nav-item,.toggle,.primary-button,.secondary-button,.topbar-avatar,.font-option,.icon-button')) {
      if (!el.getClientRects().length) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 43.9 || r.height < 43.9) issues.push(`small touch target: ${el.className} ${r.width}x${r.height}`);
    }
    for (const el of document.querySelectorAll('textarea[data-task],textarea[data-reason]')) {
      if (el.scrollHeight > el.clientHeight + 2) issues.push(`clipped text: ${el.id}`);
    }
    return issues;
  });
  expect(issues).toEqual([]);
}
for (const width of [320, 390, 430, 768, 1440]) {
  test(`Three screens fit at ${width}px in all four font sizes`, async ({ page }, _testInfo) => {
    await page.setViewportSize({ width, height: width >= 1024 ? 1000 : 844 });
    await page.goto('./');
    await page.evaluate(() => document.fonts.ready);
    for (const size of ['small', 'medium', 'large', 'xlarge']) {
      await navigate(page, 'settings');
      await page.locator(`button[data-font-size="${size}"]`).click();
      await expect(page.locator('html')).toHaveAttribute('data-font-size', size);
      await expect(page.locator(`button[data-font-size="${size}"]`)).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('.settings-section')).toHaveCount(4);
      await expect(page.locator('[data-reminder-time]')).toHaveCount(3);
      await checkLayout(page);
      await navigate(page, 'today');
      const task = page.locator('[data-task="1"]');
      await task.fill('Hoàn thành công việc quan trọng với một tiêu đề dài để kiểm tra đầy đủ dấu tiếng Việt và xuống dòng trên màn hình nhỏ');
      await page.locator('[data-task="2"]').focus(); // flush the edited title
      await checkLayout(page);
      if ([390, 1440].includes(width) && ['medium', 'xlarge'].includes(size)) {
        await page.screenshot({ path: `work/screenshots/today-${width}-${size}.png`, fullPage: true });
      }
      await navigate(page, 'journey');
      await checkLayout(page);
      await page.locator('[data-range="month"]').click();
      await checkLayout(page);
    }
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-font-size', 'xlarge');
  });
}
test('Task editing, completion and journal autosave survive navigation and reload', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.locator('[data-task="1"]').fill('Hoàn thành bản thiết kế Super Day');
  await page.locator('[data-reflection]').fill('Hôm nay đã tập trung vào ba điều quan trọng.');
  if (await page.locator('[data-complete="1"]').getAttribute('aria-pressed') === 'false') await page.locator('[data-complete="1"]').click();
  await expect(page.locator('[data-complete="1"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.progress-summary')).toContainText('/3 việc');
  await navigate(page, 'journey');
  await navigate(page, 'today');
  await page.reload();
  await expect(page.locator('[data-task="1"]')).toHaveValue('Hoàn thành bản thiết kế Super Day');
  await expect(page.locator('[data-complete="1"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-reflection]')).toHaveValue('Hôm nay đã tập trung vào ba điều quan trọng.');
  await navigate(page, 'settings');
  const toggle = page.locator('.toggle').first();
  const before = await toggle.getAttribute('aria-checked');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', before === 'true' ? 'false' : 'true');
  await page.reload();
  await expect(page.locator('.toggle').first()).toHaveAttribute('aria-checked', before === 'true' ? 'false' : 'true');
});
test('Font choice changes preview immediately while the page viewport stays at 100%', async ({ page }) => {
  await page.goto('./?view=settings');
  const preview = page.locator('.font-preview>p');
  const before = await preview.evaluate(el => parseFloat(getComputedStyle(el).fontSize));
  await page.locator('button[data-font-size="xlarge"]').click();
  expect(await preview.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThan(before);
  const viewport = await page.locator('meta[name=viewport]').getAttribute('content');
  expect(viewport).toMatch(/initial-scale=1/);
  expect(viewport).toMatch(/minimum-scale=1/);
  expect(viewport).toMatch(/maximum-scale=1/);
  expect(viewport).toMatch(/user-scalable=no/);
  expect(await page.locator('html').evaluate(el => getComputedStyle(el).touchAction)).toBe('pan-x pan-y');
  expect(await page.evaluate(() => visualViewport.scale)).toBe(1);
  await page.reload();
  await expect(page.locator('button[data-font-size="xlarge"]')).toHaveAttribute('aria-pressed', 'true');
});

test('An existing signed-in account keeps its data and saves font choice through Supabase metadata', async ({ page }) => {
  const data = demoData();
  data.profile.display_name = 'Quang Minh';
  const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'owner@example.test', user_metadata: {}, app_metadata: {} };
  const token = ['eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9', Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'), 'test-signature'].join('.');
  const session = { access_token: token, refresh_token: 'fixture-only', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer', user };
  const metadataWrites = [], applicationWrites = [];
  await page.route('**/config.js', route => route.fulfill({ contentType: 'text/javascript', body: 'window.SUPER_DAY_CONFIG = {supabaseUrl:"https://fixture.supabase.co",supabaseAnonKey:"fixture-anon"};' }));
  await page.route('https://fixture.supabase.co/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    let body;
    if (path === '/auth/v1/user') {
      if (request.method() === 'PUT') {
        const update = request.postDataJSON(); metadataWrites.push(update);
        user.user_metadata = { ...user.user_metadata, ...update.data };
      }
      body = user;
    } else if (path.startsWith('/rest/v1/')) {
      if (request.method() !== 'GET') applicationWrites.push(request.postDataJSON());
      body = ({ profiles: [data.profile], days: data.days, tasks: data.tasks, reminder_settings: data.reminders })[path.split('/').at(-1)] || [];
    } else throw Error(`Unexpected fixture request: ${request.method()} ${path}`);
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.addInitScript(value => localStorage.setItem('super-day-auth', JSON.stringify(value)), session);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await expect(page.locator('.greeting-name')).toContainText('Quang Minh');
  await expect(page.locator('[data-sync-status]')).toHaveText('Đã đồng bộ');
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: 'work/screenshots/account-today-390.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await checkLayout(page);
  await page.screenshot({ path: 'work/screenshots/account-today-1440.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await navigate(page, 'journey');
  await page.screenshot({ path: 'work/screenshots/account-journey-390.png', fullPage: true });
  await navigate(page, 'settings');
  await expect(page.locator('[data-action="change-password"]')).toBeVisible();
  await page.screenshot({ path: 'work/screenshots/account-settings-390.png', fullPage: true });
  await page.locator('button[data-font-size="xlarge"]').click();
  await expect.poll(() => metadataWrites.length).toBe(1);
  expect(metadataWrites[0]).not.toHaveProperty('email');
  expect(metadataWrites[0]).not.toHaveProperty('password');
  expect(Object.keys(metadataWrites[0].data)).toEqual(['super_day_appearance']);
  expect(metadataWrites[0].data.super_day_appearance.font_size).toBe('xlarge');
  await expect.poll(() => page.evaluate(uid => JSON.parse(localStorage.getItem(`super-day:appearance:${uid}`)).pending, user.id)).toBe(false);
  await checkLayout(page);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-font-size', 'xlarge');
  await expect(page.locator('[data-action="change-password"]')).toBeVisible();
  await navigate(page, 'today');
  await expect(page.locator('[data-task="1"]')).toHaveValue(data.tasks[0].title);
  expect(applicationWrites).toEqual([]);
});
