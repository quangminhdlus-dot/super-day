import { test, expect } from './existing-app.mjs';

test.beforeEach(async ({ page }) => {
  await page.route('**/config.js', route => route.fulfill({
    contentType: 'text/javascript', body: 'window.SUPER_DAY_CONFIG = {};',
  }));
  await page.setViewportSize({ width: 440, height: 956 });
});

test('Today keeps the three editable tasks above their progress and navigation', async ({ page }) => {
  await page.setViewportSize({ width: 440, height: 763 });
  await page.goto('./');
  await expect(page.locator('.mobile-brand')).toHaveText('superday');
  await expect(page.locator('.greeting-name')).toContainText('bạn tập trung vào điều gì?');
  await expect(page.locator('.world-photo,.week-card')).toHaveCount(0);
  const navTop = await page.locator('.sidebar').evaluate(el => el.getBoundingClientRect().top);
  const dailyControls = page.locator('.priorities .task-check, .priorities .progress-track');
  await expect(dailyControls).toHaveCount(4);
  for (const control of await dailyControls.all()) {
    expect(await control.evaluate(el => el.getBoundingClientRect().bottom)).toBeLessThan(navTop);
  }
  const carry = page.locator('.attention-note');
  await carry.locator('summary').click();
  await carry.locator('[data-reason]').fill('Giữ lại lý do chuyển ngày.');
  await carry.locator('[data-reason]').blur();
  await page.reload();
  await carry.locator('summary').click();
  await expect(carry.locator('[data-reason]')).toHaveValue('Giữ lại lý do chuyển ngày.');
});

async function reachTwo(page) {
  for (const slot of [1, 2, 3]) {
    const field = page.locator('[data-task="' + slot + '"]');
    await field.fill('Việc quan trọng ' + slot);
    await field.blur();
    const check = page.locator('[data-complete="' + slot + '"]');
    if ((await check.getAttribute('aria-pressed') === 'true') !== (slot < 3)) await check.click();
  }
  await expect(page.getByRole('progressbar', { name: 'Tiến độ ba việc' })).toHaveAttribute('aria-valuenow', '2');
}

test('Third completion is distinct from closing the day, which celebrates once and persists', async ({ page }) => {
  await page.goto('./');
  await reachTwo(page);
  const close = page.locator('[data-close-day]');
  await close.click(); // The existing close rule still allows an unfinished day.
  await expect(close).toHaveText(/Mở lại ngày/);
  await expect(page.locator('.completed-message, [data-celebration="day"]')).toHaveCount(0);
  await close.click();
  await page.locator('[data-complete="3"]').click();
  await expect(page.getByRole('progressbar', { name: 'Tiến độ ba việc' })).toHaveAttribute('aria-valuenow', '3');
  await expect(page.locator('[data-celebration="task"] .celebration-particle')).toHaveCount(12);
  await expect(page.locator('.completed-message')).toHaveCount(0);
  await close.click();
  await expect(page.locator('[data-celebration="day"] .celebration-particle')).toHaveCount(28);
  await expect(page.getByRole('heading', { name: 'Một ngày trọn vẹn.' })).toBeVisible();
  await page.reload();
  await expect(page.locator('.celebration-layer')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Một ngày trọn vẹn.' })).toBeVisible();
  await expect(close).toHaveText(/Mở lại ngày/);
  await close.click();
  await close.click();
  await expect(page.getByRole('heading', { name: 'Một ngày trọn vẹn.' })).toBeVisible();
  await expect(page.locator('[data-celebration="day"]')).toHaveCount(0);
});

test('Reduced motion preserves the completed-day result without particle effects', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  await reachTwo(page);
  await page.locator('[data-complete="3"]').click();
  await page.locator('[data-close-day]').click();
  await expect(page.getByRole('heading', { name: 'Một ngày trọn vẹn.' })).toBeVisible();
  await expect(page.locator('.celebration-layer')).toHaveCount(0);
});

test('Journey shows totals calculated from saved task and note history', async ({ page }) => {
  const day = '2026-11-27';
  await page.clock.setFixedTime(new Date(day + 'T03:00:00Z'));
  await page.addInitScript(date => {
    localStorage.setItem('super-day:demo:v1', JSON.stringify({
      profile: { timezone: 'Asia/Ho_Chi_Minh', display_name: 'Bạn' },
      reminders: [], days: [{ date, reflection: 'Ghi chú thật trong dữ liệu thử.' }],
      tasks: [1, 2, 3].map(slot => ({ date, slot, id: 'fixture-' + slot, title: 'Công việc ' + slot, completed: slot < 3 })),
    }));
  }, day);
  await page.goto('./?view=journey');
  const overview = page.locator('.journey-overview');
  await expect(overview.getByRole('img')).toHaveAttribute('aria-label', 'Tỷ lệ hoàn thành: 67%');
  await expect(overview.locator('dd')).toHaveText(['3', '2', '1']);
  await expect(page.locator('.journal-list')).toContainText('Ghi chú thật trong dữ liệu thử.');
  await page.getByRole('button', { name: 'Theo tháng' }).click();
  await expect(page.locator('.calendar-day')).toHaveCount(30);
  await page.locator('.calendar-day.is-today').click();
  await expect(page.locator('[data-task="1"]')).toHaveValue('Công việc 1');
});
