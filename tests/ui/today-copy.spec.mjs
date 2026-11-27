import { test, expect } from './existing-app.mjs';

test.beforeEach(async ({ page }) => {
  await page.route('**/config.js', route => route.fulfill({
    contentType: 'text/javascript',
    body: 'window.SUPER_DAY_CONFIG = {};',
  }));
});

test('Hôm nay uses concise headings, a reflection placeholder, and keeps the day-end action', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./?view=today');

  await expect(page.locator('.page-heading')).not.toContainText(/Chào buổi (sáng|trưa|chiều|tối)/);
  await expect(page.locator('.page-heading')).not.toContainText('Chọn đúng việc. Làm đến cùng.');
  await expect(page.locator('.sidebar-note')).toHaveCount(0);
  await expect(page.locator('.priorities h2')).toHaveText('3 việc quan trọng');
  await expect(page.locator('.priorities')).not.toContainText('Ưu tiên của bạn');

  await expect(page.locator('.reflection h2')).toHaveText('Một chút nhìn lại');
  const reflection = page.locator('textarea[data-reflection]');
  await expect(reflection).toHaveAttribute('placeholder',
    'Hôm nay bạn cảm thấy như thế nào? Có điều gì khiến bạn suy nghĩ hoặc muốn ghi nhớ?');
  await expect(page.locator('.reflection-prompt')).toHaveCount(0);
  await expect(page.locator('.reflection')).not.toContainText('Một niềm vui nhỏ, một điều học được');
  await expect(page.locator('.end-day')).not.toContainText('Dành một khoảnh khắc');
  await expect(page.locator('.end-day [data-close-day]')).toHaveText(/Khép lại ngày/);

  // The removal only affects copy; data entry and day-end actions remain usable.
  await reflection.fill('Điều em muốn ghi nhớ hôm nay.');
  await reflection.blur();
  await page.locator('.end-day [data-close-day]').click();
  await expect(page.locator('.end-day [data-close-day]')).toHaveText(/Mở lại ngày/);
  await page.reload();
  await expect(page.locator('textarea[data-reflection]')).toHaveValue('Điều em muốn ghi nhớ hôm nay.');
  await expect(page.locator('.end-day [data-close-day]')).toHaveText(/Mở lại ngày/);
});

