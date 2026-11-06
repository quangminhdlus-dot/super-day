export const DEFAULT_ZONE = 'Asia/Ho_Chi_Minh';
export function localDate(now = new Date(), zone = DEFAULT_ZONE) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
export function shiftDate(date, n) { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
export function dateLabel(date, options = {}) { return new Intl.DateTimeFormat('vi-VN', { timeZone: 'UTC', day: 'numeric', month: 'long', ...options }).format(new Date(date + 'T12:00:00Z')); }
export function weekDates(date) { const day = new Date(date + 'T12:00:00Z').getUTCDay(); const start = shiftDate(date, -(day === 0 ? 6 : day - 1)); return Array.from({ length: 7 }, (_, i) => shiftDate(start, i)); }
export function monthDates(date) { const first = date.slice(0, 7) + '-01'; const days = new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7), 0)).getUTCDate(); return Array.from({ length: days }, (_, i) => shiftDate(first, i)); }
export function stats(tasks) { const done = tasks.filter(t => t.completed).length; return { total: tasks.length, done, remaining: tasks.length - done, rate: tasks.length ? Math.round(done / tasks.length * 100) : 0 }; }
export function outstanding(tasks) { const parents = new Set(tasks.map(t => t.previous_task_id).filter(Boolean)); return tasks.filter(t => !t.completed && !parents.has(t.id)); }
export function blankData() { return { profile: { display_name: '', timezone: DEFAULT_ZONE }, days: [], tasks: [], reminders: [{ kind: 'morning', time: '06:00', enabled: true }, { kind: 'noon', time: '13:00', enabled: true }, { kind: 'evening', time: '20:30', enabled: true }] }; }
export function demoData(today = localDate()) {
  const data = blankData(); data.profile.display_name = 'bạn';
  const titles = ['Hoàn thành bản đề xuất đang ấp ủ', 'Dành 30 phút đọc sách', 'Đi bộ và trò chuyện cùng người thân'];
  data.tasks = titles.map((title, i) => ({ id: `demo-today-${i}`, date: today, slot: i + 1, title, completed: i === 0, carry_count: 0, reason: '', previous_task_id: null }));
  for (let i = 1; i <= 10; i++) {
    const date = shiftDate(today, -i);
    if (i === 3 || i === 7) continue;
    data.days.push({ date, reflection: i === 1 ? 'Một buổi chiều chậm rãi. Mình nhận ra rằng dành trọn sự chú ý cho một việc cũng là một cách tiến về phía trước.' : '', closed_at: null });
    for (let slot = 1; slot <= (i % 3 === 0 ? 2 : 3); slot++) data.tasks.push({ id: `demo-${i}-${slot}`, date, slot, title: ['Viết ra ý tưởng cho dự án mới', 'Vận động 30 phút', 'Dành thời gian cho gia đình'][slot - 1], completed: slot !== 3 || i % 2 === 0, carry_count: 0, reason: '', previous_task_id: null });
  }
  const parent = data.tasks.find(t => t.date === shiftDate(today, -2) && t.slot === 3);
  const child = data.tasks.find(t => t.date === shiftDate(today, -1) && t.slot === 3);
  if (parent && child) { parent.completed = false; child.title = parent.title; child.previous_task_id = parent.id; child.carry_count = 1; data.tasks[2].title = parent.title; data.tasks[2].previous_task_id = child.id; data.tasks[2].carry_count = 2; }
  return data;
}
// Same optimistic rules in demo and the account-specific outbox; the database validates every real mutation.
export function applyMutation(data, op) {
  const p = op.payload;
  if (op.kind === 'task') {
    let t = data.tasks.find(x => x.date === p.date && x.slot === p.slot);
    if (!t) { t = { id: p.id, date: p.date, slot: p.slot, title: '', completed: false, carry_count: 0, reason: '', previous_task_id: null }; data.tasks.push(t); }
    Object.assign(t, p.patch);
    if (!t.title.trim()) data.tasks = data.tasks.filter(x => x !== t);
  } else if (op.kind === 'day') {
    let d = data.days.find(x => x.date === p.date); if (!d) { d = { date: p.date, reflection: '', closed_at: null }; data.days.push(d); } Object.assign(d, p.patch);
  } else if (op.kind === 'profile') Object.assign(data.profile, p.patch);
  else if (op.kind === 'reminder') Object.assign(data.reminders.find(x => x.kind === p.kind), p.patch);
}
