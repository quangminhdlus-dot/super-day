import { dateLabel, localDate, monthDates, shiftDate, weekDates } from './domain.js';
import { vietnameseLunar } from './vn-lunar.js';

const COLLECTIONS = ['events', 'phases', 'ideas'];
const KINDS = { event: 'Sự kiện', deadline: 'Hạn chót', note: 'Ghi chú' };
const CATEGORIES = ['Công việc', 'Sản phẩm', 'Nội dung', 'Cá nhân'];
const SNOOZE_LIMIT = 3;
const empty = () => ({ events: [], phases: [], ideas: [] });
const lunarLabel = lunar => lunar ? lunar.day + '/' + lunar.month + (lunar.leap ? ' nhuận' : '') : '';
const dueTime = entry => entry.nextAt || (entry.remind && entry.time ? Date.parse(entry.date + 'T' + entry.time + ':00+07:00') : 0);
const byTime = (a, b) => a.time.localeCompare(b.time);
const phaseRate = phase => phase.goals.length ? Math.round(phase.goals.filter(goal => goal.done).length * 100 / phase.goals.length) : 0;
function validDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const value = new Date(date + 'T00:00:00Z');
  return Number.isFinite(+value) && value.toISOString().slice(0, 10) === date;
}

export function createWorkspace({ owner, accountData, render, icon, e, showDialog, dialog, toast, openDay }) {
  let calendarDate = localDate();
  let calendarMode = 'month';
  let ideaFilter = '';
  let search = '';
  let favoriteOnly = false;
  let dialogOwner;
  const key = () => 'super-day:workspace:v1:' + owner();
  const isCurrent = () => dialogOwner === key();

  function snapshot() {
    try {
      const stored = JSON.parse(localStorage.getItem(key()));
      return Object.fromEntries(COLLECTIONS.map(name => [name, Array.isArray(stored?.[name]) ? stored[name] : []]));
    } catch { return empty(); }
  }

  function update(collection, updater) {
    const data = snapshot();
    data[collection] = updater(data[collection]);
    try { localStorage.setItem(key(), JSON.stringify(data)); }
    catch { toast('Thiết bị chưa lưu được thay đổi. Vui lòng thử lại.'); return false; }
    render();
    return true;
  }

  function reset() {
    calendarDate = localDate();
    calendarMode = 'month';
    ideaFilter = search = '';
    favoriteOnly = false;
    if (dialog.open && dialogOwner) dialog.close();
    dialogOwner = undefined;
  }

  function open(title, content) {
    dialogOwner = key();
    if (dialog.open) dialog.close();
    showDialog(title, content);
  }

  function action(name, label, extras = '', type = 'secondary-button') {
    return `<button type="button" class="${type}" data-workspace-action="${name}" ${extras}>${label}</button>`;
  }

  function renderCalendar() {
    const model = snapshot();
    const today = localDate();
    const events = model.events.filter(entry => entry.date === calendarDate).sort(byTime);
    const data = accountData();
    const tasks = data.tasks.filter(task => task.date === calendarDate);
    const note = data.days.find(day => day.date === calendarDate)?.reflection;
    const marks = new Set([...model.events.map(event => event.date), ...data.days.filter(day => day.reflection).map(day => day.date)]);
    const dates = calendarMode === 'month' ? monthDates(calendarDate) : calendarMode === 'week' ? weekDates(calendarDate) : [];
    const pad = calendarMode === 'month' ? (new Date(dates[0] + 'T12:00Z').getUTCDay() + 6) % 7 : 0;
    const rangeLabel = calendarMode === 'month'
      ? dateLabel(calendarDate, { day: undefined, month: 'long', year: 'numeric' })
      : calendarMode === 'week' ? dateLabel(dates[0], { month: 'numeric' }) + ' – ' + dateLabel(dates[6], { month: 'numeric', year: 'numeric' })
      : dateLabel(calendarDate, { month: 'long', year: 'numeric' });
    const day = vietnameseLunar(calendarDate);
    return `<section class="workspace-calendar">
      <div class="segmented workspace-segments" role="group" aria-label="Kiểu lịch">${Object.entries({ month: 'Tháng', week: 'Tuần', day: 'Ngày' }).map(([id, label]) =>
        action('calendar-mode', label, 'data-value="' + id + '" aria-pressed="' + (calendarMode === id) + '"', calendarMode === id ? 'active' : '')).join('')}</div>
      <div class="workspace-pager">${action('calendar-shift', icon('chevron'), 'data-value="-1" aria-label="Khoảng lịch trước"', 'icon-button flip')}
        <strong>${e(rangeLabel)}</strong>${action('calendar-shift', icon('chevron'), 'data-value="1" aria-label="Khoảng lịch sau"', 'icon-button')}</div>
      ${dates.length ? `<div class="panel lunar-grid">
        ${['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map(label => `<span class="lunar-weekday">${label}</span>`).join('')}${'<span></span>'.repeat(pad)}
        ${dates.map(date => {
          const lunar = vietnameseLunar(date), lunarText = lunarLabel(lunar);
          const aria = dateLabel(date, { month: 'long', year: 'numeric' }) + (lunarText ? ', âm lịch ' + lunarText : '') + (marks.has(date) ? ', có lịch trình' : '');
          return action('calendar-date', `<strong>${+date.slice(8)}</strong><small>${lunar ? (lunar.day === 1 ? lunarText : lunar.day) : '—'}</small><i class="${marks.has(date) ? 'marked' : ''}"></i>`,
            `data-value="${date}" aria-label="${e(aria)}" aria-pressed="${date === calendarDate}" ${date === today ? 'aria-current="date"' : ''}`, 'lunar-cell');
        }).join('')}
        </div>` : ''}
      <section class="panel agenda" aria-label="Lịch trình trong ngày">
        <div class="workspace-heading"><div><time datetime="${calendarDate}">${e(dateLabel(calendarDate, { weekday: 'long', year: 'numeric' }))}</time>
          <small>${day ? 'Âm lịch ' + lunarLabel(day) + '/' + day.year : 'Âm lịch hỗ trợ năm 2000–2100'} · Giờ Việt Nam</small></div>
          ${action('calendar-today', 'Hôm nay', '', 'text-button')}</div>
        ${events.length ? events.map(event => `<div class="workspace-row event-row">
          <span class="event-time">${event.time || 'Cả ngày'}</span>
          ${action('edit-event', `<strong>${e(event.title)}</strong><small>${KINDS[event.kind] || 'Sự kiện'}${event.note ? ' · ' + e(event.note) : ''}</small>`, 'data-id="' + e(event.id) + '"', 'workspace-item-link')}
          ${event.remind ? `<span class="event-bell" title="${event.acknowledged ? 'Đã xác nhận' : 'Có nhắc'}">${icon(event.acknowledged ? 'check' : 'bell')}</span>` : ''}</div>`).join('') : '<p class="workspace-empty">Chưa có sự kiện, hạn chót hay ghi chú lịch.</p>'}
        ${tasks.length || note ? `<div class="agenda-record"><h3>Từ Hôm nay</h3>${tasks.map(task => `<div>${icon(task.completed ? 'check' : 'target')} <span>${e(task.title)}</span></div>`).join('')}
          ${note ? `<p>${e(note)}</p>` : ''}${action('history-day', 'Mở chi tiết ngày ' + icon('arrow'), 'data-value="' + calendarDate + '"', 'text-button')}</div>` : ''}
        ${data.reminders.length ? `<details class="workspace-details"><summary>Nhắc hằng ngày</summary><p>${data.reminders.filter(item => item.enabled).map(item => `${({ morning: 'Mục tiêu ngày mới', noon: 'Kiểm tra tiến độ', evening: 'Nhìn lại hôm nay' })[item.kind]} ${e(item.time.slice(0, 5))}`).join(' · ') || 'Đang tắt'}.</p></details>` : ''}
      </section>
      ${action('edit-event', icon('plus') + ' Thêm lịch trình', '', 'primary-button workspace-add')}</section>`;
  }

  function renderPhases() {
    const today = localDate();
    const phases = snapshot().phases.sort((a, b) => a.start.localeCompare(b.start));
    const goals = phases.flatMap(phase => phase.goals);
    const done = goals.filter(goal => goal.done).length;
    return `<div class="page-heading simple"><div><h1>Giai đoạn</h1><p>Đặt mốc và theo dõi các mục tiêu sắp tới.</p></div></div>
      ${goals.length ? `<section class="panel workspace-summary"><strong>${done}/${goals.length}</strong><span>mục tiêu đã hoàn thành</span></section>` : ''}
      <div class="workspace-list">${phases.length ? phases.map(phase => {
        const rate = phaseRate(phase);
        const status = rate === 100 ? 'Hoàn thành' : today < phase.start ? 'Sắp tới' : today > phase.end ? 'Qua hạn' : 'Đang thực hiện';
        return `<article class="panel phase-card"><div class="workspace-heading"><div><h2>${e(phase.title)}</h2><small>${e(dateLabel(phase.start, { month: 'numeric' }))} – ${e(dateLabel(phase.end, { month: 'numeric', year: 'numeric' }))}</small></div><span class="workspace-badge">${status}</span></div>
          ${phase.note ? `<p class="workspace-description">${e(phase.note)}</p>` : ''}
          <div class="workspace-progress"><div class="progress-track" role="progressbar" aria-label="Tiến độ ${e(phase.title)}" aria-valuenow="${rate}" aria-valuemin="0" aria-valuemax="100"><span style="width:${rate}%"></span></div><strong>${rate}%</strong></div>
          <div class="phase-goals">${phase.goals.map((goal, i) => action('toggle-goal', `${icon(goal.done ? 'check' : 'target')}<span>${e(goal.text)}</span>`,
            `data-id="${e(phase.id)}" data-value="${i}" aria-pressed="${goal.done}"`, 'phase-goal')).join('')}</div>
          ${action('edit-phase', 'Chỉnh sửa ' + icon('arrow'), 'data-id="' + e(phase.id) + '"', 'text-button')}
        </article>`;
      }).join('') : `<div class="panel workspace-empty-state">${icon('target')}<h2>Chưa có giai đoạn</h2><p>Chọn một mốc thời gian và ghi những mục tiêu anh muốn hoàn thành.</p></div>`}</div>
      ${action('edit-phase', icon('plus') + ' Thêm giai đoạn', '', 'primary-button workspace-add')}`;
  }

  function renderIdeas() {
    const all = snapshot().ideas;
    const term = search.trim().toLocaleLowerCase('vi');
    const results = all.filter(idea => (!ideaFilter || idea.category === ideaFilter) && (!favoriteOnly || idea.favorite) &&
      (!term || (idea.title + ' ' + idea.note).toLocaleLowerCase('vi').includes(term)));
    return `<div class="page-heading simple"><div><h1>Ý tưởng</h1><p>Ghi nhanh điều anh muốn quay lại.</p></div></div>
      <label class="workspace-search">${icon('search')}<span class="sr-only">Tìm ý tưởng</span><input type="search" id="idea-search" data-workspace-search placeholder="Tìm ý tưởng..." value="${e(search)}"></label>
      <div class="idea-filters" role="group" aria-label="Lọc ý tưởng">${['', ...CATEGORIES].map(value =>
        action('filter-ideas', value || 'Tất cả', `data-value="${value}" aria-pressed="${value === ideaFilter}"`, 'workspace-chip')).join('')}
        ${action('favorite-filter', icon('star') + ' Đã lưu sao', 'aria-pressed="' + favoriteOnly + '"', 'workspace-chip')}</div>
      <div class="workspace-list">${results.length ? results.map(idea => `<article class="panel idea-card">
        ${action('edit-idea', `${icon('bulb')}<span><strong>${e(idea.title)}</strong>${idea.note ? `<span class="idea-excerpt">${e(idea.note.slice(0, 140))}${idea.note.length > 140 ? '…' : ''}</span>` : ''}<small>${e(idea.category)} · ${e(dateLabel(idea.date, { month: 'numeric' }))}</small></span>`, 'data-id="' + e(idea.id) + '"', 'idea-link')}
        ${action('toggle-favorite', icon('star'), 'data-id="' + e(idea.id) + '" aria-label="Đánh dấu sao" aria-pressed="' + idea.favorite + '"', 'icon-button idea-star')}</article>`).join('') :
        `<div class="panel workspace-empty-state">${icon('bulb')}<h2>${all.length ? 'Không tìm thấy ý tưởng' : 'Chưa có ý tưởng'}</h2><p>${all.length ? 'Thử từ khóa hay bộ lọc khác.' : 'Ghi lại một ý tưởng đầu tiên.'}</p></div>`}</div>
      ${action('edit-idea', icon('plus') + ' Thêm ý tưởng', '', 'primary-button workspace-add')}`;
  }

  function edit(collection, id) {
    const item = snapshot()[collection].find(entry => entry.id === id);
    const title = { events: 'lịch trình', phases: 'giai đoạn', ideas: 'ý tưởng' }[collection];
    const select = (id, label, choices, value) => `<label for="${id}">${label}</label><select name="${id}" id="${id}">${choices.map(([key, name]) => `<option value="${e(key)}" ${key === value ? 'selected' : ''}>${e(name)}</option>`).join('')}</select>`;
    const input = (name, label, value, type = 'text', attrs = '') => `<label for="workspace-${name}">${label}</label><input name="${name}" id="workspace-${name}" type="${type}" value="${e(value)}" ${attrs}>`;
    const textarea = (name, label, value, max) => `<label for="workspace-${name}">${label}</label><textarea name="${name}" id="workspace-${name}" maxlength="${max}" rows="3">${e(value)}</textarea>`;
    let fields = input('title', 'Tên', item?.title, 'text', 'required maxlength="120"');
    if (collection === 'events') {
      fields += select('kind', 'Loại', Object.entries(KINDS), item?.kind);
      fields += input('date', 'Ngày', item?.date || calendarDate, 'date', 'required');
      fields += input('time', 'Giờ Việt Nam', item?.time, 'time');
      fields += `<label class="workspace-checkbox"><input type="checkbox" name="remind" ${item?.remind ? 'checked' : ''}> Nhắc trong ứng dụng</label><p class="field-hint">Nhắc khi Super Day đang mở. Cần có giờ để đặt nhắc.</p>`;
    }
    if (collection === 'phases') {
      const start = item?.start || localDate();
      fields += input('start', 'Bắt đầu', start, 'date', 'required') + input('end', 'Kết thúc', item?.end || shiftDate(start, 6), 'date', 'required');
      fields += textarea('goals', 'Mục tiêu (mỗi dòng một việc)', item?.goals.map(goal => goal.text).join('\n'), 1500);
    }
    if (collection === 'ideas') fields += select('category', 'Chủ đề', CATEGORIES.map(value => [value, value]), item?.category);
    fields += textarea('note', collection === 'phases' ? 'Mô tả' : 'Nội dung', item?.note, 5000);
    open((item ? 'Sửa ' : 'Thêm ') + title, `<form data-workspace-form="${collection}" data-id="${e(item?.id)}">${fields}
      <p class="workspace-form-status" role="alert"></p><div class="button-row">
      <button class="primary-button" type="submit">Lưu</button>
      ${item ? action('confirm-delete', 'Xóa', 'data-id="' + e(item.id) + '" data-value="' + collection + '"', 'text-button') : ''}</div></form>`);
  }

  function submit(form) {
    if (!isCurrent()) return;
    const collection = form.dataset.workspaceForm;
    if (!COLLECTIONS.includes(collection)) return;
    const current = snapshot()[collection].find(item => item.id === form.dataset.id);
    if (form.dataset.id && !current) return;
    const values = new FormData(form);
    const field = name => String(values.get(name) || '').trim();
    let item = { id: current?.id || crypto.randomUUID(), title: field('title'), note: field('note') };
    const error = message => { form.querySelector('.workspace-form-status').textContent = message; };
    if (!item.title) return error('Vui lòng nhập tên.');
    if (collection === 'events') {
      const date = field('date'), time = field('time'), remind = values.has('remind');
      if (!validDate(date) || (remind && !/^\d\d:\d\d$/.test(time))) return error('Chọn ngày hợp lệ và nhập giờ nếu muốn nhắc.');
      const unchanged = current && current.date === date && current.time === time && current.remind === remind;
      item = { ...item, date, time, remind, kind: field('kind'), snoozes: unchanged ? current.snoozes : 0,
        nextAt: unchanged ? current.nextAt : 0, acknowledged: unchanged && current.acknowledged, alertedAt: unchanged ? current.alertedAt : 0 };
      calendarDate = date;
    }
    if (collection === 'phases') {
      const start = field('start'), end = field('end');
      if (!validDate(start) || !validDate(end) || end < start) return error('Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.');
      const done = new Set(current?.goals.filter(goal => goal.done).map(goal => goal.text));
      const goals = [...new Set(field('goals').split('\n').map(line => line.trim()).filter(Boolean))].map(text => ({ text, done: done.has(text) }));
      item = { ...item, start, end, goals };
    }
    if (collection === 'ideas') item = { ...item, category: field('category'), date: current?.date || localDate(), favorite: current?.favorite || false };
    if (!update(collection, list => current ? list.map(entry => entry.id === item.id ? item : entry) : [item, ...list])) return error('Chưa lưu được. Nội dung vẫn ở đây.');
    dialog.close();
  }

  function reminders() {
    const now = Date.now();
    return snapshot().events.filter(event => !event.acknowledged && event.remind && dueTime(event) && dueTime(event) >= now - 86400000)
      .sort((a, b) => dueTime(a) - dueTime(b));
  }

  function showReminders() {
    const list = reminders();
    open('Nhắc lịch', list.length ? list.map(entry => `<div class="reminder-inbox-row"><div><strong>${e(entry.title)}</strong><small>${e(entry.time)} · ${e(dateLabel(entry.date))}${entry.nextAt ? ' · Đã hẹn nhắc lại' : ''}</small></div>
      ${action('show-reminder', 'Mở', 'data-id="' + e(entry.id) + '"', 'text-button')}</div>`).join('') :
      '<p class="dialog-copy">Chưa có nhắc lịch. Anh có thể đặt nhắc khi thêm sự kiện trong Lịch.</p>');
  }

  function showReminder(id) {
    const entry = reminders().find(item => item.id === id);
    if (!entry) return showReminders();
    const due = dueTime(entry) <= Date.now();
    open(due ? 'Đã đến giờ!' : 'Nhắc lịch', `<div class="reminder-message">${icon('bell')}<h3>${e(entry.title)}</h3><p>${e(entry.time)} · ${e(dateLabel(entry.date, { weekday: 'long', year: 'numeric' }))}</p></div>
      ${due && entry.snoozes < SNOOZE_LIMIT ? `<div class="reminder-snooze"><h3>Nhắc lại sau</h3><div class="button-row">${[5, 10, 15].map(min => action('snooze', min + ' phút', `data-id="${e(id)}" data-value="${min}"`)).join('')}</div></div>` : ''}
      ${due ? action('acknowledge', icon('check') + ' Đã xem', 'data-id="' + e(id) + '"', 'primary-button') : ''}`);
  }

  function tick() {
    if (document.hidden || dialog.open || document.querySelector('.daily-opening[open], #reflection-voice-dialog[open]')) return;
    const ready = reminders().find(entry => dueTime(entry) <= Date.now() && entry.alertedAt !== dueTime(entry));
    if (!ready) return;
    if (update('events', list => list.map(entry => entry.id === ready.id ? { ...entry, alertedAt: dueTime(entry) } : entry))) showReminder(ready.id);
  }

  function handle(button) {
    const { workspaceAction: name, id, value } = button.dataset;
    if (!name) return;
    if (name === 'calendar-mode') { calendarMode = value; return render(); }
    if (name === 'calendar-today') { calendarDate = localDate(); return render(); }
    if (name === 'calendar-date') { calendarDate = value; return render(); }
    if (name === 'history-day') return openDay(value);
    if (name === 'calendar-shift') {
      const delta = Number(value);
      if (calendarMode === 'month') {
        const d = new Date(calendarDate.slice(0, 7) + '-01T12:00Z');
        d.setUTCMonth(d.getUTCMonth() + delta);
        calendarDate = d.toISOString().slice(0, 10);
      } else calendarDate = shiftDate(calendarDate, delta * (calendarMode === 'week' ? 7 : 1));
      return render();
    }
    if (name === 'filter-ideas') { ideaFilter = value; return render(); }
    if (name === 'favorite-filter') { favoriteOnly = !favoriteOnly; return render(); }
    if (name === 'edit-event') return edit('events', id);
    if (name === 'edit-phase') return edit('phases', id);
    if (name === 'edit-idea') return edit('ideas', id);
    if (name === 'toggle-favorite') return update('ideas', list => list.map(item => item.id === id ? { ...item, favorite: !item.favorite } : item));
    if (name === 'toggle-goal') return update('phases', list => list.map(item => item.id === id ?
      { ...item, goals: item.goals.map((goal, i) => i === +value ? { ...goal, done: !goal.done } : goal) } : item));
    if (name === 'reminder-inbox') return showReminders();
    if (!isCurrent()) return;
    if (name === 'confirm-delete' && COLLECTIONS.includes(value)) {
      const item = snapshot()[value].find(entry => entry.id === id);
      if (item) open('Xóa mục này?', `<p class="dialog-copy">${e(item.title)}</p><div class="button-row">${action('delete-item','Xóa','data-id="' + e(id) + '" data-value="' + value + '"','primary-button')}<button class="secondary-button" data-dialog-close>Hủy</button></div>`);
    }
    if (name === 'delete-item' && COLLECTIONS.includes(value) && update(value, list => list.filter(item => item.id !== id))) dialog.close();
    if (name === 'show-reminder') return showReminder(id);
    if (name === 'snooze' || name === 'acknowledge') {
      const entry = reminders().find(item => item.id === id);
      if (!entry || dueTime(entry) > Date.now()) return;
      const min = Number(value);
      if (name === 'snooze' && (![5, 10, 15].includes(min) || entry.snoozes >= SNOOZE_LIMIT)) return;
      if (update('events', list => list.map(item => item.id !== id ? item : name === 'acknowledge'
        ? { ...item, acknowledged: true } : { ...item, nextAt: Date.now() + min * 60000, snoozes: item.snoozes + 1 }))) {
        dialog.close();
        toast(name === 'acknowledge' ? 'Đã xác nhận lời nhắc.' : 'Sẽ nhắc lại sau ' + min + ' phút.');
      }
    }
  }

  return { renderCalendar, renderPhases, renderIdeas, handle, submit, snapshot, tick, reset,
    setSearch(value) { search = value; render(); },
    onStorage(event) { if (event.key === key()) render(); } };
}
