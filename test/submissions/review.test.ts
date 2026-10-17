/**
 * End-to-end test of the admin submission review flow and custom icons. Talks to a running
 * backend (BASE_URL, default http://localhost:4000) and to the LOCAL Docker DB directly, and
 * refuses any other DB host. Cleans up everything it creates, before and after.
 *
 * Covers: icon preview (and SVG rejection), similar-games lookup, approve with edited fields +
 * icon + activate in one call, the public icon URL and its headers, the 409 for an existing
 * name/server, reject, and that non-admins are refused.
 *
 * Run with (PowerShell):  $env:SKIP_EMAIL_DOMAIN_CHECK='true'; npm run local
 *                  then:  npm run test:submission-review
 */
import 'dotenv/config';
import { Client } from 'pg';
import sharp from 'sharp';
import { localDatabaseUrl } from '../streak/badge-trigger-cleanup';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:4000';
const PREFIX = 'ci_review_';
const GAME_PREFIX = 'ZZ-CI-REVIEW';

let failures = 0;
function check(name: string, ok: boolean, extra = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
  if (!ok) failures++;
}

async function call(method: string, path: string, token?: string, body?: unknown | FormData) {
  const isForm = body instanceof FormData;
  const res = await fetch(`${BASE_URL}/gdt${path}`, {
    method,
    headers: {
      ...(isForm || body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = {};
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 200) }; }
  return { status: res.status, json, headers: res.headers };
}

async function cleanup(db: Client): Promise<void> {
  await db.query(`DELETE FROM game_submissions WHERE name LIKE $1`, [`${GAME_PREFIX}%`]);
  // games are soft-deleted in the app, but these are synthetic test rows; game_icons cascades.
  const games = await db.query(`DELETE FROM games WHERE name LIKE $1`, [`${GAME_PREFIX}%`]);
  const users = await db.query(`DELETE FROM users WHERE username LIKE $1`, [`${PREFIX}%`]);
  console.log(`[cleanup] removed ${users.rowCount ?? 0} user(s), ${games.rowCount ?? 0} game(s)`);
}

async function main(): Promise<void> {
  const registrationToken = process.env.REGISTRATION_TOKEN;
  if (!registrationToken) throw new Error('REGISTRATION_TOKEN is not set');
  const db = new Client({ connectionString: localDatabaseUrl() });
  await db.connect();
  const password = `CiReview%${Date.now()}a${Math.floor(Math.random() * 1e6)}`;

  async function createUser(suffix: string, role: number): Promise<{ id: number; token: string }> {
    const username = `${PREFIX}${suffix}`;
    const reg = await call('POST', '/auth/register', undefined, {
      username, email: `${username}@example.test`, password, confirmPassword: password, registrationToken,
    });
    if (reg.json?.code === 'email_domain_no_mail') {
      throw new Error("The backend refused the @example.test signup (MX check). Restart it with:\n  $env:SKIP_EMAIL_DOMAIN_CHECK='true'; npm run local");
    }
    if (reg.status !== 201) throw new Error(`register ${username} failed (HTTP ${reg.status}): ${JSON.stringify(reg.json)}`);
    await db.query('UPDATE users SET role = $2, email_verified = true WHERE id = $1', [reg.json.user.id, role]);
    const login = await call('POST', '/auth/login', undefined, { identifier: username, password });
    if (!login.json.token) throw new Error(`login ${username} failed`);
    return { id: reg.json.user.id, token: login.json.token };
  }

  async function submission(name: string, server = 'Global'): Promise<number> {
    const r = await db.query(
      `INSERT INTO game_submissions (submitted_by, submitter_role, name, server, timezone, daily_reset, notes)
       VALUES (NULL, 1, $1, $2, 'Asia/Tokyo', '04:00', 'ci') RETURNING id`,
      [name, server]
    );
    return r.rows[0].id;
  }

  try {
    await cleanup(db);
    const admin = await createUser('admin', 3);
    const user = await createUser('user', 1);

    const png = await sharp({ create: { width: 300, height: 150, channels: 3, background: { r: 200, g: 145, b: 60 } } }).png().toBuffer();
    const iconForm = (fit = 'cover', bytes: Buffer = png, filename = 'icon.png') => {
      const f = new FormData();
      f.append('icon', new Blob([new Uint8Array(bytes)]), filename);
      f.append('fit', fit);
      return f;
    };

    // ── icon preview ──────────────────────────────────────────────────────────────
    const preview = await call('POST', '/admin/icons/preview', admin.token, iconForm('contain'));
    check('preview: admin gets a webp data URL', preview.status === 200 && /^data:image\/webp;base64,/.test(preview.json.data_url ?? ''), String(preview.status));
    const svg = await call('POST', '/admin/icons/preview', admin.token,
      iconForm('cover', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="9" height="9"/>'), 'x.svg'));
    check('preview: SVG is refused with 400', svg.status === 400, JSON.stringify(svg.json));
    const notAdmin = await call('POST', '/admin/icons/preview', user.token, iconForm());
    check('preview: regular user is refused', notAdmin.status === 403, String(notAdmin.status));

    // ── similar games + approve with edits, icon and activate ─────────────────────
    const subId = await submission(`${GAME_PREFIX} Typo Nmae`);
    const similar = await call('GET', `/admin/submissions/${subId}/similar?name=${encodeURIComponent(`${GAME_PREFIX} Fixed`)}`, admin.token);
    check('similar: returns a list', similar.status === 200 && Array.isArray(similar.json.games));

    const approveForm = iconForm('cover');
    approveForm.append('action', 'approve');
    approveForm.append('name', `${GAME_PREFIX} Fixed`);
    approveForm.append('server', 'JP');
    approveForm.append('timezone', 'Asia/Shanghai');
    approveForm.append('daily_reset', '05:00');
    approveForm.append('activate', 'true');
    approveForm.append('review_notes', 'fixed name');
    const approved = await call('PATCH', `/admin/submissions/${subId}`, admin.token, approveForm);
    check('approve: 200 with game_id', approved.status === 200 && Number.isInteger(approved.json.game_id), JSON.stringify(approved.json));

    const game = (await db.query('SELECT * FROM games WHERE id = $1', [approved.json.game_id])).rows[0];
    check('approve: edited fields were used, not the submitted ones',
      game?.name === `${GAME_PREFIX} Fixed` && game?.server === 'JP' && game?.timezone === 'Asia/Shanghai' && String(game?.daily_reset).startsWith('05:00'),
      JSON.stringify({ name: game?.name, server: game?.server, tz: game?.timezone, reset: game?.daily_reset }));
    check('approve: game is active, source user-submission', game?.is_active === true && game?.source === 'user-submission');
    check('approve: icon_name is custom/<id>-<hash>', new RegExp(`^custom/${game?.id}-[0-9a-f]{10}$`).test(game?.icon_name ?? ''), game?.icon_name);
    const sub = (await db.query('SELECT status, game_id, review_notes FROM game_submissions WHERE id = $1', [subId])).rows[0];
    check('approve: submission approved and linked to the game', sub.status === 'approved' && sub.game_id === game?.id && sub.review_notes === 'fixed name');

    // ── public icon URL ───────────────────────────────────────────────────────────
    const file = `${String(game?.icon_name).slice('custom/'.length)}.webp`;
    const iconRes = await fetch(`${BASE_URL}/gdt/icons/custom/${file}`);
    const iconBytes = Buffer.from(await iconRes.arrayBuffer());
    const iconMeta = await sharp(iconBytes).metadata().catch(() => null);
    check('icon: served as 96×96 webp', iconRes.status === 200 && iconMeta?.format === 'webp' && iconMeta.width === 96 && iconMeta.height === 96);
    check('icon: cross-origin + immutable cache headers',
      iconRes.headers.get('cross-origin-resource-policy') === 'cross-origin' && /immutable/.test(iconRes.headers.get('cache-control') ?? ''));
    const stale = await fetch(`${BASE_URL}/gdt/icons/custom/${game?.id}-0000000000.webp`);
    check('icon: wrong hash is a 404', stale.status === 404);
    const traversal = await fetch(`${BASE_URL}/gdt/icons/custom/..%2F..%2Fpackage.json`);
    check('icon: junk file names are a 404', traversal.status === 404);

    const again = await call('PATCH', `/admin/submissions/${subId}`, admin.token, { action: 'approve' });
    check('approve twice: 400 already approved', again.status === 400, JSON.stringify(again.json));

    // ── duplicate name + server (case-insensitive) is a 409, not a silent no-op ─
    const dupeId = await submission(`${GAME_PREFIX} fixed`, 'jp');
    const dupe = await call('PATCH', `/admin/submissions/${dupeId}`, admin.token, { action: 'approve' });
    check('duplicate: 409 naming the existing game', dupe.status === 409 && dupe.json.existing_game?.id === game?.id, JSON.stringify(dupe.json));
    const stillPending = (await db.query('SELECT status FROM game_submissions WHERE id = $1', [dupeId])).rows[0].status;
    check('duplicate: submission stays pending', stillPending === 'pending');

    // ── bad edit and bad icon fail without side effects ──────────────────────────
    const badTz = await call('PATCH', `/admin/submissions/${dupeId}`, admin.token, { action: 'approve', name: `${GAME_PREFIX} Other`, timezone: 'Mars/Olympus' });
    check('approve with an invalid timezone: 400', badTz.status === 400, JSON.stringify(badTz.json));
    const badIcon = iconForm('cover', Buffer.from('not an image'), 'x.png');
    badIcon.append('action', 'approve');
    badIcon.append('name', `${GAME_PREFIX} Other`);
    const badIconRes = await call('PATCH', `/admin/submissions/${dupeId}`, admin.token, badIcon);
    const otherGame = await db.query('SELECT id FROM games WHERE name = $1', [`${GAME_PREFIX} Other`]);
    check('approve with a broken icon: 400 and no game created', badIconRes.status === 400 && otherGame.rows.length === 0, JSON.stringify(badIconRes.json));

    // ── reject + non-admin ────────────────────────────────────────────────────────
    const userTry = await call('PATCH', `/admin/submissions/${dupeId}`, user.token, { action: 'reject' });
    check('regular user cannot review', userTry.status === 403, String(userTry.status));
    const rejected = await call('PATCH', `/admin/submissions/${dupeId}`, admin.token, { action: 'reject', review_notes: 'duplicate' });
    const rejRow = (await db.query('SELECT status, game_id FROM game_submissions WHERE id = $1', [dupeId])).rows[0];
    check('reject: 200, status rejected, no game linked', rejected.status === 200 && rejRow.status === 'rejected' && rejRow.game_id === null);

    // ── admin games icon upload (existing game) ───────────────────────────────────
    const reup = await call('POST', `/admin/games/${game?.id}/icon`, admin.token, iconForm('contain',
      await sharp({ create: { width: 50, height: 200, channels: 3, background: { r: 30, g: 200, b: 90 } } }).png().toBuffer()));
    const newName = (await db.query('SELECT icon_name FROM games WHERE id = $1', [game?.id])).rows[0].icon_name;
    check('re-upload: new hash, icon_name updated', reup.status === 200 && newName === reup.json.icon_name && newName !== game?.icon_name, `${game?.icon_name} -> ${newName}`);
  } finally {
    await cleanup(db);
    await db.end();
  }

  if (failures > 0) {
    console.error(`\n${failures} FAILURE(S)`);
    process.exit(1);
  }
  console.log('\nALL SUBMISSION REVIEW CHECKS PASSED');
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
