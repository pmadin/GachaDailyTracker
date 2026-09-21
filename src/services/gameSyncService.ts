import fs from 'fs/promises';
import path from 'path';
import database from '../config/database';
import gameDataService from './gameDataService';

/**
 * Upstream (Game-Time-Master) -> games table sync.
 *
 * Safety rules (this exists because an earlier sync wiped users' tracked games):
 *  - Never DELETE from games. Rows are only inserted, updated, renamed in place, or soft-deleted.
 *  - Upstream renames are applied in place (same game id) via data/game-renames.json, so
 *    user_games / daily_completions / play_schedules keep pointing at the same row.
 *  - A game that someone tracks is never deactivated; it is reported in skipped_deactivations.
 *  - Only rows with source = 'game-time-master' are ever deactivated; admin / user-submitted
 *    games are left alone and no source labels are rewritten.
 *  - A dry run computes the exact same plan and writes nothing.
 */

const MANAGED_SOURCE = 'game-time-master';
const MIN_UPSTREAM_RATIO = 0.8;
const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;
const RENAMES_PATH = path.join(process.cwd(), 'data', 'game-renames.json');

export class SyncGuardError extends Error {}

export interface UpstreamGame {
  game: string;
  server: string;
  timezone: string;
  dailyReset: string;
  icon?: string | null;
}

export interface DbGame {
  id: number;
  name: string;
  server: string;
  timezone: string;
  daily_reset: string; // 'HH:MM'
  icon_name: string | null;
  source: string | null;
  is_active: boolean;
  tracked_by: number;
}

interface PlannedUpdate {
  id: number;
  game: UpstreamGame;
  changes: string[];
  reactivated: boolean;
}

export interface SyncPlan {
  toAdd: UpstreamGame[];
  toUpdate: PlannedUpdate[];
  renames: { id: number; from: string; to: UpstreamGame; tracked_by: number }[];
  renameConflicts: { from: string; to: string; reason: string }[];
  toDeactivate: DbGame[];
  skippedDeactivations: DbGame[];
  unchangedIds: number[];
  invalidEntries: string[];
  validCount: number;
}

export interface SyncReport {
  message: string;
  dry_run: boolean;
  total: number;
  added: number;
  updated: number;
  reactivated: number;
  renamed: number;
  deactivated: number;
  unchanged: number;
  skipped_deactivations: { id: number; name: string; server: string; tracked_by: number }[];
  rename_conflicts: { from: string; to: string; reason: string }[];
  invalid_entries: string[];
  details: {
    added: string[];
    updated: { name: string; server: string; changes: string[] }[];
    renamed: { id: number; from: string; to: string; tracked_by: number }[];
    deactivated: string[];
  };
  source: string;
  last_synced_at: string | null;
}

const keyOf = (name: string, server: string) => `${name}||${server}`;

function normTime(t: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(t.trim());
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : t;
}

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Split raw upstream data into valid, de-duplicated entries + human-readable problems. */
function validateUpstream(raw: unknown[]): { valid: UpstreamGame[]; invalid: string[]; allKeys: Set<string> } {
  const valid: UpstreamGame[] = [];
  const invalid: string[] = [];
  const allKeys = new Set<string>(); // every key upstream mentions, valid or not (protects them from deactivation)
  const seen = new Set<string>();

  raw.forEach((entry, i) => {
    const g = entry as Partial<UpstreamGame> | null;
    if (!g || typeof g.game !== 'string' || typeof g.server !== 'string' || !g.game || !g.server) {
      invalid.push(`#${i}: missing game/server`);
      return;
    }
    const key = keyOf(g.game, g.server);
    allKeys.add(key);

    if (seen.has(key)) {
      invalid.push(`${key}: duplicate entry ignored`);
      return;
    }
    seen.add(key);

    if (typeof g.timezone !== 'string' || !isValidTimeZone(g.timezone)) {
      invalid.push(`${key}: invalid timezone "${String(g.timezone)}"`);
      return;
    }
    if (typeof g.dailyReset !== 'string' || !TIME_RE.test(g.dailyReset.trim())) {
      invalid.push(`${key}: invalid dailyReset "${String(g.dailyReset)}"`);
      return;
    }
    valid.push({
      game: g.game,
      server: g.server,
      timezone: g.timezone,
      dailyReset: normTime(g.dailyReset),
      icon: typeof g.icon === 'string' && g.icon ? g.icon : null,
    });
  });

  return { valid, invalid, allKeys };
}

/**
 * Pure planning step: given the current games table and the upstream list, decide what would
 * change. No I/O, so the dry run and the real run are guaranteed to agree.
 */
export function computeSyncPlan(
  existing: DbGame[],
  rawUpstream: unknown[],
  renames: Record<string, string>
): SyncPlan {
  const { valid, invalid, allKeys } = validateUpstream(rawUpstream);

  const managedActive = existing.filter(g => g.source === MANAGED_SOURCE && g.is_active).length;
  if (valid.length === 0 || valid.length < managedActive * MIN_UPSTREAM_RATIO) {
    throw new SyncGuardError(
      `Upstream looks truncated: ${valid.length} valid games vs ${managedActive} currently active. ` +
        `Refusing to sync (need at least ${Math.ceil(managedActive * MIN_UPSTREAM_RATIO)}).`
    );
  }

  const upstreamByKey = new Map(valid.map(g => [keyOf(g.game, g.server), g]));
  const rows = existing.map(g => ({ ...g }));
  const byKey = new Map(rows.map(g => [keyOf(g.name, g.server), g]));

  const plan: SyncPlan = {
    toAdd: [],
    toUpdate: [],
    renames: [],
    renameConflicts: [],
    toDeactivate: [],
    skippedDeactivations: [],
    unchangedIds: [],
    invalidEntries: invalid,
    validCount: valid.length,
  };

  // 1. Renames — re-key the existing row in memory so later steps see the new name.
  for (const [fromKey, toKey] of Object.entries(renames)) {
    const row = byKey.get(fromKey);
    if (!row || row.source !== MANAGED_SOURCE) continue;
    if (allKeys.has(fromKey)) continue; // old name still exists upstream: not a rename
    const target = upstreamByKey.get(toKey);
    if (!target) continue; // successor missing upstream: nothing to rename to
    if (byKey.has(toKey)) {
      plan.renameConflicts.push({ from: fromKey, to: toKey, reason: 'target already exists in the games table' });
      continue;
    }
    plan.renames.push({ id: row.id, from: fromKey, to: target, tracked_by: row.tracked_by });
    byKey.delete(fromKey);
    row.name = target.game;
    row.server = target.server;
    byKey.set(toKey, row);
  }

  // 2. Add / update / unchanged
  for (const g of valid) {
    const row = byKey.get(keyOf(g.game, g.server));
    if (!row) {
      plan.toAdd.push(g);
      continue;
    }
    const changes: string[] = [];
    if (row.timezone !== g.timezone) changes.push(`timezone ${row.timezone} -> ${g.timezone}`);
    if (normTime(row.daily_reset) !== g.dailyReset) changes.push(`reset ${normTime(row.daily_reset)} -> ${g.dailyReset}`);
    if ((row.icon_name ?? null) !== (g.icon ?? null)) changes.push(`icon ${row.icon_name ?? 'none'} -> ${g.icon ?? 'none'}`);
    if (row.source !== MANAGED_SOURCE) changes.push(`source ${row.source ?? 'null'} -> ${MANAGED_SOURCE}`);
    const reactivated = !row.is_active;
    if (reactivated) changes.push('reactivated');

    if (changes.length > 0) plan.toUpdate.push({ id: row.id, game: g, changes, reactivated });
    else plan.unchangedIds.push(row.id);
  }

  // 3. Deactivations — only upstream-managed, currently active games that upstream no longer lists.
  for (const row of rows) {
    if (row.source !== MANAGED_SOURCE || !row.is_active) continue;
    if (allKeys.has(keyOf(row.name, row.server))) continue;
    if (row.tracked_by > 0) plan.skippedDeactivations.push(row);
    else plan.toDeactivate.push(row);
  }

  return plan;
}

async function loadRenames(): Promise<Record<string, string>> {
  try {
    const parsed = JSON.parse(await fs.readFile(RENAMES_PATH, 'utf-8')) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (!k.startsWith('_') && typeof v === 'string') out[k] = v;
    }
    return out;
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw e;
  }
}

const EXISTING_SQL = `
  SELECT g.id, g.name, g.server, g.timezone,
         to_char(g.daily_reset, 'HH24:MI') AS daily_reset,
         g.icon_name, g.source, g.is_active,
         COUNT(ug.id)::int AS tracked_by
  FROM games g
  LEFT JOIN user_games ug ON ug.game_id = g.id
  GROUP BY g.id`;

export async function runUpstreamSync(opts: { dryRun: boolean }): Promise<SyncReport> {
  // Fetch without side effects; the local backup file is only refreshed after a successful commit.
  const upstream = await gameDataService.fetchLiveFromSource({ persist: false });
  const renames = await loadRenames();

  const client = await database.getClient();
  let plan: SyncPlan;
  let deactivated = 0;

  try {
    await client.query('BEGIN');
    if (!opts.dryRun) {
      // Serialise concurrent syncs and admin edits of the games table.
      await client.query('LOCK TABLE games IN SHARE ROW EXCLUSIVE MODE');
    }

    const existing = (await client.query(EXISTING_SQL)).rows as DbGame[];
    plan = computeSyncPlan(existing, upstream, renames);

    if (opts.dryRun) {
      await client.query('ROLLBACK');
    } else {
      for (const r of plan.renames) {
        await client.query(
          'UPDATE games SET name = $1, server = $2, last_verified = CURRENT_TIMESTAMP WHERE id = $3',
          [r.to.game, r.to.server, r.id]
        );
      }

      if (plan.toUpdate.length > 0) {
        await client.query(
          `UPDATE games g SET
             timezone      = v.tz,
             daily_reset   = v.dr::time,
             icon_name     = v.icon,
             source        = $5,
             is_active     = true,
             last_verified = CURRENT_TIMESTAMP
           FROM unnest($1::int[], $2::text[], $3::text[], $4::text[]) AS v(id, tz, dr, icon)
           WHERE g.id = v.id`,
          [
            plan.toUpdate.map(u => u.id),
            plan.toUpdate.map(u => u.game.timezone),
            plan.toUpdate.map(u => u.game.dailyReset),
            plan.toUpdate.map(u => u.game.icon ?? null),
            MANAGED_SOURCE,
          ]
        );
      }

      if (plan.toAdd.length > 0) {
        await client.query(
          `INSERT INTO games (name, server, timezone, daily_reset, icon_name, source)
           SELECT v.n, v.s, v.tz, v.dr::time, v.icon, $6
           FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[]) AS v(n, s, tz, dr, icon)
           ON CONFLICT (name, server) DO UPDATE SET
             timezone      = EXCLUDED.timezone,
             daily_reset   = EXCLUDED.daily_reset,
             icon_name     = EXCLUDED.icon_name,
             source        = EXCLUDED.source,
             is_active     = true,
             last_verified = CURRENT_TIMESTAMP`,
          [
            plan.toAdd.map(g => g.game),
            plan.toAdd.map(g => g.server),
            plan.toAdd.map(g => g.timezone),
            plan.toAdd.map(g => g.dailyReset),
            plan.toAdd.map(g => g.icon ?? null),
            MANAGED_SOURCE,
          ]
        );
      }

      if (plan.unchangedIds.length > 0) {
        await client.query('UPDATE games SET last_verified = CURRENT_TIMESTAMP WHERE id = ANY($1::int[])', [
          plan.unchangedIds,
        ]);
      }

      if (plan.toDeactivate.length > 0) {
        // Re-check "nobody tracks it" inside the UPDATE itself so a user adding the game
        // between planning and applying can never lose it.
        const res = await client.query(
          `UPDATE games SET is_active = false, last_verified = CURRENT_TIMESTAMP
           WHERE id = ANY($1::int[]) AND is_active AND source = $2
             AND NOT EXISTS (SELECT 1 FROM user_games ug WHERE ug.game_id = games.id)`,
          [plan.toDeactivate.map(g => g.id), MANAGED_SOURCE]
        );
        deactivated = res.rowCount ?? 0;
        if (deactivated !== plan.toDeactivate.length) {
          console.warn(
            `⚠️  Sync: ${plan.toDeactivate.length - deactivated} game(s) were tracked mid-sync and left active`
          );
        }
      }

      await client.query('COMMIT');
    }
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }

  if (!opts.dryRun) {
    await gameDataService.persistSync(upstream);
  }

  const wouldDeactivate = opts.dryRun ? plan.toDeactivate.length : deactivated;
  const added = plan.toAdd.length;
  const updated = plan.toUpdate.length; // renames are counted separately; a renamed game with other changes appears in both
  const label = opts.dryRun ? 'Preview' : 'Import complete';

  console.log(
    `${opts.dryRun ? '🔍' : '✅'} Sync ${opts.dryRun ? '(dry run) ' : ''}total=${plan.validCount} ` +
      `added=${added} updated=${updated} renamed=${plan.renames.length} ` +
      `deactivated=${wouldDeactivate} kept-tracked=${plan.skippedDeactivations.length} ` +
      `invalid=${plan.invalidEntries.length}`
  );

  return {
    message: label,
    dry_run: opts.dryRun,
    total: plan.validCount,
    added,
    updated,
    reactivated: plan.toUpdate.filter(u => u.reactivated).length,
    renamed: plan.renames.length,
    deactivated: wouldDeactivate,
    unchanged: plan.unchangedIds.length,
    skipped_deactivations: plan.skippedDeactivations.map(g => ({
      id: g.id,
      name: g.name,
      server: g.server,
      tracked_by: g.tracked_by,
    })),
    rename_conflicts: plan.renameConflicts,
    invalid_entries: plan.invalidEntries,
    details: {
      added: plan.toAdd.map(g => keyOf(g.game, g.server)),
      updated: plan.toUpdate.map(u => ({ name: u.game.game, server: u.game.server, changes: u.changes })),
      renamed: plan.renames.map(r => ({ id: r.id, from: r.from, to: keyOf(r.to.game, r.to.server), tracked_by: r.tracked_by })),
      deactivated: plan.toDeactivate.map(g => keyOf(g.name, g.server)),
    },
    source: 'upstream (live)',
    last_synced_at: opts.dryRun
      ? gameDataService.getLastSyncInfo().lastFetch?.toISOString() ?? null
      : new Date().toISOString(),
  };
}
