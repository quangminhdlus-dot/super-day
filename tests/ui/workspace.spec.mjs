import { expect, test } from './existing-app.mjs';

const FIXED_DATE = '2026-11-28';
const time = new Date(FIXED_DATE + 'T01:58:00Z');
test.use({ viewport: { width: 440, height: 956 }, isMobile: true, hasTouch: true });

test.beforeEach(async ({ page }) => {
  await page.route('**/config.js', route => route.fulfill({ contentType: 'text/javascript', body: 'window.SUPER_DAY_CONFIG = {};' }));
  await page.clock.install({ time });
});
const nav = (page, id) => page.locator('.sidebar [data-nav="' + id + '"]');
const modal = page => page.locator('#dialog');
const save = page => modal(page).getByRole('button', { name: 'Lưu', exact: true }).click();

test('Journey is primary, Calendar is secondary, and settings returns to the current view', async ({ page }) => {
  await page.goto('./?view=today');
  await expect(page.getByRole('navigation').getByRole('button')).toHaveText(['Hôm nay', 'Hành trình', 'Giai đoạn', 'Ý tưởng']);
  await nav(page, 'journey').tap();
  await expect(page.locator('.journey-overview')).toBeVisible();
  await expect(page.locator('.workspace-calendar')).toHaveCount(0);
  await page.getByRole('group', { name: 'Chế độ Hành trình' }).getByText('Lịch', { exact: true }).tap();
  await expect(page).toHaveURL(/view=journey&panel=calendar/);
  await expect(nav(page, 'journey')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.lunar-grid')).toBeVisible();
  await expect(page.locator('.agenda')).toContainText('Âm lịch 20/10/2026');
  await page.getByRole('button', { name: 'Mở cài đặt' }).tap();
  await expect(page.locator('.settings-heading')).toHaveText('Cài đặt');
  await page.getByRole('button', { name: 'Đóng cài đặt' }).tap();
  await expect(page.locator('.workspace-calendar')).toBeVisible();
  await page.reload();
  await expect(page.locator('.lunar-grid')).toBeVisible();
  await page.getByRole('group', { name: 'Kiểu lịch' }).getByText('Tuần', { exact: true }).tap();
  await expect(page.locator('.lunar-cell')).toHaveCount(7);
  await page.getByRole('group', { name: 'Kiểu lịch' }).getByText('Ngày', { exact: true }).tap();
  await expect(page.locator('.lunar-grid')).toHaveCount(0);
  await expect(page.locator('.agenda')).toContainText('Từ Hôm nay');
});

test('A calendar event opens at its time, snoozes and stays acknowledged after reload', async ({ page }) => {
  await page.goto('./?view=journey&panel=calendar');
  await expect(page.locator('.agenda')).toContainText('Chưa có sự kiện');
  await page.getByRole('button', { name: 'Thêm lịch trình' }).tap();
  await modal(page).getByLabel('Tên', { exact: true }).fill('Họp dự án');
  await modal(page).getByLabel('Giờ Việt Nam').fill('09:00');
  await modal(page).getByLabel('Nhắc trong ứng dụng').check();
  await save(page);
  await expect(page.locator('.agenda')).toContainText('Họp dự án');
  await page.reload();
  await expect(page.locator('.agenda')).toContainText('09:00');
  await page.clock.fastForward(127_000);
  await expect(modal(page).getByRole('heading', { name: 'Đã đến giờ!' })).toBeVisible();
  await modal(page).getByRole('button', { name: '5 phút', exact: true }).click();
  await expect(modal(page)).not.toBeVisible();
  await page.clock.fastForward(307_000);
  await expect(modal(page)).toContainText('Họp dự án');
  await modal(page).getByRole('button', { name: 'Đã xem' }).click();
  await page.reload();
  await page.clock.fastForward(60_000);
  await expect(modal(page)).not.toBeVisible();
  await expect(page.locator('.event-bell')).toHaveAttribute('title', 'Đã xác nhận');
});

test('A phase keeps checked goals and recalculates progress after editing', async ({ page }) => {
  await page.goto('./?view=phases');
  await expect(page.getByRole('heading', { name: 'Chưa có giai đoạn' })).toBeVisible();
  await page.getByRole('button', { name: 'Thêm giai đoạn' }).tap();
  await modal(page).getByLabel('Tên', { exact: true }).fill('Chuẩn bị ra mắt');
  await modal(page).getByLabel('Mục tiêu (mỗi dòng một việc)').fill('Viết đề cương\nĐọc lại');
  await save(page);
  const progress = page.getByRole('progressbar', { name: 'Tiến độ Chuẩn bị ra mắt' });
  await expect(progress).toHaveAttribute('aria-valuenow', '0');
  await page.getByRole('button', { name: 'Viết đề cương' }).tap();
  await expect(progress).toHaveAttribute('aria-valuenow', '50');
  await page.getByRole('button', { name: 'Chỉnh sửa' }).tap();
  await modal(page).getByLabel('Mục tiêu (mỗi dòng một việc)').fill('Viết đề cương\nĐọc lại\nChốt thời gian');
  await save(page);
  await page.reload();
  await expect(progress).toHaveAttribute('aria-valuenow', '33');
  await expect(page.getByRole('button', { name: 'Viết đề cương' })).toHaveAttribute('aria-pressed', 'true');
});

test('Ideas can be added, searched, starred and removed with confirmation', async ({ page }) => {
  await page.goto('./?view=ideas');
  await expect(page.getByRole('heading', { name: 'Chưa có ý tưởng' })).toBeVisible();
  await page.getByRole('button', { name: 'Thêm ý tưởng' }).tap();
  await modal(page).getByLabel('Tên', { exact: true }).fill('Thử điều mới');
  await modal(page).getByLabel('Chủ đề').selectOption('Sản phẩm');
  await modal(page).getByLabel('Nội dung').fill('Làm bản nháp trong tuần.');
  await save(page);
  const card = page.locator('.idea-card');
  await expect(card).toContainText('Thử điều mới');
  await card.getByRole('button', { name: 'Đánh dấu sao' }).tap();
  await page.reload();
  await expect(card.getByRole('button', { name: 'Đánh dấu sao' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('searchbox', { name: 'Tìm ý tưởng' }).fill('không trùng');
  await expect(page.getByRole('heading', { name: 'Không tìm thấy ý tưởng' })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Tìm ý tưởng' }).fill('bản nháp');
  await card.locator('.idea-link').tap();
  await modal(page).getByRole('button', { name: 'Xóa', exact: true }).tap();
  await expect(modal(page).getByRole('heading', { name: 'Xóa mục này?' })).toBeVisible();
  await modal(page).getByRole('button', { name: 'Xóa', exact: true }).tap();
  await expect(page.getByRole('heading', { name: 'Chưa có ý tưởng' })).toBeVisible();
});

test('New records are isolated from a signed-in account and reappear on sign-out', async ({ page }) => {
  const id = '00000000-0000-4000-8000-000000000079';
  const user = { id, aud: 'authenticated', role: 'authenticated', email: 'owner@example.test', user_metadata: {}, app_metadata: {} };
  const expiry = Math.floor(time.getTime() / 1000) + 3600;
  const token = ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ sub: id, exp: expiry })).toString('base64url'), 'fixture'].join('.');
  const session = { access_token: token, refresh_token: 'fixture', expires_at: expiry, expires_in: 3600, token_type: 'bearer', user };
  await page.route('**/config.js', route => route.fulfill({ contentType: 'text/javascript', body: 'window.SUPER_DAY_CONFIG={supabaseUrl:"https://workspace-fixture.supabase.co",supabaseAnonKey:"fixture-anon"};' }));
  await page.route('https://workspace-fixture.supabase.co/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/auth/v1/token') return route.fulfill({ json: session });
    if (path === '/auth/v1/user') return route.fulfill({ json: user });
    if (path === '/auth/v1/logout') return route.fulfill({ status: 204 });
    if (path === '/rest/v1/profiles') return route.fulfill({ json: [{ timezone: 'Asia/Ho_Chi_Minh', display_name: 'Tài khoản thử' }] });
    return route.fulfill({ json: [] });
  });
  await page.goto('./?view=ideas');
  const add = async name => {
    await page.getByRole('button', { name: 'Thêm ý tưởng' }).tap();
    await modal(page).getByLabel('Tên', { exact: true }).fill(name);
    await save(page);
  };
  await add('Ý tưởng bản trải nghiệm');
  await page.getByRole('button', { name: 'Mở cài đặt' }).tap();
  await page.locator('.account-section [data-action=login]').tap();
  await modal(page).getByLabel('Email của bạn').fill(user.email);
  await modal(page).getByLabel('Mật khẩu', { exact: true }).fill('fixture-password');
  await modal(page).locator('button[type=submit]').tap();
  await expect(page.locator('.profile-email')).toContainText(user.email);
  await nav(page, 'ideas').tap();
  await expect(page.getByRole('heading', { name: 'Chưa có ý tưởng' })).toBeVisible();
  await add('Ý tưởng tài khoản');
  await page.getByRole('button', { name: 'Mở cài đặt' }).tap();
  await page.getByRole('button', { name: 'Đăng xuất' }).tap();
  await expect(page.locator('.profile-email')).toContainText('Chưa đăng nhập');
  await nav(page, 'ideas').tap();
  await expect(page.locator('.idea-card')).toHaveText(/Ý tưởng bản trải nghiệm/);
  await expect(page.locator('.idea-card')).not.toContainText('Ý tưởng tài khoản');
});
