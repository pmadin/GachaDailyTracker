/**
 * Pure planning logic for the upstream (Game-Time-Master) -> games table sync.
 *
 * No database or network access lives here on purpose: the plan is computed from plain data,
 * so the dry run and the real run are guaranteed to agree and the rules can be unit-tested
 * without a database (see test/sync/syncPlan.test.ts). Applying a plan is gameSyncService.ts.
 *
 * Safety rules (this exists because an earlier sync wiped users' tracked games):
 *  - Games are never deleted. Rows are only inserted, updated, renamed in place, or soft-deleted.
 *  - Upstream renames are applied in place (same game id) via data/game-renames.json, so
 *    user_games / daily_completions / play_schedules keep pointing at the same row.
 *  - A game that someone tracks is never deactivated; it is reported in skippedDeactivations.
 *  - Only rows with source = 'game-time-master' are ever deactivated; admin / user-submitted
 *    games are left alone and no source labels are rewritten.
 */

export const MANAGED_SOURCE = 'game-time-master';
const MIN_UPSTREAM_RATIO = 0.8;
const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

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

export interface PlannedUpdate {
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

export const keyOf = (name: string, server: string) => `${name}||${server}`;

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
 * Given the current games table and the upstream list, decide what would change.
 * Throws SyncGuardError if upstream looks truncated/empty.
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
