import { build } from 'esbuild';
import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
// Bundle the official Supabase SDK locally so the installed PWA can load it offline.
let local = {};
try {
  const contents = await readFile('.env', 'utf8');
  local = Object.fromEntries(contents.split('\n').filter(s => /^\w+=/.test(s)).map(s => {
    const i = s.indexOf('='); return [s.slice(0, i), s.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')];
  }));
} catch { /* .env is optional. */ }
const value = key => process.env[key] ?? local[key] ?? '';
const config = { supabaseUrl: value('SUPABASE_URL'), supabaseAnonKey: value('SUPABASE_ANON_KEY'), oneSignalAppId: value('ONESIGNAL_APP_ID') };
if (config.supabaseAnonKey.startsWith('sb_secret_')) throw new Error('Chỉ được dùng publishable/anon key ở giao diện.');
try { const claims = JSON.parse(Buffer.from(config.supabaseAnonKey.split('.')[1], 'base64url')); if (claims.role === 'service_role') throw new Error('SECRET_KEY'); }
catch (e) { if (e.message === 'SECRET_KEY') throw new Error('Không đưa service_role key vào giao diện.'); }
if (Boolean(config.supabaseUrl) !== Boolean(config.supabaseAnonKey)) throw new Error('Cần cả SUPABASE_URL và SUPABASE_ANON_KEY.');
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await cp('public', 'dist', { recursive: true });
await cp('src', 'dist/src', { recursive: true });
await build({ stdin: { contents: "export { createClient } from '@supabase/supabase-js';", resolveDir: process.cwd() }, bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true, outfile: 'dist/vendor/supabase.js' });
await cp('index.html', 'dist/index.html');
await writeFile('dist/config.js', `window.SUPER_DAY_CONFIG = ${JSON.stringify(config)};\n`);
await writeFile('dist/.nojekyll', '');
const worker = await readFile('dist/sw.js', 'utf8');
await writeFile('dist/sw.js', worker.replace('super-day-shell-dev', `super-day-shell-${process.env.GITHUB_SHA?.slice(0, 10) || Date.now()}`));
console.log(`Đã tạo dist/. ${config.supabaseUrl ? 'Đã có cấu hình Supabase công khai.' : 'Chế độ trải nghiệm; chưa kết nối Supabase.'}`);
