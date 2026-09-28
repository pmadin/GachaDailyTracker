/**
 * Schema guard: fails (exit 1) when the database at DATABASE_URL is missing a table or column
 * that database/init/01-schema.sql declares.
 *
 * Runs as the Heroku release phase (see Procfile), so a deploy whose code expects a column
 * prod doesn't have yet is refused and the previous release keeps serving. Built after
 * users.streak_best shipped without its migration and broke live streaks for ~4 days
 * (Sep 2026). Fix a failure by running the missing migration on Heroku, then redeploying.
 *
 * Local: npm run check:schema (built) or npm run check:schema:ts (reads .env).
 *
 * Uses its own pg Pool instead of src/config/database.ts on purpose: that module logs every
 * query and prints DATABASE_URL on connection errors, which would land in the release log.
 */
import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { parseExpectedColumns, diffSchema, type ExpectedSchema } from './schemaParse';

const SCHEMA_FILE = path.resolve(__dirname, '../../database/init/01-schema.sql');

async function main(): Promise<number> {
  if (!process.env.DATABASE_URL) {
    try {
      // Local convenience only; Heroku sets DATABASE_URL itself.
      (await import('dotenv')).config({ path: path.resolve(__dirname, '../../.env') });
    } catch {
      // dotenv missing is fine
    }
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('✗ schema check: DATABASE_URL is not set');
    return 1;
  }

  const expected = parseExpectedColumns(fs.readFileSync(SCHEMA_FILE, 'utf8'));
  if (expected.size === 0) {
    console.error(`✗ schema check: found no CREATE TABLE blocks in ${SCHEMA_FILE}`);
    return 1;
  }

  const pool = new Pool({
    connectionString: url,
    ssl: url.includes('localhost') ? false : { rejectUnauthorized: false },
  });
  let actual: ExpectedSchema;
  try {
    const { rows } = await pool.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name
         FROM information_schema.columns
        WHERE table_schema = 'public'`
    );
    actual = new Map();
    for (const r of rows) {
      const t = r.table_name.toLowerCase();
      if (!actual.has(t)) actual.set(t, new Set());
      actual.get(t)!.add(r.column_name.toLowerCase());
    }
  } catch (err: unknown) {
    // Messages only: never print the connection string. Connection refusals arrive as an
    // AggregateError with an empty message and the real reasons in .errors.
    const nested: unknown[] =
      err && typeof err === 'object' && Array.isArray((err as { errors?: unknown }).errors)
        ? (err as { errors: unknown[] }).errors
        : [err];
    const reasons = nested.map((e: unknown) => (e instanceof Error ? e.message || e.name : String(e))).join('; ');
    console.error('✗ schema check: could not read the database schema:', reasons);
    return 1;
  } finally {
    await pool.end().catch(() => {});
  }

  const diff = diffSchema(expected, actual);
  for (const c of diff.extraColumns) console.warn(`  ! ${c} exists in the database but not in 01-schema.sql`);

  if (diff.missingTables.length || diff.missingColumns.length) {
    console.error('✗ schema check FAILED: the database is behind database/init/01-schema.sql');
    for (const t of diff.missingTables) console.error(`  ✗ table ${t}`);
    for (const c of diff.missingColumns) console.error(`  ✗ ${c}`);
    console.error('Run the missing migration on the database (see the migrations list in CLAUDE.md), then redeploy.');
    return 1;
  }

  const columnCount = [...expected.values()].reduce((n, s) => n + s.size, 0);
  console.log(`✓ schema OK (${expected.size} tables, ${columnCount} columns)`);
  return 0;
}

main().then(code => process.exit(code));
