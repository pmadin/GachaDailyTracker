/**
 * Unit tests for the upstream-sync planner (src/services/syncPlan.ts).
 * Pure logic — no database, no network. Run with: npm run test:sync
 *
 * These pin down the rules that protect users' data when syncing with Game-Time-Master:
 * never orphan a tracked game, rename in place, never touch admin-added games, and
 * refuse to act on a truncated upstream.
 */
import { computeSyncPlan, SyncGuardError, DbGame } from '../../src/services/syncPlan';

let failures = 0;
function check(name: string, ok: boolean, extra = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
  if (!ok) failures++;
}

const row = (id: number, name: string, server: string, o: Partial<DbGame> = {}): DbGame => ({
  id, name, server, timezone: 'Asia/Tokyo', daily_reset: '04:00', icon_name: null,
  source: 'game-time-master', is_active: true, tracked_by: 0, ...o,
});
const up = (game: string, server: string, o: Record<string, unknown> = {}) => ({
  game, server, timezone: 'Asia/Tokyo', dailyReset: '04:00', icon: null, ...o,
});

// A baseline of 10 healthy managed games so the 80% guard has something to compare with.
const base = Array.from({ length: 10 }, (_, i) => row(i + 1, `G${i}`, 'Global'));
const baseUp = base.map(r => up(r.name, r.server));

// 1. truncated upstream is refused
try {
  computeSyncPlan(base, baseUp.slice(0, 5), {});
  check('truncated upstream (5 of 10) throws SyncGuardError', false);
} catch (e) {
  check('truncated upstream (5 of 10) throws SyncGuardError', e instanceof SyncGuardError);
}

// 2. empty upstream is refused, even against an empty DB
try {
  computeSyncPlan([], [], {});
  check('empty upstream throws', false);
} catch (e) {
  check('empty upstream throws', e instanceof SyncGuardError);
}

// 3. first-ever import into an empty DB works
{
  const p = computeSyncPlan([], baseUp, {});
  check('empty DB + 10 upstream => 10 adds, 0 deactivations', p.toAdd.length === 10 && p.toDeactivate.length === 0);
}

// 4. duplicates / junk are reported, not fatal, and don't cause deactivation of the real game
{
  const messy = [
    ...baseUp,
    up('G0', 'Global'),
    { game: 'Bad TZ', server: 'X', timezone: 'Mars/Olympus', dailyReset: '04:00' },
    { game: 'Bad Reset', server: 'X', timezone: 'Asia/Tokyo', dailyReset: '25:99' },
    null,
    { server: 'no-name' },
  ];
  const p = computeSyncPlan(base, messy, {});
  check('duplicate + 4 junk entries reported (5 invalid)', p.invalidEntries.length === 5);
  check('valid count still 10', p.validCount === 10);
  check('nothing spuriously added/deactivated', p.toAdd.length === 0 && p.toDeactivate.length === 0);
}

// 5. an invalid upstream entry for an EXISTING game must not cause that game to be deactivated
{
  const withBad = [...baseUp.slice(1), { game: 'G0', server: 'Global', timezone: 'Mars/Olympus', dailyReset: '04:00' }];
  const p = computeSyncPlan(base, withBad, {});
  check('existing game with a now-invalid upstream entry is NOT deactivated', p.toDeactivate.length === 0 && p.skippedDeactivations.length === 0);
}

// 6. tracked game missing upstream is kept; untracked is deactivated
{
  const rows = [...base, row(11, 'Gone Tracked', 'EN', { tracked_by: 3 }), row(12, 'Gone Untracked', 'EN')];
  const p = computeSyncPlan(rows, baseUp, {});
  check('tracked missing game => skipped, not deactivated', p.skippedDeactivations.map(g => g.id).join() === '11');
  check('untracked missing game => deactivated', p.toDeactivate.map(g => g.id).join() === '12');
}

// 7. admin / user-submission games are never deactivated or re-sourced by absence
{
  const rows = [
    ...base,
    row(20, 'Admin Game', 'Global', { source: 'admin' }),
    row(21, 'Submitted', 'Global', { source: 'user-submission', is_active: false }),
  ];
  const p = computeSyncPlan(rows, baseUp, {});
  check('admin-source game absent upstream is left alone', !p.toDeactivate.some(g => g.id === 20) && !p.skippedDeactivations.some(g => g.id === 20));
  check('inactive submission not touched', !p.toUpdate.some(u => u.id === 21));
}

// 8. rename in place
{
  const rows = [...base, row(30, 'Old Name', 'EN', { tracked_by: 4 })];
  const p = computeSyncPlan(rows, [...baseUp, up('New Name', 'Global')], { 'Old Name||EN': 'New Name||Global' });
  check('rename plans an in-place rename of id 30', p.renames.length === 1 && p.renames[0].id === 30 && p.renames[0].tracked_by === 4);
  check('renamed game is not added again nor deactivated', p.toAdd.length === 0 && p.toDeactivate.length === 0 && p.skippedDeactivations.length === 0);
}

// 9. rename is ignored if the old name still exists upstream
{
  const rows = [...base, row(31, 'Still Here', 'EN')];
  const p = computeSyncPlan(rows, [...baseUp, up('Still Here', 'EN'), up('Other', 'Global')], { 'Still Here||EN': 'Other||Global' });
  check('no rename when old key still present upstream', p.renames.length === 0 && p.toAdd.length === 1);
}

// 10. rename target already in DB => conflict, nobody is orphaned
{
  const rows = [...base, row(32, 'Old', 'EN', { tracked_by: 2 }), row(33, 'New', 'Global')];
  const p = computeSyncPlan(rows, [...baseUp, up('New', 'Global')], { 'Old||EN': 'New||Global' });
  check('rename into an existing row => conflict reported', p.renameConflicts.length === 1 && p.renames.length === 0);
  check('conflicted tracked game is kept active (skipped), not deactivated', p.skippedDeactivations.some(g => g.id === 32) && !p.toDeactivate.some(g => g.id === 32));
}

// 11. rename map only applies to upstream-managed rows
{
  const rows = [...base, row(34, 'Mine', 'EN', { source: 'admin', tracked_by: 1 })];
  const p = computeSyncPlan(rows, [...baseUp, up('Theirs', 'Global')], { 'Mine||EN': 'Theirs||Global' });
  check('rename never touches an admin-source row', p.renames.length === 0);
}

// 12. reactivation + field diffs, and time normalisation
{
  const rows = [...base.slice(0, 9), row(10, 'G9', 'Global', { is_active: false })];
  const ups = baseUp.map((u, i) => (i === 0 ? { ...u, dailyReset: '5:00' } : u));
  const p = computeSyncPlan(rows, ups, {});
  const u0 = p.toUpdate.find(u => u.id === 1);
  check("'5:00' normalises to 05:00 and is detected as a reset change", !!u0 && u0.changes.join().includes('reset 04:00 -> 05:00'));
  check('inactive managed game present upstream => reactivated', p.toUpdate.some(u => u.id === 10 && u.reactivated));
}

// 13. a plan is a pure function: it must not mutate the rows it was given
{
  const rows = [...base, row(40, 'Old', 'EN', { tracked_by: 1 })];
  const snapshot = JSON.stringify(rows);
  computeSyncPlan(rows, [...baseUp, up('New', 'Global')], { 'Old||EN': 'New||Global' });
  check('computeSyncPlan does not mutate its input', JSON.stringify(rows) === snapshot);
}

if (failures > 0) {
  console.error(`\n${failures} FAILURE(S)`);
  process.exit(1);
}
console.log('\nALL SYNC PLANNER CHECKS PASSED');
