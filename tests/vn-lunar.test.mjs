import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vietnameseLunar } from '../src/lib/vn-lunar.js';

test('Vietnamese lunar dates follow UTC+7, including New Year divergence and a leap month', () => {
  assert.deepEqual(vietnameseLunar('2007-02-17'), { day: 1, month: 1, year: 2007, leap: false });
  assert.deepEqual(vietnameseLunar('2026-02-17'), { day: 1, month: 1, year: 2026, leap: false });
  assert.deepEqual(vietnameseLunar('2025-07-25'), { day: 1, month: 6, year: 2025, leap: true });
  assert.equal(vietnameseLunar('2101-01-01'), null);
});
