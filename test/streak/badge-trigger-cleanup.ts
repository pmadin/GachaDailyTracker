/**
 * Removes the data created by test/streak/badgeTrigger.test.ts: every `ci_streak_*` user
 * (ON DELETE CASCADE clears their user_games / daily_completions) and the synthetic game.
 * Run with: npm run test:streak-trigger:cleanup
 */
import 'dotenv/config';
import { Client } from 'pg';

export const TEST_USER_PREFIX = 'ci_streak_';
export const TEST_GAME = { name: 'ZZ-CI-STREAK Game', server: 'ZZ-CI' };

/** Refuses anything but a local DB — `.env.development` points at Heroku prod. */
export function localDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set (expected the Docker DB from .env)');
  const host = new URL(url).hostname;
  if (host !== 'localhost' && host !== '127.0.0.1') {
    throw new Error(`Refusing to run against non-local DB host "${host}" — use the Docker DB only`);
  }
  return url;
}

export async function cleanup(db: Client): Promise<void> {
  const users = await db.query(`DELETE FROM users WHERE username LIKE $1`, [`${TEST_USER_PREFIX}%`]);
  const games = await db.query(`DELETE FROM games WHERE name = $1 AND server = $2`, [TEST_GAME.name, TEST_GAME.server]);
  console.log(`[cleanup] removed ${users.rowCount ?? 0} user(s), ${games.rowCount ?? 0} game(s)`);
}

if (require.main === module) {
  (async () => {
    const db = new Client({ connectionString: localDatabaseUrl() });
    await db.connect();
    try {
      await cleanup(db);
    } finally {
      await db.end();
    }
  })().catch(err => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
