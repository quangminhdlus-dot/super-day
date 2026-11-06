import { blankData } from './domain.js';
const config = window.SUPER_DAY_CONFIG || {};
export const configured = Boolean(config.supabaseUrl && config.supabaseAnonKey);
let client;
export async function getClient() {
  if (!configured) throw Error('Ứng dụng chưa được kết nối Supabase.');
  if (!client) {
    // Official Supabase SDK, loaded only for real accounts. No custom authentication system.
    const { createClient } = await import('../../vendor/supabase.js');
    client = createClient(config.supabaseUrl, config.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'super-day-auth' } });
  }
  return client;
}
async function rows(table) {
  const db = await getClient(); let result = [];
  for (let start = 0; ; start += 500) {
    const { data, error } = await db.from(table).select('*').order(table === 'profiles' ? 'id' : table === 'reminder_settings' ? 'kind' : 'date').range(start, start + 499);
    if (error) throw error; result.push(...data); if (data.length < 500) return result;
  }
}
export async function loadAccount() {
  const [profiles, days, tasks, reminders] = await Promise.all(['profiles', 'days', 'tasks', 'reminder_settings'].map(rows));
  return { profile: profiles[0] || blankData().profile, days, tasks, reminders };
}
export async function mutate(op) {
  const db = await getClient(); const { data, error } = await db.rpc('mutate', { p_mutation_id: op.id, p_kind: op.kind, p_payload: op.payload });
  if (error) throw error; return data;
}
export async function edge(action) {
  const db = await getClient(); const { data, error } = await db.functions.invoke('reminders', { body: { action } });
  if (error || data?.error) {
    let message = data?.error;
    if (!message && error?.context) try { message = (await error.context.json()).error; } catch {}
    throw Error(message || 'Chưa thể kết nối hệ thống thông báo. Kiểm tra cấu hình và thử lại.');
  }
  return data;
}
export { config };
