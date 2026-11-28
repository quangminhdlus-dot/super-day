import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Install astronomy-engine@2.1.19 into a scratch directory and pass that path.
if (!process.argv[2]) throw Error('Usage: node scripts/generate-vn-lunar.mjs <directory containing node_modules>');
const { SearchMoonPhase, SearchSunLongitude, SunPosition } =
  createRequire(resolve(process.argv[2], 'package.json'))('astronomy-engine');
const DAY = 86400000, TZ = 7 * 3600000;
const localDay = time => Math.floor((time.date.getTime() + TZ) / DAY);
const start = new Date('1998-10-01T00:00Z'), until = Date.UTC(2102, 1);
const moons = [];
for (let date = start; +date < until;) {
  const moon = SearchMoonPhase(0, date, 40);
  moons.push(localDay(moon));
  date = new Date(+moon.date + DAY);
}
const winter = [];
for (let year = 1998; year <= 2101; year++) {
  const solstice = localDay(SearchSunLongitude(270, new Date(Date.UTC(year, 11, 15)), 14));
  winter.push(moons.findLastIndex(moon => moon <= solstice));
}
const sector = day => Math.floor(SunPosition(new Date(day * DAY - TZ)).elon / 30);
const rows = [];
for (let i = 0; i < winter.length - 1; i++) {
  const a = winter[i], b = winter[i + 1];
  if (b - a !== 12 && b - a !== 13) throw Error('Invalid solstice interval');
  const leap = b - a === 13
    ? moons.findIndex((_, index) => index > a && index < b && sector(moons[index]) === sector(moons[index + 1]))
    : -1;
  if (b - a === 13 && leap < 0) throw Error('Missing leap month');
  let month = 11, year = 1998 + i;
  for (let j = a; j < b; j++) {
    if (j > a && j !== leap) {
      month = month % 12 + 1;
      if (month === 1) year++;
    }
    rows.push([moons[j], month, year, +(j === leap)]);
  }
}
const first = rows.findLastIndex(row => row[0] <= Date.UTC(2000, 0, 1) / DAY);
const last = rows.findIndex(row => row[0] > Date.UTC(2100, 11, 31) / DAY);
const packed = rows.slice(first, last + 1).map((row, i) =>
  [i ? row[0] - rows[first + i - 1][0] : row[0], row[1], row[2], row[3]]);
const lines = packed.map(row => row.join(',')).join(';').match(/.{1,120}/g);
await writeFile('src/lib/vn-lunar-data.js', '// Generated UTC+7 month starts; see scripts/generate-vn-lunar.mjs.\nexport default [\n' +
  lines.map(line => '  ' + JSON.stringify(line) + ',').join('\n') + '\n].join(\'\');\n');
