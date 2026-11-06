import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
test.beforeEach(async ({ page }) => {
  await page.route('**/config.js', route => route.fulfill({ contentType: 'text/javascript', body: 'window.SUPER_DAY_CONFIG = {};' }));
});
async function expectDefaultScale(page) {
  const viewport = await page.evaluate(() => ({ scale: visualViewport.scale, width: document.documentElement.clientWidth, contentWidth: document.documentElement.scrollWidth }));
  expect(viewport.scale).toBe(1);
  expect(viewport.contentWidth).toBeLessThanOrEqual(viewport.width + 1);
}
async function pinch(client, scaleFactor) {
  await client.send('Input.synthesizePinchGesture', { x: 195, y: 300, scaleFactor, relativeSpeed: 800, gestureSourceType: 'touch' });
}

test('Pinch in, pinch out and double tap keep all three screens at 100%', async ({ page, context }) => {
  const client = await context.newCDPSession(page);
  for (const view of ['today', 'journey', 'settings']) {
    await page.goto(`./?view=${view}`);
    await expect(page.locator(`.sidebar [data-nav="${view}"]`)).toHaveAttribute('aria-current', 'page');
    await pinch(client, 1.8);
    await expectDefaultScale(page);
    await pinch(client, 0.6);
    await expectDefaultScale(page);
    await client.send('Input.synthesizeTapGesture', { x: 150, y: 220, tapCount: 2, gestureSourceType: 'touch' });
    await expectDefaultScale(page);
  }
});

test('Safari gesture fallback preserves normal touch events, vertical scroll and text selection', async ({ page, context }) => {
  await page.goto('./');
  await expect(page.locator('[data-task="1"]')).toBeVisible();
  const prevented = await page.evaluate(() => Object.fromEntries(
    ['gesturestart', 'gesturechange', 'touchstart', 'touchmove', 'touchend', 'dblclick', 'selectstart', 'contextmenu', 'wheel'].map(name => {
      const event = new Event(name, { cancelable: true, bubbles: true });
      document.querySelector('[data-task="1"]').dispatchEvent(event);
      return [name, event.defaultPrevented];
    }),
  ));
  expect(prevented).toEqual({ gesturestart: true, gesturechange: true, touchstart: false, touchmove: false, touchend: false, dblclick: false, selectstart: false, contextmenu: false, wheel: false });
  const task = page.locator('[data-task="1"]');
  await task.fill('Nội dung có thể nhập và lựa chọn');
  expect(await task.evaluate(el => { el.select(); return el.value.slice(el.selectionStart, el.selectionEnd); })).toBe('Nội dung có thể nhập và lựa chọn');
  const client = await context.newCDPSession(page);
  await client.send('Input.synthesizeScrollGesture', { x: 380, y: 500, yDistance: -350, speed: 800, gestureSourceType: 'touch' });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await page.locator('.sidebar [data-nav="settings"]').tap();
  await expect(page.locator('.appearance-section')).toBeAttached();
  await expectDefaultScale(page);
});

test('Inputs and dialogs retain 100% scale at every font size', async ({ page, context }) => {
  // Enable the existing login UI with an empty session, without a real account.
  await page.route('**/config.js', route => route.fulfill({ contentType: 'text/javascript', body: 'window.SUPER_DAY_CONFIG = {supabaseUrl:"https://fixture.supabase.co",supabaseAnonKey:"fixture-anon"};' }));
  await page.route('https://fixture.supabase.co/**', route => route.abort());
  await page.goto('./?view=settings');
  await expect(page.locator('.demo-banner button')).toHaveText(/Đăng nhập/);
  const client = await context.newCDPSession(page);
  for (const size of ['small', 'medium', 'large', 'xlarge']) {
    await page.locator(`button[data-font-size="${size}"]`).tap();
    await page.locator('#display-name').fill('Tên của bạn');
    await expectDefaultScale(page);
    await page.locator('.topbar-avatar').tap();
    await expect(page.locator('#password-login-form')).toBeVisible();
    for (const selector of ['#login-email', '#login-password']) {
      const input = page.locator(selector);
      await input.tap();
      await input.fill(selector === '#login-email' ? 'owner@example.test' : 'fixture-password');
      expect(await input.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
      expect(await input.evaluate(el => getComputedStyle(el).touchAction)).toBe('pan-x pan-y');
      await expectDefaultScale(page);
    }
    await pinch(client, 1.8);
    await expectDefaultScale(page);
    await page.locator('#dialog [data-dialog-close]').tap();
    await expect(page.locator('#dialog')).not.toBeVisible();
  }
});
