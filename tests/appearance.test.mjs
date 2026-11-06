import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FONT_OPTIONS, appearanceKey, readAppearance, storeAppearance, applyAppearance, saveAccountAppearance } from '../src/lib/appearance.js';

function memory() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
test('Font size defaults to Trung bình and only applies the three supported scales', () => {
  const storage = memory();
  assert.deepEqual(FONT_OPTIONS.map(option => option.label), ['Nhỏ', 'Trung bình', 'Lớn']);
  assert.equal(readAppearance(storage).fontSize, 'medium');
  storage.setItem(appearanceKey('a'), '{broken');
  assert.equal(readAppearance(storage, { id: 'a' }).fontSize, 'medium');
  const root = { dataset: {}, style: { setProperty(name, value) { this[name] = value; } } };
  for (const option of FONT_OPTIONS) {
    applyAppearance(root, { fontSize: option.value });
    assert.equal(root.style['--font-scale'], String(option.scale));
    assert.equal(root.dataset.fontSize, option.value);
  }
  applyAppearance(root, { fontSize: 'unsupported' });
  assert.equal(root.style['--font-scale'], '1');
});
test('Local font preferences stay separate for each account and survive offline', () => {
  const storage = memory();
  storeAppearance(storage, 'a', { fontSize: 'large', updatedAt: 200, pending: true });
  storeAppearance(storage, 'b', { fontSize: 'small', updatedAt: 300, pending: false });
  assert.equal(readAppearance(storage, { id: 'a' }).fontSize, 'large');
  assert.equal(readAppearance(storage, { id: 'a' }).pending, true);
  assert.equal(readAppearance(storage, { id: 'b' }).fontSize, 'small');
  assert.equal(readAppearance(storage, { id: 'new-account' }).fontSize, 'medium');
  assert.equal(readAppearance(storage).fontSize, 'small');
  assert.equal(storeAppearance({ setItem() { throw Error('Quota'); } }, 'a', {}), false);
});
test('The newest account preference wins without overwriting a newer offline choice', () => {
  const storage = memory();
  const user = { id: 'a', user_metadata: { super_day_appearance: { font_size: 'xlarge', updated_at: new Date(400).toISOString() } } };
  storeAppearance(storage, 'a', { fontSize: 'large', updatedAt: 200, pending: true });
  assert.deepEqual(readAppearance(storage, user), { fontSize: 'large', updatedAt: 400, pending: false });
  storeAppearance(storage, 'a', { fontSize: 'small', updatedAt: 500, pending: true });
  assert.equal(readAppearance(storage, user).fontSize, 'small');
  assert.equal(readAppearance(storage, user).pending, true);
});
test('Legacy Rất lớn becomes Lớn locally and in account metadata without resetting other preferences', () => {
  const storage = memory();
  const old = { fontSize: 'xlarge', updatedAt: 600, pending: true };
  storage.setItem(appearanceKey('a'), JSON.stringify(old));
  storage.setItem('super-day:appearance:device', JSON.stringify(old));
  assert.deepEqual(readAppearance(storage, { id: 'a' }), { ...old, fontSize: 'large' });
  assert.deepEqual(readAppearance(storage), { ...old, fontSize: 'large' });
  const user = { id: 'b', user_metadata: { untouched: 'keep', super_day_appearance: { font_size: 'xlarge', updated_at: new Date(700).toISOString() } } };
  const before = structuredClone(user);
  assert.deepEqual(readAppearance(storage, user), { fontSize: 'large', updatedAt: 700, pending: false });
  assert.deepEqual(user, before);
  assert.equal(readAppearance(storage, { id: 'new-account' }).fontSize, 'medium');
  storeAppearance(storage, 'a', readAppearance(storage, { id: 'a' }));
  assert.equal(JSON.parse(storage.getItem(appearanceKey('a'))).fontSize, 'large');
  const root = { dataset: {}, style: { setProperty(name, value) { this[name] = value; } } };
  applyAppearance(root, old);
  assert.equal(root.dataset.fontSize, 'large');
  assert.equal(root.style['--font-scale'], '1.14');
});
test('Cloud appearance sync updates only metadata of the currently authenticated account', async () => {
  const writes = [];
  const auth = {
    getSession: async () => ({ data: { session: { user: { id: 'a' } } }, error: null }),
    updateUser: async attributes => { writes.push(attributes); return { data: { user: { id: 'a' } }, error: null }; },
  };
  await saveAccountAppearance(auth, 'a', { fontSize: 'large', updatedAt: 500 });
  assert.deepEqual(writes, [{ data: { super_day_appearance: { font_size: 'large', updated_at: new Date(500).toISOString() } } }]);
  await assert.rejects(saveAccountAppearance(auth, 'another-account', { fontSize: 'small', updatedAt: 600 }));
  assert.equal(writes.length, 1);
  auth.updateUser = async () => ({ error: Error('Offline') });
  await assert.rejects(saveAccountAppearance(auth, 'a', { fontSize: 'large', updatedAt: 500 }), /Offline/);
});
