import { build } from 'esbuild';
import { cp, mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises';
// Bundle the official Supabase SDK locally so the installed PWA can load it offline.
let local = {};
try {
  const contents = await readFile('.env', 'utf8');
  local = Object.fromEntries(contents.split('\n').filter(s => /^\w+=/.test(s)).map(s => {
    const i = s.indexOf('='); return [s.slice(0, i), s.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')];
  }));
} catch { /* .env is optional. */ }
const value = key => process.env[key] ?? local[key] ?? '';
const version = process.env.GITHUB_SHA?.slice(0, 12) || String(Date.now());
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
// Version every local module URL, including imports: an older cache-first worker must
// fetch the new release instead of pairing new HTML with stale app/auth/push modules.
async function versionModules(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) await versionModules(path);
    else if (entry.name.endsWith('.js')) {
      const source = await readFile(path, 'utf8');
      await writeFile(path, source.replace(/((?:from\s*|import\(\s*)['"])(\.{1,2}\/[^'"]+\.js)(['"])/g, (_, before, url, after) => `${before}${url}?v=${version}${after}`));
    }
  }
}
await versionModules('dist/src');
const html = (await readFile('index.html', 'utf8')).replace('./src/app.js', `./src/app.js?v=${version}`).replace('./src/styles.css', `./src/styles.css?v=${version}`);
await writeFile('dist/index.html', html);
await writeFile('dist/config.js', `window.SUPER_DAY_CONFIG = ${JSON.stringify(config)};\n`);
await writeFile('dist/.nojekyll', '');
const worker = await readFile('dist/sw.js', 'utf8');
await writeFile('dist/sw.js', worker.replace('super-day-shell-dev', `super-day-shell-${version}`).replace("const VERSION = 'dev';", `const VERSION = '${version}';`));
console.log(`Đã tạo dist/. ${config.supabaseUrl ? 'Đã có cấu hình Supabase công khai.' : 'Chế độ trải nghiệm; chưa kết nối Supabase.'}`);
