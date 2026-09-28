/**
 * Unit tests for the schema-file parser behind the release-phase schema check
 * (src/scripts/schemaParse.ts). Pure logic, no database. Run with: npm run test:schema
 */
import fs from 'fs';
import path from 'path';
import { parseExpectedColumns, diffSchema } from '../../src/scripts/schemaParse';

let failures = 0;
function check(name: string, ok: boolean, extra = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
  if (!ok) failures++;
}

const fixture = `
-- a comment line
CREATE TABLE users (
    id        SERIAL PRIMARY KEY,
    -- Streak tracking
    streak    INTEGER NOT NULL DEFAULT 0,  -- trailing comment
    email     VARCHAR(255) UNIQUE NOT NULL,
    UNIQUE(email),
    CONSTRAINT chk_streak CHECK (streak >= 0),
    PRIMARY KEY (id)
);

INSERT INTO users (id) VALUES (1);

CREATE TABLE IF NOT EXISTS site_settings (
    key   VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE INDEX idx_users_streak ON users(streak);
`;

const parsed = parseExpectedColumns(fixture);
const users = parsed.get('users');

check('finds both tables (incl. IF NOT EXISTS)', parsed.size === 2 && parsed.has('site_settings'));
check('users has exactly id, streak, email', !!users && users.size === 3 && ['id', 'streak', 'email'].every(c => users.has(c)),
  users ? [...users].join(',') : 'missing');
check('constraint lines are not columns', !!users && !users.has('unique') && !users.has('constraint') && !users.has('primary'));
check('INSERT / CREATE INDEX outside a table are ignored', !parsed.has('idx_users_streak'));
check('quoted pg_dump-style names parse', (() => {
  const q = parseExpectedColumns(`CREATE TABLE "public"."users" (
    "id" integer NOT NULL,
    "streak_best" integer
);`);
  return q.get('users')?.has('streak_best') === true && q.get('users')?.size === 2;
})());
check('CRLF line endings parse the same', parseExpectedColumns(fixture.replace(/\n/g, '\r\n')).get('users')?.size === 3);

// diff: the exact failure we hit in Sep 2026
const live = new Map([
  ['users', new Set(['id', 'email', 'legacy_col'])],
  ['site_settings', new Set(['key', 'value'])],
]);
const diff = diffSchema(parsed, live);
check('missing column is reported', diff.missingColumns.length === 1 && diff.missingColumns[0] === 'users.streak', diff.missingColumns.join(','));
check('extra live column is only a warning', diff.extraColumns.join(',') === 'users.legacy_col');
const noSettings = diffSchema(parsed, new Map([['users', new Set(['id', 'streak', 'email'])]]));
check('missing table is reported', noSettings.missingTables.join(',') === 'site_settings' && noSettings.missingColumns.length === 0);
check('matching schema has no diff', (() => {
  const d = diffSchema(parsed, parsed);
  return !d.missingTables.length && !d.missingColumns.length && !d.extraColumns.length;
})());

// sanity check against the real schema file
const real = parseExpectedColumns(
  fs.readFileSync(path.resolve(__dirname, '../../database/init/01-schema.sql'), 'utf8'),
);
check('real schema: users.streak_best declared', !!real.get('users')?.has('streak_best'));
check('real schema: play_schedules.hook_notifications declared', !!real.get('play_schedules')?.has('hook_notifications'));
check('real schema: game_submissions has no constraint pseudo-columns', !real.get('game_submissions')?.has('constraint'));

console.log(failures === 0 ? '\nAll schema parser tests passed.' : `\n${failures} test(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
