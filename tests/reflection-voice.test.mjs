import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeReflection, chooseLightPolish } from '../src/lib/reflection-voice.js';

test('voice insertion preserves existing diary text and cursor position', () => {
  const merged = mergeReflection('Hôm nay tốt.', 'Tôi muốn học thêm.', 4);
  assert.equal(merged.value, 'Hôm Tôi muốn học thêm.\nnay tốt.');
  assert.equal(merged.value.slice(merged.start, merged.end), 'Tôi muốn học thêm.');
});
test('voice insertion appends safely if text has no cursor', () => {
  const merged = mergeReflection('Đã có nội dung', 'Thêm từ ghi âm');
  assert.equal(merged.value, 'Đã có nội dung\nThêm từ ghi âm');
});
test('light polish accepts punctuation and rejects major rewriting', () => {
  assert.equal(chooseLightPolish('hôm nay tôi đã làm được 3 việc', 'Hôm nay, tôi đã làm được 3 việc.'), 'Hôm nay, tôi đã làm được 3 việc.');
  assert.equal(chooseLightPolish('Hôm nay tôi làm được ba việc quan trọng và cảm thấy bình an', 'Một ngày tuyệt vời đầy ý nghĩa!'), 'Hôm nay tôi làm được ba việc quan trọng và cảm thấy bình an');
});
