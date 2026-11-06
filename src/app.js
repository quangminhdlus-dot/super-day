import { DEFAULT_ZONE, localDate, shiftDate, dateLabel, weekDates, monthDates, stats, outstanding, blankData, demoData, applyMutation } from './lib/domain.js';
import { configured, config, getClient, loadAccount, mutate, edge } from './lib/api.js';
import { FONT_OPTIONS, readAppearance, storeAppearance, applyAppearance, saveAccountAppearance } from './lib/appearance.js';
import { signInPassword, changePassword, needsPasswordReauth, passwordErrorMessage } from './lib/auth.js';
import { preparePush, detachPush, inspectPush, registerPush, observePush, pushStateLabel, describePushError } from './lib/push.js';
import { installViewportGuard } from './lib/viewport.js';

installViewportGuard(document);

const paths = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 11h18m-13 5h2m4 0h2"/>',
  settings: '<path d="m9 3-1 3-3 1 1 4-2 2 2 3 3-1 2 3h3l1-3 3-1-1-4 2-2-2-3-3 1-2-3z"/><circle cx="11.5" cy="10.5" r="3"/>',
  check: '<path d="m5 12 4 4L19 6"/>', arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  leaf: '<path d="M20 3C9 2 3 7 4 14c1 7 13 7 16-11Z"/><path d="M4 21 16 9"/>',
  book: '<path d="M12 5C8 2 4 3 2 4v16c4-2 7-1 10 1m0-16c4-3 8-2 10-1v16c-4-2-7-1-10 1V5Z"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>', chevron: '<path d="m9 5 7 7-7 7"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>', logout: '<path d="M9 3H4v18h5m5-14 5 5-5 5M9 12h10"/>',
  cloud: '<path d="M7 18a5 5 0 1 1 1-10 6 6 0 0 1 11 3 4 4 0 0 1-1 8H7Z"/>', plus: '<path d="M12 5v14M5 12h14"/>',
  type: '<path d="M4 5h16M12 5v16M8 21h8M3 12h5m-2.5 0v9"/>', target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  moon: '<path d="M20 14A9 9 0 0 1 10 3a9 9 0 1 0 10 11Z"/>', heart: '<path d="M20 5c-4-4-8 1-8 1S8 1 4 5s0 9 8 15c8-6 12-11 8-15Z"/>'
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.sun}</svg>`;
const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
function persist(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { toast('Bộ nhớ thiết bị đã đầy. Hãy xuất dữ liệu và giữ ứng dụng mở.'); return false; } }
const app = document.querySelector('#app');
const dialog = document.querySelector('#dialog');
const initialView = new URL(location.href).searchParams.get('view');
const state = { appearance: readAppearance(localStorage), data: read('super-day:demo:v1', null) || demoData(), demo: true, user: null, view: ['today', 'journey', 'settings'].includes(initialView) ? initialView : 'today', selectedDate: null, anchor: localDate(), range: 'week', outbox: [], syncing: false, syncError: '', loading: false, push: null, pushStatus: '', pushInfo: null, pushError: '', pushBusy: false, pushSending: false, booting: configured, authError: '' };
let syncPromise, loadPromise, toastTimer, stopPushObservation;
let pushInspection = 0;
let mutationRevision = 0;
let appearanceSync;
let reminderTimeEdit = null, renderAfterTimeEdit = false;
let reminderTimePointerOwner = null;
const storageKey = () => `super-day:account:${state.user?.id}`;
const today = () => localDate(new Date(), state.data.profile.timezone || DEFAULT_ZONE);
function toast(message) { const t = document.querySelector('#toast'); t.textContent = message; t.classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('visible'), 5000); }
function saveLocal() { if (state.demo) persist('super-day:demo:v1', state.data); else persist(storageKey(), { data: state.data, outbox: state.outbox }); }
function formatTime() { return new Intl.DateTimeFormat('vi-VN', { timeZone: state.data.profile.timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()); }
function greeting() { const hour = +formatTime().split(':')[0]; return hour < 11 ? 'Chào buổi sáng' : hour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối'; }
function navigate(view) { state.view = view; state.selectedDate = null; const url = new URL(location.href); url.searchParams.set('view', view); history.replaceState(null, '', url); render(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
function queue(kind, payload, repaint = true) {
  mutationRevision++;
  const op = { id: crypto.randomUUID(), kind, payload };
  applyMutation(state.data, op);
  if (!state.demo) state.outbox.push(op);
  saveLocal(); if (repaint) render(); else renderStatus(); if (!state.demo) flush();
}
async function flush() {
  if (syncPromise) return syncPromise;
  if (state.demo || !state.user || state.syncError || !state.outbox.length) return;
  const uid = state.user.id;
  syncPromise = (async () => {
    state.syncing = true; renderStatus();
    try {
      while (state.outbox.length && state.user?.id === uid) {
        const op = state.outbox[0]; await mutate(op);
        if (state.user?.id !== uid || state.demo) return;
        state.outbox.shift(); saveLocal(); renderStatus();
      }
    } catch (err) { state.syncError = err.message || 'Chưa đồng bộ được. Bản nháp vẫn ở trên thiết bị này.'; render(); }
    finally { state.syncing = false; syncPromise = null; renderStatus(); }
  })(); return syncPromise;
}
async function refresh() {
  if (state.demo || !state.user || loadPromise || state.syncError || editingReminderTime()) return;
  const uid = state.user.id;
  const revision = mutationRevision;
  loadPromise = (async () => {
    await flush(); if (state.outbox.length) return;
    try { const data = await loadAccount(); if (state.user?.id !== uid || state.outbox.length || revision !== mutationRevision || textDrafts.size || editingReminderTime()) return; state.data = data; saveLocal(); render(); }
    catch (err) { state.syncError = err.message; render(); }
  })();
  try { await loadPromise; } finally { loadPromise = null; }
}
function statusText() { return state.demo ? 'Bản trải nghiệm' : editingReminderTime() ? 'Đang chọn giờ…' : state.syncError ? 'Có thay đổi chưa đồng bộ' : state.outbox.length ? `Đang lưu ${state.outbox.length} thay đổi…` : 'Đã đồng bộ'; }
function renderStatus() { document.querySelectorAll('[data-sync-status]').forEach(el => { el.textContent = statusText(); }); }
function shell(content) {
  return `<aside class="sidebar"><a class="brand" href="./" aria-label="Super Day, trang chủ"><span class="brand-mark">${icon('sun')}</span><span>super day<span class="brand-dot">.</span></span></a>
    <span class="nav-caption">Làm chủ ngày của bạn</span><nav aria-label="Điều hướng chính">${[['today', 'sun', 'Hôm nay'], ['journey', 'calendar', 'Hành trình'], ['settings', 'settings', 'Cài đặt']].map(([id, ic, label]) => `<button data-nav="${id}" class="nav-item ${state.view === id ? 'active' : ''}" ${state.view === id ? 'aria-current="page"' : ''}>${icon(ic)}<span>${label}</span>${state.view === id ? '<span class="nav-dot"></span>' : ''}</button>`).join('')}</nav>
    <div class="sidebar-bottom"><div class="sidebar-note">${icon('leaf')}<p>Chọn đúng việc.<br>Làm đến cùng.</p></div><button class="account" data-action="${state.demo ? 'login' : 'account'}"><span class="avatar">${state.demo ? icon('sun') : e((state.data.profile.display_name || state.user.email)[0].toUpperCase())}</span><span><strong>${state.demo ? 'Không gian của bạn' : e(state.data.profile.display_name || 'Tài khoản của bạn')}</strong><small>${state.demo ? 'Đăng nhập để bắt đầu' : e(state.user.email)}</small></span>${icon('chevron')}</button></div></aside>
    <div class="page"><header class="topbar"><a class="mobile-brand" href="./" aria-label="Super Day">super day<span>.</span></a><span class="breadcrumb">Không gian cá nhân <span>/</span> <strong>${{ today: 'Hôm nay', journey: 'Hành trình', settings: 'Cài đặt' }[state.view]}</strong></span><div class="topbar-right"><span class="save-state"><span class="status-dot ${state.syncError ? 'warning' : ''}"></span><span data-sync-status>${statusText()}</span></span><button class="topbar-avatar" data-action="${state.demo ? 'login' : 'account'}" aria-label="Mở tài khoản">${state.demo ? icon('sun') : e((state.data.profile.display_name || state.user.email)[0].toUpperCase())}</button></div></header>
    <main id="main">${state.demo ? `<div class="demo-banner"><span>${icon('leaf')} Bạn đang trải nghiệm. Dữ liệu chỉ lưu trên thiết bị này.</span><button data-action="login">${state.booting ? 'Đang kiểm tra phiên…' : 'Đăng nhập'} ${icon('arrow')}</button></div>` : ''}${state.authError ? `<div class="notice error">${e(state.authError)}</div>` : ''}${state.syncError ? `<div class="notice error" role="alert"><strong>Thay đổi đang được giữ trên thiết bị.</strong><p>${e(state.syncError)}</p><div class="button-row"><button class="text-button" data-action="retry">Thử đồng bộ lại</button><button class="text-button" data-action="resolve">Xử lý bản nháp</button><button class="text-button" data-action="export">Xuất dữ liệu</button></div></div>` : ''}${state.loading ? '<p class="loading">Đang mở không gian của bạn…</p>' : content}</main>
    <footer class="page-footer"><span>Tập trung vào điều tạo ra khác biệt.</span><span>Super Day ${icon('sun')}</span></footer></div>`;
}
function weekStrip(selected) {
  return `<div class="week-strip">${weekDates(selected).map((date, i) => {
    const tasks = state.data.tasks.filter(t => t.date === date), count = tasks.filter(t => t.completed).length;
    return `<button data-date="${date}" class="week-day ${date === selected ? 'selected' : ''} ${date === today() ? 'is-today' : ''}" aria-label="${e(dateLabel(date))}, ${tasks.length ? `${count}/${tasks.length} việc` : 'chưa có kế hoạch'}" ${date > today() ? 'disabled' : ''}><span>${['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'][i]}</span><strong>${+date.slice(8)}</strong><span class="day-indicator ${tasks.length ? count === tasks.length ? 'all-done' : count ? 'part-done' : 'planned' : ''}">${date === selected ? '•' : ''}</span></button>`;
  }).join('')}</div>`;
}
function dailyEditor(date, historical = false) {
  const tasks = state.data.tasks.filter(t => t.date === date), st = stats(tasks), day = state.data.days.find(d => d.date === date) || { reflection: '', closed_at: null };
  const children = new Map(state.data.tasks.filter(t => t.previous_task_id).map(t => [t.previous_task_id, t]));
  return `<section class="priorities panel"><div class="section-top"><div><span class="eyebrow">Ưu tiên của bạn</span><h2>3 việc quan trọng nhất ${historical ? 'trong ngày' : 'hôm nay'}</h2></div><span class="soft-icon">${icon('target')}</span></div>
    <div class="tasks">${[1, 2, 3].map(slot => {
      const t = tasks.find(x => x.slot === slot), moved = t && children.get(t.id);
      return `<div class="task ${t?.completed ? 'is-complete' : ''} ${!t ? 'is-empty' : ''}"><div class="task-main"><button class="task-check" data-complete="${slot}" data-edit-date="${date}" aria-label="${t?.completed ? 'Bỏ đánh dấu' : 'Hoàn thành'} việc ${slot}" aria-pressed="${!!t?.completed}" ${!t ? 'disabled' : ''}>${t?.completed ? icon('check') : ''}</button><div class="task-content"><label for="task-${date}-${slot}" class="sr-only">Việc quan trọng ${slot}</label><textarea id="task-${date}-${slot}" data-task="${slot}" data-edit-date="${date}" rows="1" maxlength="500" autocomplete="off" placeholder="${['Việc quan trọng nhất hôm nay', 'Ưu tiên thứ hai của bạn', 'Điều tiếp theo cần hoàn thành'][slot - 1]}">${e(t?.title)}</textarea><div class="task-meta"><span>Ưu tiên 0${slot}</span>${t?.completed ? `<span class="complete-label">${icon('check')} Đã hoàn thành</span>` : moved ? `<button class="inline-link" data-open-day="${moved.date}">Đã chuyển đến ${e(dateLabel(moved.date, { month: 'numeric' }))} ${icon('arrow')}</button>` : t?.carry_count ? `<span class="carry-label">Đã chuyển ${t.carry_count} lần</span>` : ''}</div></div><span class="task-number">0${slot}</span></div>${t && t.carry_count >= 2 && !t.completed ? `<div class="attention-note">${icon('leaf')}<div><p>Công việc này đã được chuyển sang ngày khác nhiều lần. Điều gì đang khiến bạn chưa thực hiện được?</p><label class="sr-only" for="reason-${t.id}">Điều khiến bạn chưa thực hiện</label><textarea id="reason-${t.id}" data-reason="${slot}" data-edit-date="${date}" rows="2" maxlength="5000" placeholder="Điều gì đang khiến bạn chưa bắt đầu?">${e(t.reason)}</textarea></div></div>` : ''}${t && !t.completed && !moved && date < today() ? `<button class="carry-button" data-carry="${t.id}">Chuyển sang hôm nay ${icon('arrow')}</button>` : ''}</div>`;
    }).join('')}</div><div class="progress-summary"><span>${st.done === 3 ? 'Ba điều quan trọng đã được hoàn thành.' : st.done ? 'Từng bước nhỏ, một ngày có ý nghĩa.' : 'Bắt đầu bằng một điều quan trọng.'}</span><strong>${st.done}<span>/3 việc</span></strong></div><div class="progress-track" role="progressbar" aria-label="Tiến độ ba việc" aria-valuenow="${st.done}" aria-valuemin="0" aria-valuemax="3"><span style="width:${st.done / 3 * 100}%"></span></div></section>
    <section class="reflection panel" id="reflection"><div class="section-top"><div class="section-title-icon">${icon('book')}<h2>Một chút nhìn lại</h2></div><span class="optional">Tùy bạn</span></div><p class="reflection-prompt">Hôm nay bạn cảm thấy thế nào? Có điều gì khiến bạn suy nghĩ hoặc muốn ghi nhớ?</p><label class="sr-only" for="reflection-${date}">Ghi chép ngày ${date}</label><textarea id="reflection-${date}" data-reflection="${date}" maxlength="100000" placeholder="Một niềm vui nhỏ, một điều học được, hay chỉ là vài dòng cho chính mình…">${e(day.reflection)}</textarea><div class="reflection-bottom"><span>${icon('cloud')} Tự động lưu khi bạn viết</span><span>${(day.reflection || '').length.toLocaleString('vi-VN')} ký tự</span></div></section>
    <div class="end-day"><span>${icon('moon')} ${day.closed_at ? 'Bạn đã dành thời gian nhìn lại ngày này. Bạn vẫn có thể chỉnh sửa.' : 'Dành một khoảnh khắc để ghi nhận những gì bạn đã làm.'}</span><button class="secondary-button" data-close-day="${date}">${day.closed_at ? 'Mở lại ngày' : 'Khép lại ngày'} ${icon(day.closed_at ? 'sun' : 'check')}</button></div>`;
}
function todayPage() {
  const date = state.selectedDate || today(), historical = date !== today();
  const weekStats = stats(state.data.tasks.filter(t => weekDates(today()).includes(t.date)));
  const leftovers = outstanding(state.data.tasks).filter(t => t.date < today());
  return `<div class="page-heading"><div><div class="eyebrow date-line">${icon('sun')} <span>${e(dateLabel(today(), { weekday: 'long', year: 'numeric' }))}</span><span class="time-pill" id="clock">${formatTime()}</span></div><h1><span class="greeting-prefix">${greeting()},</span><span class="greeting-name">${e(state.data.profile.display_name || 'bạn')}<span class="heading-dot">.</span></span></h1><p>Chọn đúng việc. Làm đến cùng.</p></div></div>
    <div class="today-layout"><div class="main-column">${weekStrip(date)}${historical ? `<div class="history-label"><span>Đang xem ${e(dateLabel(date, { weekday: 'long' }))}</span><button data-action="back-today">Về hôm nay ${icon('arrow')}</button></div>` : ''}${dailyEditor(date, historical)}</div><aside class="right-column"><section class="intention-card"><span class="eyebrow">Nhịp tập trung</span><div class="intention-art" aria-hidden="true">${icon('target')}</div><h2>Rõ ưu tiên.<br>Chắc hành động.</h2><p>Ba điều quan trọng. Dành năng lượng cho những việc tạo ra khác biệt.</p><div class="card-rule"></div><span class="tiny-label">Chọn đúng. Bắt đầu. Hoàn thành.</span></section>
    <section class="week-card panel"><div class="section-top"><h3>Tuần này của bạn</h3>${icon('calendar')}</div><div class="week-stat"><strong>${weekStats.done}</strong><span>việc quan trọng<br>đã hoàn thành</span></div><div class="mini-bars" aria-hidden="true">${weekDates(today()).map(d => { const ts = state.data.tasks.filter(t => t.date === d); return `<span class="mini-bar ${d === today() ? 'current' : ''}"><i style="height:${ts.length ? Math.max(8, ts.filter(t => t.completed).length / 3 * 100) : 0}%"></i><small>${['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][new Date(d + 'T12:00Z').getUTCDay()]}</small></span>`; }).join('')}</div><button class="card-link" data-nav="journey">Nhìn lại hành trình ${icon('arrow')}</button></section>
    ${leftovers.length ? `<section class="leftovers-card"><span class="eyebrow">NHỮNG VIỆC CÒN DANG DỞ</span><p>${leftovers.length} việc từ những ngày trước.<br>Bạn có muốn dành chỗ cho một việc hôm nay?</p><button class="text-button" data-action="leftovers">Xem công việc ${icon('arrow')}</button></section>` : ''}<p class="private-note">${icon('heart')} Dữ liệu cá nhân, dành riêng cho bạn.</p></aside></div>`;
}
function journeyPage() {
  const dates = state.range === 'week' ? weekDates(state.anchor) : monthDates(state.anchor);
  const tasks = state.data.tasks.filter(t => dates.includes(t.date)), st = stats(tasks);
  const remaining = tasks.filter(t => !t.completed), attention = outstanding(state.data.tasks).filter(t => dates.includes(t.date) && t.carry_count >= 2);
  const selected = state.selectedDate;
  const monthStart = dates[0], pad = state.range === 'month' ? (new Date(monthStart + 'T12:00Z').getUTCDay() + 6) % 7 : 0;
  return `<div class="page-heading simple"><div><span class="eyebrow">Theo dõi tiến độ</span><h1>Hành trình của bạn<span class="heading-dot">.</span></h1><p>Nhìn lại kết quả. Chuẩn bị cho bước tiếp theo.</p></div>${icon('leaf', 'heading-leaf')}</div><div class="journey-toolbar"><div class="segmented" aria-label="Khoảng báo cáo"><button data-range="week" class="${state.range === 'week' ? 'active' : ''}">Tuần</button><button data-range="month" class="${state.range === 'month' ? 'active' : ''}">Tháng</button></div><div class="date-controls"><button class="icon-button flip" data-period="-1" aria-label="Khoảng trước">${icon('chevron')}</button><strong>${state.range === 'week' ? `${dateLabel(dates[0], { month: 'numeric' })} – ${dateLabel(dates[6], { month: 'numeric', year: 'numeric' })}` : dateLabel(monthStart, { day: undefined, month: 'long', year: 'numeric' })}</strong><button class="icon-button" data-period="1" aria-label="Khoảng sau">${icon('chevron')}</button><button class="text-button" data-action="current-period">Hiện tại</button></div></div>
    <div class="stat-grid">${[[st.total, 'Việc đã đặt ra'], [st.done, 'Đã hoàn thành'], [st.remaining, 'Chưa hoàn thành'], [`${st.rate}%`, 'Tỷ lệ hoàn thành']].map(([n, label]) => `<div class="stat-card"><strong>${n}</strong><span>${label}</span></div>`).join('')}</div>
    <section class="panel calendar-panel"><div class="calendar-grid">${['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map(x => `<span class="calendar-weekday">${x}</span>`).join('')}${'<span></span>'.repeat(pad)}${dates.map(date => {
      const ts = state.data.tasks.filter(t => t.date === date), s = stats(ts), hasDay = state.data.days.find(d => d.date === date);
      return `<button data-open-day="${date}" class="calendar-day ${selected === date ? 'selected' : ''} ${date === today() ? 'is-today' : ''} ${s.total && s.done === s.total ? 'complete' : ''}" ${date > today() ? 'disabled' : ''}><strong>${+date.slice(8)}</strong><span>${s.total ? `${s.done}/${s.total}` : hasDay ? 'Ghi chép' : '—'}</span>${hasDay?.reflection ? '<i aria-label="Có ghi chép"></i>' : ''}</button>`;
    }).join('')}</div><div class="calendar-legend"><span><i class="legend-dot"></i> Có kế hoạch</span><span><i class="legend-dot done"></i> Hoàn thành tất cả</span><span>— Chưa có kế hoạch</span></div></section>
    <p class="report-note">Tỷ lệ dựa trên ${st.total} công việc thực tế đã tạo. Một việc chuyển ngày được ghi nhận ở từng ngày để giữ đúng lịch sử cam kết.</p>
    ${selected ? `<div class="history-label detail-heading"><h2>${e(dateLabel(selected, { weekday: 'long', year: 'numeric' }))}</h2><button class="icon-button" data-action="close-detail" aria-label="Đóng chi tiết">${icon('close')}</button></div>${dailyEditor(selected, true)}` : ''}
    <div class="journey-lists"><section class="panel"><div class="section-top"><h2>Còn dang dở</h2><span class="count-badge">${remaining.length}</span></div><p class="section-description">Những cam kết chưa hoàn thành trong khoảng này, kể cả việc đã chuyển ngày.</p>${taskList(remaining)}</section><section class="panel attention-panel"><div class="section-top"><h2>Một chút chú ý</h2>${icon('leaf')}</div><p class="section-description">Những việc đã được chuyển ngày từ hai lần. Một lời mời tìm hiểu, không phải phán xét.</p>${taskList(attention, true)}</section></div>
    <section class="panel journal-list"><div class="section-title-icon">${icon('book')}<h2>Những dòng để nhớ</h2></div>${state.data.days.filter(d => dates.includes(d.date) && d.reflection).sort((a,b) => b.date.localeCompare(a.date)).map(d => `<button class="journal-item" data-open-day="${d.date}"><span>${e(dateLabel(d.date, { weekday: 'short' }))}</span><p>${e(d.reflection.slice(0, 240))}${d.reflection.length > 240 ? '…' : ''}</p>${icon('arrow')}</button>`).join('') || '<div class="empty-state">Một vài dòng khi bạn muốn. Những ghi chép của bạn sẽ ở đây.</div>'}</section>`;
}
function taskList(tasks, attention = false) {
  return tasks.length ? `<div class="history-task-list">${tasks.map(t => `<div class="history-task"><div><strong>${e(t.title)}</strong><small>${e(dateLabel(t.date, { month: 'numeric' }))}${t.carry_count ? ` · Đã chuyển ${t.carry_count} lần` : ''}${state.data.tasks.some(next => next.previous_task_id === t.id) ? ' · Đã chuyển tiếp' : ''}</small>${attention && t.reason ? `<p>${e(t.reason)}</p>` : ''}</div><button class="icon-button" data-open-day="${t.date}" aria-label="Xem công việc ${e(t.title)}">${icon('arrow')}</button></div>`).join('')}</div>` : `<div class="empty-state">${icon('leaf')}<span>${attention ? 'Chưa có việc cần chú ý trong khoảng này.' : 'Không có công việc còn dang dở trong khoảng này.'}</span></div>`;
}
async function updatePushInfo(userId) {
  const sdk = state.push, inspection = ++pushInspection;
  if (!sdk || state.user?.id !== userId) return;
  const info = await inspectPush(sdk, userId);
  if (inspection !== pushInspection || state.push !== sdk || state.user?.id !== userId) return;
  const changed = JSON.stringify(state.pushInfo) !== JSON.stringify(info);
  state.pushInfo = info;
  if (!state.pushBusy) state.pushStatus = pushStateLabel(info);
  if (info.ready && state.pushError.startsWith('[PUSH_')) state.pushError = '';
  if (changed) render();
}
async function connectPush(userId) {
  const sdk = await preparePush(userId);
  if (state.user?.id !== userId) return;
  stopPushObservation?.(); state.push = sdk;
  stopPushObservation = observePush(sdk, () => { updatePushInfo(userId); });
  await updatePushInfo(userId);
}
function pushDiagnostics() {
  const info = state.pushInfo;
  if (!info && !state.pushError) return '';
  const rows = info ? [
    ['Quyền trình duyệt', info.permission], ['Quyền OneSignal', String(info.sdkPermission)],
    ['Subscription ID', info.id || 'chưa có'], ['Push Token', info.tokenPresent ? 'đã có' : 'chưa có'],
    ['optedIn', String(info.optedIn)], ['Liên kết tài khoản', info.linked ? 'đúng tài khoản' : 'chưa xác nhận'],
    ['Scope OneSignal cần dùng', info.expectedScope], ['Scope thực tế', info.workerScope || 'chưa tìm thấy'],
    ['Worker đang hoạt động', info.workerScript || 'chưa có'], ['Worker hợp lệ', String(info.workerActive)],
    ['Web Push của trình duyệt', info.nativeTokenPresent ? 'đã có' : 'chưa có'],
    ...(info.requestResult !== undefined ? [['Kết quả đăng ký từ SDK', String(info.requestResult)]] : []),
    ...(info.workerError ? [['Lỗi Service Worker', info.workerError]] : []),
  ] : [];
  return `${state.pushError ? `<p class="push-error" role="alert">${e(state.pushError)}</p>` : ''}<details class="push-diagnostics" ${state.pushError ? 'open' : ''}><summary>Chi tiết đăng ký thông báo</summary><dl>${rows.map(([label, value]) => `<div><dt>${e(label)}</dt><dd>${e(value)}</dd></div>`).join('')}</dl><p>Push Token chỉ được kiểm tra trạng thái, không hiển thị hoặc đưa vào bản xuất dữ liệu.</p></details>`;
}
function settingsPage() {
  const reminders = ['morning', 'noon', 'evening'].map(kind => state.data.reminders.find(reminder => reminder.kind === kind)).filter(Boolean);
  const pushLabel = state.demo ? 'Đăng nhập để nhận nhắc nhở' : state.pushStatus || 'Đang chuẩn bị kết nối…';
  return `<div class="page-heading simple settings-heading"><div><h1>Cài đặt</h1></div></div><div class="settings-layout"><div class="main-column"><section class="panel settings-section"><div class="section-title-icon">${icon('sun')}<h2>Tài khoản</h2></div><div class="setting-row"><span>Email</span><strong>${state.demo ? 'Chưa đăng nhập' : e(state.user.email)}</strong></div><label class="setting-row" for="display-name"><span>Tên</span><input id="display-name" data-profile="display_name" maxlength="80" value="${e(state.data.profile.display_name)}" placeholder="Bạn muốn được gọi là gì?"></label><label class="setting-row" for="timezone"><span>Múi giờ</span><select id="timezone" data-profile="timezone">${[...new Set([DEFAULT_ZONE, state.data.profile.timezone, 'Asia/Bangkok', 'Asia/Tokyo', 'Asia/Singapore', 'Europe/London', 'Europe/Paris', 'America/New_York', 'America/Los_Angeles', 'Australia/Sydney', 'UTC'])].map(z => `<option ${z === state.data.profile.timezone ? 'selected' : ''} value="${z}">${z === DEFAULT_ZONE ? 'Việt Nam (GMT+7)' : z.replaceAll('_', ' ')}</option>`).join('')}</select></label>${state.demo ? '<button class="primary-button" data-action="login">Đăng nhập bằng email '+icon('arrow')+'</button>' : '<div class="password-settings"><button class="secondary-button" data-action="change-password">Thiết lập hoặc thay đổi mật khẩu</button><p class="field-hint">Dùng cùng email và mật khẩu để đăng nhập trên iPhone và máy tính.</p></div>'}</section>
    <section class="panel settings-section appearance-section"><div class="section-title-icon">${icon('type')}<h2>Cỡ chữ</h2></div><div class="font-options" role="group" aria-label="Cỡ chữ">${FONT_OPTIONS.map(option => `<button id="font-size-${option.value}" class="font-option ${state.appearance.fontSize === option.value ? 'selected' : ''}" data-font-size="${option.value}" aria-pressed="${state.appearance.fontSize === option.value}"><span>${option.label}</span></button>`).join('')}</div></section>
    <section class="panel settings-section"><div class="section-title-icon">${icon('bell')}<h2>Thông báo hằng ngày</h2></div><p class="section-description">Ba khoảnh khắc để bắt đầu, tiếp tục và nhìn lại. Theo múi giờ của bạn.</p>${reminders.map(r => `<div class="reminder-row"><span class="reminder-icon">${icon({ morning: 'sun', noon: 'leaf', evening: 'moon' }[r.kind])}</span><div><strong>${{ morning: 'Mục tiêu ngày mới', noon: 'Kiểm tra tiến độ', evening: 'Nhìn lại hôm nay' }[r.kind]}</strong><small>${{ morning: 'Chọn ba điều quan trọng', noon: 'Trở về với điều bạn đã chọn', evening: 'Dành vài dòng cho chính mình' }[r.kind]}</small></div><label class="sr-only" for="time-${r.kind}">Giờ ${r.kind === 'morning' ? 'sáng' : r.kind === 'noon' ? 'trưa' : 'tối'}</label><div class="reminder-time-control"><input type="time" id="time-${r.kind}" data-reminder-time="${r.kind}" value="${e(r.time.slice(0, 5))}" step="60" required><button id="time-done-${r.kind}" class="text-button time-done" data-reminder-done="${r.kind}" aria-label="Xong giờ ${r.kind === 'morning' ? 'Mục tiêu ngày mới' : r.kind === 'noon' ? 'Kiểm tra tiến độ' : 'Nhìn lại hôm nay'}" hidden>Xong</button></div><button class="toggle ${r.enabled ? 'on' : ''}" role="switch" aria-checked="${r.enabled}" aria-label="Bật tắt ${r.kind === 'morning' ? 'nhắc sáng' : r.kind === 'noon' ? 'nhắc trưa' : 'nhắc tối'}" data-reminder-toggle="${r.kind}"><span></span></button></div>`).join('')}<div class="notification-state"><span class="status-dot ${state.pushInfo?.ready ? '' : 'warning'}"></span>${e(pushLabel)}</div><div class="button-row"><button class="primary-button" data-action="enable-push" ${state.pushBusy || state.pushSending || (!state.demo && !config.oneSignalAppId) ? 'disabled' : ''}>${icon('bell')} ${state.pushBusy ? 'Đang đăng ký…' : !state.demo && !state.push ? 'Kết nối lại thông báo' : 'Cho phép thông báo'}</button><button class="secondary-button" data-action="test-push" ${state.demo || !state.pushInfo?.ready || state.pushBusy || state.pushSending ? 'disabled' : ''}>${state.pushSending ? 'Đang gửi…' : 'Gửi thông báo thử'}</button></div>${state.demo ? '' : pushDiagnostics()}<p class="field-hint">Thông báo thử chỉ xác nhận gửi khi hệ thống chấp nhận. Hãy kiểm tra thông báo trên iPhone của bạn.</p></section>
    <section class="panel settings-section"><div class="section-title-icon">${icon('download')}<h2>Dữ liệu cá nhân</h2></div><p class="section-description">Xuất công việc, lịch sử chuyển ngày, ghi chép và cài đặt dưới dạng JSON.</p><div class="button-row"><button class="secondary-button" data-action="export">${icon('download')} Xuất dữ liệu cá nhân</button>${!state.demo ? '<button class="text-button logout-button" data-action="logout">'+icon('logout')+' Đăng xuất</button>' : '<button class="text-button" data-action="reset-demo">Đặt lại bản trải nghiệm</button>'}</div></section></div>
    </div>`;
}
function resizeTaskFields() {
  document.querySelectorAll('textarea[data-task], textarea[data-reason]').forEach(input => {
    input.style.height = 'auto'; input.style.height = `${input.scrollHeight + 2}px`;
  });
}
function receiveAppearance(user) {
  state.appearance = readAppearance(localStorage, user);
  storeAppearance(localStorage, user?.id, state.appearance);
  if (!editingReminderTime()) applyAppearance(document.documentElement, state.appearance);
}
function syncAppearance() {
  if (appearanceSync || !state.user || !state.appearance.pending) return;
  const userId = state.user.id;
  appearanceSync = (async () => {
    try {
      while (state.user?.id === userId && state.appearance.pending) {
        const preference = { ...state.appearance };
        const db = await getClient();
        if (state.user?.id !== userId) return;
        await saveAccountAppearance(db.auth, userId, preference);
        if (state.user?.id !== userId) return;
        if (state.appearance.updatedAt === preference.updatedAt) {
          state.appearance.pending = false; storeAppearance(localStorage, userId, state.appearance);
        }
      }
    } catch { /* The selected size remains on this device and retries when online. */ }
    finally { appearanceSync = null; if (state.user && state.user.id !== userId) syncAppearance(); }
  })();
}
function chooseFontSize(fontSize) {
  if (!FONT_OPTIONS.some(option => option.value === fontSize)) return;
  state.appearance = { fontSize, updatedAt: Math.max(Date.now(), state.appearance.updatedAt + 1), pending: !state.demo };
  if (!storeAppearance(localStorage, state.user?.id, state.appearance)) toast('Chưa lưu được cỡ chữ trên thiết bị. Bộ nhớ có thể đã đầy.');
  applyAppearance(document.documentElement, state.appearance); render(); syncAppearance();
}
function render() {
  // A native iOS picker belongs to its input DOM node. Replacing that node closes
  // the picker even if focus is restored afterwards. Apply background UI changes
  // only after this edit ends; account changes must still replace private content.
  if (editingReminderTime() || (reminderTimePointerOwner !== null && reminderTimePointerOwner === reminderTimeOwner())) { renderAfterTimeEdit = true; renderStatus(); return; }
  renderAfterTimeEdit = false;
  applyAppearance(document.documentElement, state.appearance);
  const focused = document.activeElement, id = focused?.id, selection = typeof focused?.selectionStart === 'number' ? [focused.selectionStart, focused.selectionEnd] : null;
  const content = state.view === 'today' ? todayPage() : state.view === 'journey' ? journeyPage() : settingsPage();
  app.innerHTML = shell(content);
  for (const [draftId, draft] of textDrafts) { const input = document.getElementById(draftId); if (input) { input.value = draft.value; textDrafts.set(draftId, input); } }
  resizeTaskFields();
  if (id) { const input = document.getElementById(id); if (input) { input.focus({ preventScroll: true }); if (selection && input.setSelectionRange) try { input.setSelectionRange(...selection); } catch {} } }
}
function openDialog(title, content) { dialog.innerHTML = `<div class="dialog-header"><h2 id="dialog-title">${title}</h2><button class="icon-button" data-dialog-close aria-label="Đóng">${icon('close')}</button></div>${content}`; dialog.showModal(); }
function showLogin(mode = 'password') {
  if (state.booting) return toast('Đang kiểm tra phiên đăng nhập, vui lòng chờ một chút.');
  if (!configured) { openDialog('Không gian thật đang được chuẩn bị', '<p class="dialog-copy">Bản này đang ở chế độ trải nghiệm. Đăng nhập và đồng bộ sẽ được mở sau khi chủ ứng dụng kết nối dịch vụ tài khoản.</p><button class="primary-button" data-dialog-close>Tiếp tục trải nghiệm</button>'); return; }
  if (mode === 'email') {
    openDialog('Đăng nhập bằng email', `<p class="dialog-copy">Nhận liên kết đăng nhập qua email như trước đây.</p><form id="login-form"><label for="login-email">Email của bạn</label><input id="login-email" name="email" type="email" autocomplete="email" placeholder="ban@example.com" required><button class="primary-button" type="submit">Gửi email đăng nhập ${icon('arrow')}</button><p id="auth-message" role="status"></p></form><button class="text-button" data-action="login">Đăng nhập bằng mật khẩu</button>`);
    return;
  }
  openDialog('Chào bạn đến với Super Day', `<p class="dialog-copy">Đăng nhập bằng email và mật khẩu của tài khoản hiện có.</p><form id="password-login-form"><label for="login-email">Email của bạn</label><input id="login-email" name="email" type="email" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="ban@example.com" required><label for="login-password">Mật khẩu</label><input id="login-password" name="password" type="password" autocomplete="current-password" required><button class="primary-button" type="submit">Đăng nhập ${icon('arrow')}</button><p id="auth-message" role="status" aria-live="polite"></p></form><p class="field-hint">Chưa có mật khẩu? Trên máy tính đang đăng nhập, mở Cài đặt → Thiết lập hoặc thay đổi mật khẩu.</p><button class="text-button" data-action="email-login">Đăng nhập bằng liên kết email</button>`);
}
function showPasswordChange() {
  if (state.demo || !state.user) return showLogin();
  openDialog('Thiết lập hoặc thay đổi mật khẩu', `<p class="dialog-copy">Thiết lập mật khẩu cho tài khoản <strong>${e(state.user.email)}</strong>. Sau đó dùng cùng email và mật khẩu này trên iPhone.</p><form id="password-change-form"><label for="new-password">Mật khẩu mới</label><input id="new-password" name="password" type="password" autocomplete="new-password" minlength="8" required><label for="confirm-password">Nhập lại mật khẩu mới</label><input id="confirm-password" name="confirmation" type="password" autocomplete="new-password" minlength="8" required><div id="password-reauth" hidden><p class="field-hint">Đây là bước xác thực bổ sung do Supabase yêu cầu cho lần đổi mật khẩu này. Nếu thiết lập lần đầu, bạn cũng có thể dùng liên kết email hiện có để tạo phiên đăng nhập mới, rồi quay lại Cài đặt.</p><button class="text-button" type="button" data-action="password-reauth">Gửi mã xác thực lại</button><label for="password-nonce">Mã xác thực trong email</label><input id="password-nonce" name="nonce" inputmode="numeric" autocomplete="one-time-code" placeholder="Nhập mã xác thực lại"></div><button class="primary-button" type="submit">Cập nhật mật khẩu ${icon('check')}</button><p id="auth-message" role="status" aria-live="polite"></p></form><p class="field-hint">Dùng ít nhất 8 ký tự và đáp ứng quy tắc bảo mật của tài khoản. Mật khẩu được gửi trực tiếp đến Supabase Auth.</p>`);
}

function exportData() {
  const blob = new Blob([JSON.stringify({ product: 'Super Day', schema_version: 1, exported_at: new Date().toISOString(), mode: state.demo ? 'demo' : 'account', email: state.user?.email || null, ...state.data, pending_changes: state.outbox }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `super-day-${today()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); toast('Đã xuất dữ liệu của bạn.');
}
function openDay(date) { state.selectedDate = date; state.view = 'journey'; state.anchor = date; render(); document.querySelector('.detail-heading')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
async function carry(id) {
  const t = state.data.tasks.find(x => x.id === id); if (!t) return;
  if (state.data.tasks.filter(t => t.date === today()).length >= 3) return toast('Hôm nay đã có đủ ba việc. Hãy dành chỗ trước khi chuyển.');
  if (state.demo) {
    const slot = [1,2,3].find(n => !state.data.tasks.some(t => t.date === today() && t.slot === n));
    state.data.tasks.push({ ...t, id: crypto.randomUUID(), date: today(), slot, previous_task_id: t.id, carry_count: t.carry_count + 1 }); saveLocal();
  } else {
    await flush(); if (state.outbox.length) return toast('Hãy đồng bộ các thay đổi trước khi chuyển công việc.');
    try { const uid = state.user.id; const task = await mutate({ id: crypto.randomUUID(), kind: 'carry', payload: { id, target: today() } }); if (state.user?.id !== uid) return; state.data.tasks.push(task); saveLocal(); }
    catch (err) { toast(err.message); return; }
  }
  dialog.close(); state.selectedDate = null; navigate('today'); toast('Đã dành một vị trí hôm nay cho công việc này.');
}
async function handleAction(action) {
  if (action === 'login') return showLogin();
  if (action === 'email-login') return showLogin('email');
  if (action === 'change-password') return showPasswordChange();
  if (action === 'password-reauth') {
    const form = dialog.querySelector('#password-change-form'); if (!form || state.demo || !state.user) return;
    const button = form.querySelector('[data-action="password-reauth"]'), message = form.querySelector('#auth-message');
    button.disabled = true; message.textContent = 'Đang yêu cầu mã xác thực lại…';
    try {
      const db = await getClient(); const { error } = await db.auth.reauthenticate(); if (error) throw error;
      message.textContent = 'Đã yêu cầu gửi mã xác thực lại đến email tài khoản. Nhập mã rồi bấm Cập nhật mật khẩu.';
      form.elements.nonce.focus();
    } catch (err) { message.textContent = passwordErrorMessage(err, true); }
    finally { button.disabled = false; }
  }
  if (action === 'account') return navigate('settings');
  if (action === 'back-today') { state.selectedDate = null; render(); }
  if (action === 'current-period') { state.anchor = today(); state.selectedDate = null; render(); }
  if (action === 'close-detail') { state.selectedDate = null; render(); }
  if (action === 'export') exportData();
  if (action === 'reset-demo') { state.data = demoData(); saveLocal(); render(); toast('Đã đặt lại dữ liệu trải nghiệm.'); }
  if (action === 'retry') { state.syncError = ''; await flush(); await refresh(); render(); }
  if (action === 'resolve') openDialog('Chọn cách giữ thay đổi', '<p class="dialog-copy">Bản nháp trên thiết bị có thể khác dữ liệu đã lưu. Bạn có thể xuất dữ liệu trước khi chọn.</p><div class="dialog-actions"><button class="primary-button" data-action="force-drafts">Dùng thay đổi của tôi</button><button class="secondary-button" data-action="discard-drafts">Bỏ bản nháp, tải lại dữ liệu đã lưu</button><button class="text-button" data-action="export">Xuất dữ liệu trước</button></div>');
  if (action === 'force-drafts') { for (const op of state.outbox) { op.payload.expected = {}; } state.syncError = ''; saveLocal(); dialog.close(); await flush(); await refresh(); render(); }
  if (action === 'discard-drafts') { try { const data = await loadAccount(); state.data = data; state.outbox = []; state.syncError = ''; saveLocal(); dialog.close(); render(); } catch (err) { toast('Chưa tải được dữ liệu. Bản nháp vẫn được giữ.'); } }
  if (action === 'leftovers') openDialog('Những việc còn dang dở', `<p class="dialog-copy">Chủ động chọn một việc để chuyển sang hôm nay. Mỗi việc chiếm một trong ba vị trí.</p><div class="leftovers-list">${outstanding(state.data.tasks).filter(t => t.date < today()).map(t => `<div class="history-task"><div><strong>${e(t.title)}</strong><small>${e(dateLabel(t.date))} · Chuyển ${t.carry_count} lần</small></div><button class="icon-button" data-carry="${t.id}" aria-label="Chuyển ${e(t.title)}">${icon('arrow')}</button></div>`).join('')}</div>`);
  if (action === 'enable-push') {
    if (state.demo) return showLogin();
    if (state.pushBusy) return;
    const userId = state.user.id;
    state.pushBusy = true; state.pushError = ''; state.pushStatus = 'Đang tạo Push Token và đăng ký thiết bị…'; render();
    try {
      if (!state.push) {
        await connectPush(userId);
        if (state.user?.id === userId) toast('Kết nối đã sẵn sàng. Hãy bấm Cho phép thông báo để đăng ký từ thao tác của bạn.');
      } else {
        const info = await registerPush(state.push, userId, {
          isCurrentUser: () => state.user?.id === userId,
          onProgress: info => {
            if (state.user?.id !== userId) return;
            ++pushInspection;
            if (JSON.stringify(state.pushInfo) !== JSON.stringify(info)) { state.pushInfo = info; render(); }
          },
        });
        if (state.user?.id === userId) { state.pushInfo = info; toast('Đã có Push Token và đăng ký nhận thông báo hợp lệ.'); }
      }
    } catch (error) {
      if (state.user?.id === userId) {
        if (error.pushDetails) state.pushInfo = error.pushDetails;
        state.pushError = describePushError(error);
      }
    } finally {
      if (state.user?.id === userId) {
        state.pushBusy = false;
        state.pushStatus = state.push ? pushStateLabel(state.pushInfo) : 'Chưa kết nối được hệ thống thông báo';
        render();
      }
    }
  }
  if (action === 'test-push') {
    if (!state.push || state.pushSending || state.pushBusy) return;
    const userId = state.user.id;
    state.pushSending = true; state.pushError = ''; render();
    try {
      const info = await inspectPush(state.push, userId);
      if (state.user?.id !== userId) return;
      state.pushInfo = info; state.pushStatus = pushStateLabel(info);
      if (!info.ready) { state.pushError = 'Thiết bị chưa đăng ký đầy đủ. Hãy bấm Cho phép thông báo và xem Chi tiết đăng ký bên dưới.'; return; }
      await edge('test');
      if (state.user?.id === userId) toast('Hệ thống đã chấp nhận gửi. Hãy kiểm tra thông báo thực tế trên iPhone.');
    } catch (error) { if (state.user?.id === userId) state.pushError = `Gửi thông báo thử: ${describePushError(error)}`; }
    finally { if (state.user?.id === userId) { state.pushSending = false; render(); } }
  }
  if (action === 'logout') {
    await flush(); if (state.outbox.length) return toast('Hãy đồng bộ hoặc xử lý bản nháp trước khi đăng xuất.');
    try { await detachPush(); } catch { return toast('Chưa gỡ được liên kết thông báo trên thiết bị. Hãy kết nối mạng rồi thử lại.'); }
    const db = await getClient(); const { error } = await db.auth.signOut({ scope: 'local' }); if (error) toast('Chưa đăng xuất được. Hãy thử lại.');
  }
}
// Commit text after a short pause; flush when leaving a field. Expected field values protect edits on another device.
const textTimers = new Map();
const textDrafts = new Map();
const reminderTimeOwner = () => state.demo ? 'demo' : state.user?.id;
const validReminderTime = value => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
function editingReminderTime() {
  if (reminderTimeEdit && (reminderTimeEdit.owner !== reminderTimeOwner() || !reminderTimeEdit.element.isConnected)) reminderTimeEdit = null;
  return reminderTimeEdit;
}
function beginReminderTime(el) {
  if (!state.data.reminders.some(reminder => reminder.kind === el.dataset.reminderTime)) return;
  const current = editingReminderTime();
  if (current?.element === el) return;
  if (current) finishReminderTime(current.element);
  reminderTimeEdit = { owner: reminderTimeOwner(), element: el };
  const done = document.getElementById(`time-done-${el.dataset.reminderTime}`);
  if (done) done.hidden = false;
  renderStatus();
}
function saveReminderTime(el, reportInvalid = false) {
  if (!el?.isConnected) return;
  if (reminderTimeEdit?.element === el && reminderTimeEdit.owner !== reminderTimeOwner()) return;
  const reminder = state.data.reminders.find(reminder => reminder.kind === el.dataset.reminderTime);
  if (!reminder) return;
  // Native controls expose HH:mm in both 12-hour and 24-hour device locales.
  // Keep this as account-local wall time: never parse it through Date/UTC.
  if (!validReminderTime(el.value) || !el.validity.valid) {
    if (reportInvalid) { el.value = reminder.time.slice(0, 5); toast('Hãy chọn đầy đủ giờ và phút. Giờ đã lưu được giữ nguyên.'); }
    return;
  }
  if (el.value !== reminder.time.slice(0, 5)) queue('reminder', { kind: reminder.kind, patch: { time: el.value } }, false);
}
function finishReminderTime(el = editingReminderTime()?.element) {
  if (!el?.isConnected) return;
  saveReminderTime(el, true);
  if (reminderTimeEdit?.element === el) reminderTimeEdit = null;
  const done = document.getElementById(`time-done-${el.dataset.reminderTime}`);
  if (done) done.hidden = true;
  renderStatus();
  // Let the next control receive its click/focus before any deferred repaint.
  renderAfterReminderTime();
}
function renderAfterReminderTime() {
  if (renderAfterTimeEdit) setTimeout(() => {
    if (renderAfterTimeEdit && reminderTimePointerOwner === null) render();
  }, 0);
}
// A blur caused by pointer-down must not repaint away the button before its
// pointer-up/click, especially during a longer tap on iPhone.
document.addEventListener('pointerdown', event => {
  if (event.target.closest('button,a') && (editingReminderTime() || renderAfterTimeEdit)) reminderTimePointerOwner = reminderTimeOwner();
}, { capture: true, passive: true });
for (const name of ['pointerup', 'pointercancel']) document.addEventListener(name, () => {
  reminderTimePointerOwner = null; renderAfterReminderTime();
}, { passive: true });
document.addEventListener('focusin', event => { if (event.target.matches('[data-reminder-time]')) beginReminderTime(event.target); });
document.addEventListener('keydown', event => {
  if (event.target.matches('[data-reminder-time]') && event.key === 'Enter') { event.preventDefault(); finishReminderTime(event.target); event.target.blur(); }
});
function commitText(el) {
  const date = el.dataset.editDate;
  if (el.dataset.task) {
    const slot = +el.dataset.task, task = state.data.tasks.find(t => t.date === date && t.slot === slot), value = el.value.trim();
    if ((task?.title || '') === value) return;
    queue('task', { date, slot, id: task?.id || crypto.randomUUID(), patch: { title: value }, expected: { title: task?.title || '' } }, false);
    const row = document.getElementById(el.id)?.closest('.task'); if (row) { row.classList.toggle('is-empty', !value); const check = row.querySelector('.task-check'); check.disabled = !value; }
  } else if (el.dataset.reason) {
    const slot = +el.dataset.reason, task = state.data.tasks.find(t => t.date === date && t.slot === slot); if (!task || task.reason === el.value) return;
    queue('task', { date, slot, id: task.id, patch: { reason: el.value }, expected: { reason: task.reason } }, false);
  } else if (el.dataset.reflection) {
    const d = state.data.days.find(d => d.date === el.dataset.reflection); if ((d?.reflection || '') === el.value) return;
    queue('day', { date: el.dataset.reflection, patch: { reflection: el.value }, expected: { reflection: d?.reflection || '' } }, false);
    const counter = document.getElementById(el.id)?.closest('.reflection')?.querySelector('.reflection-bottom>span:last-child'); if (counter) counter.textContent = `${el.value.length.toLocaleString('vi-VN')} ký tự`;
  } else if (el.dataset.profile) { const field = el.dataset.profile; if (state.data.profile[field] !== el.value) queue('profile', { patch: { [field]: el.value } }, false); }
}
function flushText(id) { const draft = textDrafts.get(id); if (!draft) return; clearTimeout(textTimers.get(id)); textTimers.delete(id); textDrafts.delete(id); commitText(draft); }
function flushAllText() { for (const id of [...textDrafts.keys()]) flushText(id); }
document.addEventListener('input', event => {
  const el = event.target; if (!el.matches('[data-task],[data-reason],[data-reflection],[data-profile="display_name"]')) return;
  if (el.matches('textarea[data-task],textarea[data-reason]')) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight + 2}px`; }
  clearTimeout(textTimers.get(el.id)); textDrafts.set(el.id, el); textTimers.set(el.id, setTimeout(() => flushText(el.id), 650));
});
document.addEventListener('focusout', event => {
  if (textDrafts.has(event.target.id)) flushText(event.target.id);
  if (event.target.matches('[data-reminder-time]')) finishReminderTime(event.target);
});
document.addEventListener('change', event => {
  const el = event.target;
  if (el.matches('select[data-profile]')) queue('profile', { patch: { [el.dataset.profile]: el.value } });
  if (el.dataset.reminderTime) {
    if (document.activeElement === el) beginReminderTime(el);
    else saveReminderTime(el, true);
  }
});
document.addEventListener('click', async event => {
  const el = event.target.closest('button,[data-nav]'); if (!el || el.disabled) return;
  flushAllText();
  const timeInput = editingReminderTime()?.element;
  if (timeInput) { finishReminderTime(timeInput); timeInput.blur(); }
  if (el.dataset.reminderDone) return;
  if (el.hasAttribute('data-dialog-close')) { dialog.close(); return; }
  if (el.dataset.fontSize) { chooseFontSize(el.dataset.fontSize); return; }
  if (el.dataset.nav) navigate(el.dataset.nav);
  if (el.dataset.date) { state.selectedDate = el.dataset.date; render(); }
  if (el.dataset.openDay) openDay(el.dataset.openDay);
  if (el.dataset.range) { state.range = el.dataset.range; state.selectedDate = null; render(); }
  if (el.dataset.period) { state.anchor = shiftDate(state.anchor, state.range === 'week' ? +el.dataset.period * 7 : +el.dataset.period * (el.dataset.period === '1' ? monthDates(state.anchor).length - (+state.anchor.slice(8) - 1) : +state.anchor.slice(8))); state.selectedDate = null; render(); }
  if (el.dataset.complete) {
    const slot = +el.dataset.complete, date = el.dataset.editDate, t = state.data.tasks.find(t => t.date === date && t.slot === slot);
    if (t) queue('task', { date, slot, id: t.id, patch: { completed: !t.completed }, expected: { completed: t.completed } });
  }
  if (el.dataset.closeDay) { const d = state.data.days.find(d => d.date === el.dataset.closeDay); const wasClosed = !!d?.closed_at; queue('day', { date: el.dataset.closeDay, patch: { closed_at: d?.closed_at ? null : new Date().toISOString() } }); if (!wasClosed) toast('Cảm ơn bạn đã dành thời gian cho ngày hôm nay.'); }
  if (el.dataset.reminderToggle) { const r = state.data.reminders.find(r => r.kind === el.dataset.reminderToggle); queue('reminder', { kind: r.kind, patch: { enabled: !r.enabled } }); }
  if (el.dataset.carry) await carry(el.dataset.carry);
  if (el.dataset.action) await handleAction(el.dataset.action);
});
dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
// Keep secrets only in password inputs while this dialog is open, never in saved drafts or app state.
dialog.addEventListener('close', () => {
  dialog.querySelectorAll('input[type="password"], input[name="nonce"]').forEach(input => { input.value = ''; });
});
document.addEventListener('submit', async event => {
  const form = event.target;
  if (!['password-login-form', 'password-change-form'].includes(form.id)) return;
  event.preventDefault();
  const changing = form.id === 'password-change-form';
  if (changing && (state.demo || !state.user)) return;
  const button = form.querySelector('button[type="submit"]'), message = form.querySelector('#auth-message');
  if (button.disabled) return;
  button.disabled = true; message.textContent = changing ? 'Đang cập nhật mật khẩu…' : 'Đang đăng nhập…';
  try {
    const db = await getClient();
    if (changing) {
      const { user } = await changePassword(db.auth, { password: form.elements.password.value, confirmation: form.elements.confirmation.value, nonce: form.elements.nonce.value });
      if (state.user?.id === user.id) state.user = user;
      form.reset(); form.querySelector('#password-reauth').hidden = true;
      message.textContent = 'Đã cập nhật mật khẩu. Bạn có thể dùng email và mật khẩu này để đăng nhập trên iPhone và máy tính.';
    } else {
      await signInPassword(db.auth, form.elements.email.value, form.elements.password.value);
      form.reset(); dialog.close();
    }
  } catch (err) {
    message.textContent = passwordErrorMessage(err, changing);
    if (changing && needsPasswordReauth(err)) form.querySelector('#password-reauth').hidden = false;
  } finally { button.disabled = false; }
});
document.addEventListener('submit', async event => {
  if (event.target.id !== 'login-form' && event.target.id !== 'otp-form') return;
  event.preventDefault(); const form = event.target, button = form.querySelector('button[type="submit"]'); button.disabled = true;
  const message = document.querySelector('#auth-message'); message.textContent = 'Đang gửi…';
  try {
    const db = await getClient(); const email = form.elements.email.value.trim();
    if (form.id === 'login-form') {
      const { error } = await db.auth.signInWithOtp({ email, options: { emailRedirectTo: new URL('../', import.meta.url).href } }); if (error) throw error;
      openDialog('Kiểm tra hộp thư của bạn', `<p class="dialog-copy">Email đăng nhập đã được gửi đến <strong>${e(email)}</strong>. Nhấn liên kết trong email hoặc nhập mã nếu email có mã xác nhận.</p><form id="otp-form"><input name="email" type="hidden" value="${e(email)}"><label for="otp-code">Mã xác nhận</label><input id="otp-code" name="token" inputmode="numeric" pattern="[0-9]{6,8}" maxlength="8" autocomplete="one-time-code" required placeholder="Nhập mã trong email"><button class="primary-button" type="submit">Mở không gian của tôi ${icon('arrow')}</button><p id="auth-message" role="status"></p></form><button class="text-button" data-action="email-login">Dùng email khác hoặc gửi lại</button>`);
    } else {
      const { error } = await db.auth.verifyOtp({ email, token: form.elements.token.value, type: 'email' }); if (error) throw error; dialog.close();
    }
  } catch { message.textContent = 'Chưa thực hiện được. Kiểm tra email, mã xác nhận và kết nối rồi thử lại.'; button.disabled = false; }
});
async function enterAccount(user) {
  if (state.user?.id === user.id) return;
  stopPushObservation?.(); stopPushObservation = null; ++pushInspection;
  state.user = user; receiveAppearance(user); state.demo = false; state.syncError = ''; state.push = null; state.pushInfo = null; state.pushError = ''; state.pushBusy = false; state.pushSending = false; state.pushStatus = 'Đang chuẩn bị kết nối…';
  const cached = read(storageKey(), null); state.data = cached?.data || blankData(); state.outbox = cached?.outbox || []; state.loading = !cached; render();
  await refresh(); state.loading = false; state.booting = false; render(); syncAppearance();
  if (config.oneSignalAppId) {
    try { await connectPush(user.id); if (state.user?.id !== user.id) return; state.pushStatus = pushStateLabel(state.pushInfo); }
    catch (error) { if (state.user?.id === user.id) { state.pushStatus = 'Chưa chuẩn bị được đăng ký thông báo'; state.pushError = describePushError(error); } }
  } else state.pushStatus = 'Hệ thống thông báo chưa được kết nối';
  render();
  if (document.fonts) document.fonts.ready.then(resizeTaskFields);
  if (new URL(location.href).searchParams.get('focus') === 'reflection' && state.view === 'today') requestAnimationFrame(() => document.querySelector('#reflection')?.scrollIntoView({ block: 'start' }));
}
async function boot() {
  render();
  if (document.fonts) document.fonts.ready.then(resizeTaskFields);
  if (new URL(location.href).searchParams.get('focus') === 'reflection') requestAnimationFrame(() => document.querySelector('#reflection')?.scrollIntoView({ block: 'start' }));
  if ('serviceWorker' in navigator) navigator.serviceWorker.register(new URL('../sw.js', import.meta.url), { scope: new URL('../', import.meta.url).pathname }).catch(() => toast('Chưa chuẩn bị được chế độ mở ứng dụng khi ngoại tuyến.'));
  if (configured) {
    try {
      const db = await getClient();
      db.auth.onAuthStateChange((event, session) => {
        if (session?.user) setTimeout(() => {
          if (state.user?.id !== session.user.id) { dialog.close(); enterAccount(session.user); }
          else {
            state.user = session.user; receiveAppearance(session.user); render();
            // USER_UPDATED and token refreshes must leave the password-change form and its result visible.
            if (event === 'SIGNED_IN' && dialog.querySelector('#password-login-form, #login-form, #otp-form')) dialog.close();
          }
        }, 0);
        else if (event === 'SIGNED_OUT') {
          stopPushObservation?.(); stopPushObservation = null; ++pushInspection;
          state.pushInfo = null; state.pushError = ''; state.pushBusy = false; state.pushSending = false;
          dialog.close();
          const previousKey = storageKey(), hadDrafts = state.outbox.length > 0; state.user = null; receiveAppearance(null); state.demo = true; state.data = read('super-day:demo:v1', null) || demoData(); state.outbox = []; state.syncError = ''; state.push = null; state.loading = false; state.booting = false; if (!hadDrafts) localStorage.removeItem(previousKey); render();
        }
      });
      const { data, error } = await db.auth.getSession(); if (error) throw error;
      if (data.session) await enterAccount(data.session.user);
    } catch { state.authError = 'Chưa kiểm tra được phiên đăng nhập. Hãy kiểm tra kết nối và tải lại trang.'; }
    state.booting = false; render();
  }
}
window.addEventListener('online', async () => { if (!state.syncError.includes('CONFLICT')) state.syncError = ''; await flush(); await refresh(); syncAppearance(); render(); });
window.addEventListener('focus', () => refresh());
window.addEventListener('resize', () => requestAnimationFrame(resizeTaskFields));
window.addEventListener('pagehide', () => { saveReminderTime(editingReminderTime()?.element); flushAllText(); saveLocal(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { saveReminderTime(editingReminderTime()?.element); flushAllText(); saveLocal(); } else refresh(); });
setInterval(() => {
  const clock = document.querySelector('#clock'); if (clock) clock.textContent = formatTime();
  if (today() !== lastDate) { flushAllText(); state.selectedDate = null; lastDate = today(); render(); }
  if (document.visibilityState === 'visible') refresh();
}, 60000);
let lastDate = today();
boot();
