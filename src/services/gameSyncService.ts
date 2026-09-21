import fs from 'fs/promises';
import path from 'path';
import database from '../config/database';
import gameDataService from './gameDataService';
import { computeSyncPlan, keyOf, MANAGED_SOURCE, SyncGuardError, DbGame, SyncPlan } from './syncPlan';

/**
 * Upstream (Game-Time-Master) -> games table sync: fetch, plan, apply in one transaction.
 * The rules (never delete, rename in place, protect tracked games, ...) live in syncPlan.ts,
 * which is pure so it can be tested without a database.
 */

export { SyncGuardError };

const RENAMES_PATH = path.join(process.cwd(), 'data', 'game-renames.json');

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
