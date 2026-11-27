import { test as base } from '@playwright/test';
export { expect } from '@playwright/test';

// Existing UI suites start after the preceding daily opening has already been seen.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      const ids = ['demo', 'account:00000000-0000-4000-8000-000000000001', 'account:00000000-0000-4000-8000-000000000007'];
      const days = new Set(['2026-11-27', '2026-11-28']);
      const now = Date.now();
      for (const delta of [-86400000, 0, 86400000]) days.add(new Date(now + delta).toISOString().slice(0, 10));
      for (const id of ids) for (const day of days) localStorage.setItem('super-day:opening:v1:' + id + ':' + day, '1');
    });
    await use(page);
  },
});
