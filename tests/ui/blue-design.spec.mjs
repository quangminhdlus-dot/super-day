import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/config.js', route => route.fulfill({
    contentType: 'text/javascript', body: 'window.SUPER_DAY_CONFIG = {};',
  }));
});

test('approved deep-blue navigation, borderless panels and square task check', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#0B1220');
  await expect(page.locator('.nav-item.active')).toHaveCSS('color', 'rgb(129, 185, 255)');
  await expect(page.locator('.panel').first()).toHaveCSS('border-top-width', '0px');

  const input = page.locator('[data-task="1"]');
  await input.fill('Việc quan trọng hôm nay');
  // Draft text is committed on blur; wait for its saved task before completing.
  await input.blur();
  await expect(page.locator('.task').first()).not.toHaveClass(/is-empty/);
  const tick = page.locator('[data-complete="1"]');
  await expect(tick).toBeEnabled();
  await expect(tick).toHaveCSS('border-top-left-radius', '0px');
  const before = await tick.evaluate(el => {
    const s = getComputedStyle(el, '::before');
    return { radius: s.borderTopLeftRadius, color: s.borderTopColor };
  });
  expect(before.radius).toBe('0px');
  await tick.click();
  await expect(tick).toHaveAttribute('aria-pressed', 'true');
  await expect(tick).toHaveCSS('color', 'rgb(38, 125, 255)');
  const selected = await tick.evaluate(el => {
    const s = getComputedStyle(el, '::before');
    return { radius: s.borderTopLeftRadius, color: s.borderTopColor };
  });
  expect(selected).toEqual({ radius: '0px', color: 'rgb(8, 102, 255)' });

  await page.locator('.sidebar [data-nav="settings"]').click();
  await expect(page.locator('.reminder-icon').first()).toHaveCSS('color', 'rgb(47, 130, 255)');
  await expect(page.locator('.font-option').first()).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
});
