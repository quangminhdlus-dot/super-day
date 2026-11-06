export const FONT_OPTIONS = Object.freeze([
  { value: 'small', label: 'Nhỏ', scale: 0.9 },
  { value: 'medium', label: 'Vừa', scale: 1 },
  { value: 'large', label: 'Lớn', scale: 1.14 },
  { value: 'xlarge', label: 'Rất lớn', scale: 1.28 },
]);
const fallback = () => ({ fontSize: 'medium', updatedAt: 0, pending: false });
export const appearanceKey = userId => `super-day:appearance:${userId || 'demo'}`;
function normalized(value) {
  if (!value || !FONT_OPTIONS.some(option => option.value === (value.fontSize || value.font_size))) return null;
  const updatedAt = Number(value.updatedAt) || Date.parse(value.updated_at) || 0;
  return { fontSize: value.fontSize || value.font_size, updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0, pending: value.pending === true };
}
function stored(storage, key) { try { return normalized(JSON.parse(storage.getItem(key))); } catch { return null; } }
export function readAppearance(storage, user = null) {
  const local = stored(storage, appearanceKey(user?.id));
  const remote = normalized(user?.user_metadata?.super_day_appearance);
  if (local && (!remote || local.updatedAt >= remote.updatedAt)) return local;
  if (remote) return { ...remote, pending: false };
  return user ? fallback() : stored(storage, 'super-day:appearance:device') || fallback();
}
export function storeAppearance(storage, userId, preference) {
  try {
    storage.setItem(appearanceKey(userId), JSON.stringify(preference));
    storage.setItem('super-day:appearance:device', JSON.stringify(preference));
    return true;
  } catch { return false; }
}
export function applyAppearance(root, preference) {
  const option = FONT_OPTIONS.find(option => option.value === preference?.fontSize) || FONT_OPTIONS[1];
  if (!root) return;
  root.style.setProperty('--font-scale', String(option.scale));
  root.dataset.fontSize = option.value;
}
export async function saveAccountAppearance(auth, userId, preference) {
  const { data, error } = await auth.getSession();
  if (error) throw error;
  if (data.session?.user.id !== userId) throw Error('Tài khoản đã thay đổi.');
  const result = await auth.updateUser({ data: { super_day_appearance: { font_size: preference.fontSize, updated_at: new Date(preference.updatedAt).toISOString() } } });
  if (result.error) throw result.error;
  return result.data;
}
