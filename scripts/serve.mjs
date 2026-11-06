import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve(process.argv[2] || '.');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };
createServer(async (req, res) => {
  try {
    let name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (name.startsWith('/super-day/')) name = name.slice('/super-day'.length);
    if (name.endsWith('/')) name += 'index.html';
    let path = resolve(root, '.' + name);
    if (!path.startsWith(root + sep)) throw Error('path');
    if (!(await stat(path).catch(() => null)) && root === resolve('.')) path = resolve(root, 'public', '.' + name);
    const body = await readFile(path);
    res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(body);
  } catch { res.writeHead(404); res.end('Không tìm thấy'); }
}).listen(Number(process.env.PORT || 4173), '0.0.0.0', () => console.log('Super Day: http://localhost:4173/super-day/'));
