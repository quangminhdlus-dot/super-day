import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localDate, shiftDate, weekDates, monthDates, stats, outstanding, blankData, applyMutation } from '../src/lib/domain.js';
import { notificationContent, notificationUrl } from '../supabase/functions/_shared/notifications.js';

test('A new day follows account timezone, including year and DST boundaries', () => {
  assert.equal(localDate(new Date('2026-12-31T18:00:00Z')), '2027-01-01');
  assert.equal(localDate(new Date('2026-12-31T18:00:00Z'), 'America/New_York'), '2026-12-31');
  assert.equal(localDate(new Date('2026-03-08T07:05:00Z'), 'America/New_York'), '2026-03-08');
  assert.equal(shiftDate('2028-03-01', -1), '2028-02-29');
});
test('Weeks start on Monday and months include leap days', () => {
  assert.deepEqual(weekDates('2026-11-01'), ['2026-10-26','2026-10-27','2026-10-28','2026-10-29','2026-10-30','2026-10-31','2026-11-01']);
  assert.equal(monthDates('2028-02-20').length, 29);
});
test('Reports divide by actual created tasks, including days with fewer than three', () => {
  assert.deepEqual(stats([{ completed: true },{ completed: false }]), { total: 2, done: 1, remaining: 1, rate: 50 });
  assert.equal(stats([]).rate, 0);
});
test('Unfinished list shows only the current end of a carry chain', () => {
  const tasks = [{ id: 'a', completed: false }, { id: 'b', previous_task_id: 'a', completed: false }, { id: 'c', previous_task_id: 'b', completed: false }, { id: 'd', completed: true }];
  assert.deepEqual(outstanding(tasks).map(x => x.id), ['c']);
});
test('Pending patches replay without replacing another field or another day', () => {
  const data = blankData();
  applyMutation(data, { kind: 'task', payload: { id: 'a', date: '2026-11-06', slot: 1, patch: { title: 'Đọc sách' } } });
  applyMutation(data, { kind: 'task', payload: { date: '2026-11-06', slot: 1, patch: { completed: true } } });
  applyMutation(data, { kind: 'day', payload: { date: '2026-11-05', patch: { reflection: 'Một ngày bình yên' } } });
  assert.equal(data.tasks[0].title, 'Đọc sách'); assert.equal(data.tasks[0].completed, true);
  assert.equal(data.days[0].date, '2026-11-05');
});
test('Notification links retain the GitHub Pages subdirectory and correct destination', () => {
  assert.equal(notificationUrl('https://example.github.io/super-day/', 'evening'), 'https://example.github.io/super-day/?view=today&focus=reflection');
  assert.match(notificationContent('noon', 1, 2), /1\/2/);
  assert.doesNotMatch(notificationContent('morning'), /0\/3/);
});
