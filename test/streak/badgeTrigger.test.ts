/**
 * End-to-end test of the streak-badge milestone trigger: the `streak_best = GREATEST(...)` ratchet
 * in POST /tracker/streak. Talks to a running backend (BASE_URL, default http://localhost:4000)
 * and to the LOCAL Docker DB directly — refuses any other DB host.
 *
 * - One user per tier (ci_streak_iron … ci_streak_diamond), each seeded one day below the
 *   threshold with yesterday counted, then completes today's game → must land exactly on the tier.
 * - ci_streak_all climbs through all six thresholds in order, then checks idempotency, a broken
 *   streak (self-heal on GET /tracker/games) and a restart — streak_best must never drop.
 *
 * SQL is only used to fast-forward streak state and clear the 60s rate limit; every increment
 * goes through the real API. The users are left in place (credentials printed at the end) for a
 * manual /profile check — remove them with: npm run test:streak-trigger:cleanup
 *
 * Run with: npm run local  (backend on the Docker DB), then  npm run test:streak-trigger
 */
import 'dotenv/config';
import { Client } from 'pg';
import { STREAK_TIERS, highestEarnedTier } from '../../src/constants/streakTiers';
import { TEST_GAME, TEST_USER_PREFIX, cleanup, localDatabaseUrl } from './badge-trigger-cleanup';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:4000';

let failures = 0;
function check(name: string, ok: boolean, extra = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
  if (!ok) failures++;
}

async function api(method: string, path: string, token?: string, body?: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(`${BASE_URL}/gdt${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = {};
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 200) }; }
  return { status: res.status, json };
}

async function main(): Promise<void> {
  const registrationToken = process.env.REGISTRATION_TOKEN;
  if (!registrationToken) throw new Error('REGISTRATION_TOKEN is not set');

  const db = new Client({ connectionString: localDatabaseUrl() });
  await db.connect();

  // Generated per run — satisfies the register rules (>= 15 chars, lower/upper/digit/special).
  const password = `CiStreak%${Date.now()}a${Math.floor(Math.random() * 1e6)}`;

  try {
    await cleanup(db);

    // Etc/UTC with a 00:00 reset → the game-local period date is the UTC date, matching the
    // CURRENT_DATE the streak UPDATE uses (Docker postgres runs in UTC).
    const gameRow = await db.query(
      `INSERT INTO games (name, server, timezone, daily_reset, source)
       VALUES ($1, $2, 'Etc/UTC', '00:00', 'admin') RETURNING id`,
      [TEST_GAME.name, TEST_GAME.server]
    );
    const gameId: number = gameRow.rows[0].id;

    async function createUser(suffix: string): Promise<{ id: number; username: string; token: string }> {
      const username = `${TEST_USER_PREFIX}${suffix}`;
      const reg = await api('POST', '/auth/register', undefined, {
        username, email: `${username}@example.test`, password, confirmPassword: password, registrationToken,
      });
      if (reg.status !== 201) throw new Error(`register ${username} failed (HTTP ${reg.status}): ${JSON.stringify(reg.json)}`);
      const login = await api('POST', '/auth/login', undefined, { identifier: username, password });
      if (!login.json.token) throw new Error(`login ${username} failed: ${JSON.stringify(login.json)}`);
      const track = await api('POST', `/tracker/games/${gameId}`, login.json.token);
      if (track.status >= 300) throw new Error(`track game for ${username} failed (HTTP ${track.status}): ${JSON.stringify(track.json)}`);
      return { id: reg.json.user.id, username, token: login.json.token };
    }

    /** Fast-forward: pretend the user has counted `count` days ending yesterday. */
    async function seed(userId: number, count: number, best?: number): Promise<void> {
      await db.query(
        `UPDATE users
         SET streak_count = $2,
             streak_best = COALESCE($3, streak_best),
             streak_last_date = CURRENT_DATE - 1,
             streak_last_attempted_at = NULL
         WHERE id = $1`,
        [userId, count, best ?? null]
      );
    }
    const clearRateLimit = (userId: number) =>
      db.query(`UPDATE users SET streak_last_attempted_at = NULL WHERE id = $1`, [userId]);
    const dbStreak = async (userId: number) =>
      (await db.query(`SELECT streak_count, streak_best FROM users WHERE id = $1`, [userId])).rows[0] as
        { streak_count: number; streak_best: number };

    // ── 1. One user per tier ──────────────────────────────────────────────────────────────
    console.log('\n── per-tier users ──');
    const created: string[] = [];
    for (const tier of STREAK_TIERS) {
      const N = tier.days;
      const u = await createUser(tier.key);
      created.push(u.username);
      await seed(u.id, N - 1, N - 1);

      const early = await api('POST', '/tracker/streak', u.token);
      check(`${tier.label}: streak check before completing → not all complete`,
        early.json.allComplete === false && early.json.streak === N - 1, JSON.stringify(early.json));
      check(`${tier.label}: best unchanged (${N - 1}) before completing`, (await dbStreak(u.id)).streak_best === N - 1);

      await clearRateLimit(u.id);
      const done = await api('POST', `/tracker/games/${gameId}/complete`, u.token);
      check(`${tier.label}: complete today's game`, done.status === 200, JSON.stringify(done.json));

      const res = await api('POST', '/tracker/streak', u.token);
      check(`${tier.label}: POST /tracker/streak → streak ${N}, streakBest ${N}`,
        res.json.allComplete === true && res.json.streak === N && res.json.streakBest === N, JSON.stringify(res.json));

      const profile = await api('GET', '/auth/profile', u.token);
      const best = profile.json.user?.streak_best;
      check(`${tier.label}: GET /auth/profile streak_best = ${N}`, best === N, `got ${best}`);
      check(`${tier.label}: highest earned tier is exactly ${tier.label}`, highestEarnedTier(best)?.key === tier.key);
    }

    // ── 2. One user through every tier ────────────────────────────────────────────────────
    console.log('\n── ci_streak_all: climb all six tiers ──');
    const all = await createUser('all');
    created.push(all.username);
    const done = await api('POST', `/tracker/games/${gameId}/complete`, all.token);
    check('all: complete today\'s game', done.status === 200, JSON.stringify(done.json));

    for (const tier of STREAK_TIERS) {
      const N = tier.days;
      await seed(all.id, N - 1); // keep whatever streak_best the API left
      const res = await api('POST', '/tracker/streak', all.token);
      check(`all: reaches ${tier.label} → streak ${N}, streakBest ${N}`,
        res.json.streak === N && res.json.streakBest === N, JSON.stringify(res.json));
      const earned = STREAK_TIERS.filter(t => res.json.streakBest >= t.days).map(t => t.key);
      check(`all: ${earned.length} badge(s) earned after ${tier.label}`,
        earned.length === STREAK_TIERS.indexOf(tier) + 1, earned.join(','));
    }

    await clearRateLimit(all.id);
    const again = await api('POST', '/tracker/streak', all.token);
    check('all: second check same day is idempotent (365 / 365, "already counted")',
      again.json.streak === 365 && again.json.streakBest === 365 && /already counted/i.test(again.json.message ?? ''),
      JSON.stringify(again.json));

    await db.query(`UPDATE users SET streak_last_date = CURRENT_DATE - 3 WHERE id = $1`, [all.id]);
    const games = await api('GET', '/tracker/games', all.token);
    const broken = await dbStreak(all.id);
    check('all: missed days → GET /tracker/games self-heal resets streak to 0',
      games.json.streak === 0 && broken.streak_count === 0, JSON.stringify(broken));
    check('all: streak_best survives the break (still 365)', broken.streak_best === 365);

    await clearRateLimit(all.id);
    const restart = await api('POST', '/tracker/streak', all.token);
    check('all: restart → streak 1, streakBest still 365',
      restart.json.streak === 1 && restart.json.streakBest === 365, JSON.stringify(restart.json));

    const profile = await api('GET', '/auth/profile', all.token);
    check('all: GET /auth/profile → streak_count 1, streak_best 365, Diamond',
      profile.json.user?.streak_count === 1 && profile.json.user?.streak_best === 365 &&
        highestEarnedTier(profile.json.user?.streak_best)?.key === 'diamond',
      JSON.stringify({ c: profile.json.user?.streak_count, b: profile.json.user?.streak_best }));

    console.log(`\nTest users left in place for a manual /profile check: ${created.join(', ')}`);
    console.log(`Password (this run only): ${password}`);
    console.log('Remove them with: npm run test:streak-trigger:cleanup');
  } finally {
    await db.end();
  }
}

main()
  .then(() => {
    if (failures > 0) {
      console.error(`\n${failures} FAILURE(S)`);
      process.exit(1);
    }
    console.log('\nALL STREAK BADGE TRIGGER CHECKS PASSED');
  })
  .catch(err => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
