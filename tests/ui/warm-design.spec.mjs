
import { test, expect } from './existing-app.mjs';

test.beforeEach(async ({ page }) => {
  await page.route('**/config.js', route => route.fulfill({
    contentType: 'text/javascript', body: 'window.SUPER_DAY_CONFIG = {};',
  }));
  await page.setViewportSize({ width: 440, height: 763 });
});

test('Daily photo uses local assets, stays stable during the day, and rotates at account midnight', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-27T16:59:10Z') });
  await page.goto('./');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#F6F3EC');
  await expect(page.locator('.mobile-brand')).toHaveText('superday');

  const card = page.locator('.world-photo');
  const image = card.getByRole('img');
  await expect(card).toHaveAttribute('data-world-date', '2026-11-27');
  await expect.poll(() => image.evaluate(el => el.naturalWidth)).toBeGreaterThan(0);
  const navTop = await page.locator('.sidebar').evaluate(el => el.getBoundingClientRect().top);
  const dailyControls = page.locator('.priorities .task-check, .priorities .progress-track');
  await expect(dailyControls).toHaveCount(4);
  for (const control of await dailyControls.all()) {
    expect(await control.evaluate(el => el.getBoundingClientRect().bottom)).toBeLessThan(navTop);
  }
  const original = await image.getAttribute('src');
  expect(original).toMatch(/^\.\/photos\/[\w-]+\.webp$/);
  await card.getByText('Về nơi này').click();
  await expect(card.getByRole('link', { name: 'Nguồn địa danh' })).toBeVisible();
  await expect(card.locator('.world-photo-credit a')).toHaveCount(3);
  await page.reload();
  await expect(image).toHaveAttribute('src', original);

  await page.clock.fastForward(61_000);
  await expect(card).toHaveAttribute('data-world-date', '2026-11-28');
  await expect(image).not.toHaveAttribute('src', original);
  await expect.poll(() => image.evaluate(el => el.naturalWidth)).toBeGreaterThan(0);
});

test('A missing photograph leaves a readable caption and the three daily inputs', async ({ page }) => {
  await page.route('**/photos/*.webp', route => route.abort());
  await page.goto('./');
  await expect(page.getByText('Ảnh chưa khả dụng')).toBeVisible();
  await expect(page.locator('.world-photo-place strong')).toBeVisible();
  await expect(page.locator('[data-task]')).toHaveCount(3);
});
