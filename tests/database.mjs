import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
const files = ['tests/bootstrap.sql', 'supabase/migrations/202611060001_initial.sql', 'tests/database.sql'];
// CI uses a real isolated PostgreSQL service. Locally, PGlite executes the same SQL without Docker.
if (process.env.DATABASE_URL) {
  for (const file of files) {
    const result = spawnSync('psql', [process.env.DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-f', file], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status || 1);
  }
} else {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  try { for (const file of files) { await db.exec(await readFile(file, 'utf8')); console.log(`OK: ${file}`); } }
  catch (err) { console.error(`Database check failed: ${err.message} (SQLSTATE ${err.code}, position ${err.position || 'n/a'})`); process.exitCode = 1; }
  finally { await db.close(); }
}
