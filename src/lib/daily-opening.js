
import { dailyPlace } from './daily-places.js';
import { shatterPhoto } from './opening-shatter.js';

const PREFIX = 'super-day:opening:v1:';

export function createDailyOpening({ background, getContext, enterToday }) {
  const seen = new Set();
  let current;

  function hasSeen(key) {
    if (seen.has(key)) return true;
    try { return localStorage.getItem(key) === '1'; }
    catch { return false; }
  }

  function close(opening) {
    if (current !== opening) return;
    current = null;
    clearTimeout(opening.loadTimer);
    opening.stop?.();
    background.inert = false;
    opening.dialog.close();
    opening.dialog.remove();
    document.documentElement.classList.remove('has-daily-opening');
  }

  function show() {
    const context = getContext();
    if (!context || current || document.hidden) return;
    const { account, date } = context;
    const key = PREFIX + account + ':' + date;
    if (hasSeen(key)) return;
    const place = dailyPlace(date);
    if (!place) return;

    const dialog = document.createElement('dialog');
    dialog.className = 'daily-opening';
    dialog.setAttribute('aria-labelledby', 'opening-place-name');
    dialog.dataset.place = place.id;
    dialog.dataset.date = date;
    dialog.innerHTML = `<button type="button" class="opening-surface" aria-label="Mở Hôm nay" autofocus><img class="opening-photo" alt=""></button>
      <div class="opening-shade"></div><canvas class="opening-fragments" aria-hidden="true" hidden></canvas>
      <div class="opening-copy"><h1 id="opening-place-name"></h1><p class="opening-country"></p>
      <p class="opening-address"></p><ul class="opening-keywords" aria-label="Đặc điểm địa danh"></ul></div>`;

    dialog.querySelector('h1').textContent = place.name;
    dialog.querySelector('.opening-country').textContent = place.country;
    dialog.querySelector('.opening-address').textContent = place.address;
    for (const text of place.keywords) {
      const item = document.createElement('li');
      item.textContent = text;
      dialog.querySelector('ul').append(item);
    }

    const button = dialog.querySelector('button');
    const image = dialog.querySelector('img');
    const canvas = dialog.querySelector('canvas');
    image.style.objectPosition = place.position.map(part => part * 100 + '%').join(' ');
    const opening = { dialog, key, account, date, started: false };
    current = opening;

    function finish() {
      if (current !== opening) return;
      close(opening);
      enterToday();
    }

    button.addEventListener('click', event => {
      if (opening.started || current !== opening) return;
      opening.started = true;
      seen.add(key);
      try { localStorage.setItem(key, '1'); } catch { /* In-memory fallback for this page. */ }
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) { finish(); return; }
      const rect = button.getBoundingClientRect();
      const point = event.detail
        ? { x: event.clientX - rect.left, y: event.clientY - rect.top }
        : { x: rect.width / 2, y: rect.height / 2 };
      try {
        opening.stop = shatterPhoto(canvas, image, place.position, point, finish);
      } catch { finish(); return; }
      if (!opening.stop) { finish(); return; }
      canvas.hidden = false;
      dialog.classList.add('opening-is-breaking');
    });

    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      if (!opening.started) close(opening);
    });
    image.addEventListener('error', () => close(opening), { once: true });
    opening.loadTimer = setTimeout(() => close(opening), 1600);
    image.src = new URL(place.image, document.baseURI);
    image.decode().then(() => {
      if (current !== opening) return;
      const latest = getContext();
      if (!latest || latest.account !== account || latest.date !== date || hasSeen(key) || document.hidden) {
        close(opening);
        return;
      }
      clearTimeout(opening.loadTimer);
      document.body.append(dialog);
      dialog.showModal();
      background.inert = true;
      document.documentElement.classList.add('has-daily-opening');
    }).catch(() => close(opening));
  }

  return {
    show,
    reconcile() {
      if (!current) return;
      const context = getContext();
      if (!context || context.account !== current.account || context.date !== current.date ||
        (!current.started && hasSeen(current.key))) close(current);
    },
    onStorage(event) {
      if (current && !current.started && event.key === current.key && event.newValue === '1') close(current);
    },
  };
}
