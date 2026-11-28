import packedMonths from './vn-lunar-data.js';

const dayMs = 86400000;
let start = 0;
const months = packedMonths.split(';').map(row => {
  const [offset, month, year, leap] = row.split(',').map(Number);
  start += offset;
  return { start, month, year, leap: Boolean(leap) };
});

export function vietnameseLunar(date) {
  if (date < '2000-01-01' || date > '2100-12-31') return null;
  const number = Date.parse(date + 'T00:00:00Z') / dayMs;
  if (!Number.isInteger(number)) return null;
  let left = 0, right = months.length - 1;
  while (left < right) {
    const mid = Math.ceil((left + right) / 2);
    if (months[mid].start <= number) left = mid;
    else right = mid - 1;
  }
  const { start: day, month, year, leap } = months[left];
  return { day: number - day + 1, month, year, leap };
}
