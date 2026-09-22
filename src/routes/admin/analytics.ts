import express, { Request, Response, Router } from 'express';
import ct from 'countries-and-timezones';
import database from '../../config/database';
import { requireAdmin, getRoleName } from '../../middleware/admin';

const analyticsRouter: Router = express.Router();

// Mirrors the canonical region groups in frontend/app/_lib/servers.ts (SERVER_GROUPS) — keep
// the group names in sync if that file changes. Anything not listed here folds into "Other"
// rather than surfacing dozens of one-off server strings (e.g. "Haoplay Japan", "NA East",
// "China & Taiwain") as separate bars — see the dataviz series-count ladder.
const REGION_GROUPS: Record<string, string[]> = {
    'Global':         ['Global'],
    'North America':  ['EN', 'America', 'Americas', 'NA', 'North America', 'US', 'America (East)', 'Americas / Europe', 'Americas & Oceania'],
    'Japan':          ['JP'],
    'Korea':          ['KR', 'Korea'],
    'China':          ['CN'],
    'Taiwan':         ['TW'],
    'Asia':           ['Asia', 'East Asia', 'SEA'],
    'Europe':         ['EU', 'Europe'],
    'South America':  ['South America'],
    'Oceania':        ['Oceania'],
};
const RAW_TO_REGION: Record<string, string> = Object.fromEntries(
    Object.entries(REGION_GROUPS).flatMap(([group, raws]) => raws.map(raw => [raw, group]))
);
const regionOf = (raw: string): string => RAW_TO_REGION[raw] ?? 'Other';

const ROLE_ORDER = [1, 2, 3, 4] as const;

// How far back the two trend charts (signups, completions) look, and what bucket size to
// group them into. 'all' has no floor — unlike a 30-day-capped analytics free tier, this is
// our own DB and goes back to the first account. Larger ranges bucket coarser so the chart
// doesn't end up with hundreds of points.
const RANGE_DAYS: Record<string, number | null> = { '7': 7, '30': 30, '90': 90, '365': 365, all: null };

function resolveRange(daysParam: unknown): { days: number | null; bucket: 'day' | 'week' | 'month' } {
    const key = typeof daysParam === 'string' && daysParam in RANGE_DAYS ? daysParam : '90';
    const days = RANGE_DAYS[key];
    const bucket = days === null ? 'month' : days <= 30 ? 'day' : days <= 120 ? 'week' : 'month';
    return { days, bucket };
}

/** IANA timezone -> country name, for the "where are our users" breakdown. Best-effort: an
 * unresolvable zone (e.g. a bare UTC offset like "Etc/GMT+6") buckets as "Unknown" rather
 * than being dropped. */
function countryOf(timezone: string): string {
    const info = ct.getTimezone(timezone);
    const code = info?.countries?.[0];
    if (!code) return 'Unknown';
    return ct.getCountry(code)?.name ?? 'Unknown';
}

/** Folds a sorted-desc [label, count] list down to the top N, merging the remainder into
 * "Other" (only added when there's actually a remainder to report). */
function topNWithOther(counts: Map<string, number>, n: number): { label: string; count: number }[] {
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, n).map(([label, count]) => ({ label, count }));
    const rest = sorted.slice(n).reduce((sum, [, count]) => sum + count, 0);
    return rest > 0 ? [...top, { label: 'Other', count: rest }] : top;
}

/**
 * @swagger
 * /gdt/admin/analytics:
 *   get:
 *     summary: Admin statistics & analytics dashboard data (Admin Only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     description: >
 *       Aggregate site metrics for the admin Analytics panel — top streaks, most-tracked
 *       games, region popularity, a timezone→country breakdown, and signup/completion trends.
 *       Unlike the public leaderboard, top_streaks ignores leaderboard_hidden — this is an
 *       internal admin view, not something shown to other users.
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: string
 *           enum: ['7', '30', '90', '365', 'all']
 *           default: '90'
 *         description: Range for signups_over_time / completions_over_time only. Other sections reflect current state and aren't range-scoped.
 *     responses:
 *       200:
 *         description: Analytics payload
 *       403:
 *         $ref: '#/components/schemas/Error'
 */
analyticsRouter.get('/analytics', requireAdmin, async (req: Request, res: Response) => {
    try {
        const { days, bucket } = resolveRange(req.query.days);
        const since = days !== null ? new Date(Date.now() - days * 86400000) : null;

        const [
            summaryResult,
            roleResult,
            streaksResult,
            gamesResult,
            regionResult,
            timezoneResult,
            signupsResult,
            completionsResult,
        ] = await Promise.all([
            database.query(`
                SELECT
                    (SELECT COUNT(*) FROM users)                          AS total_users,
                    (SELECT COUNT(*) FROM games WHERE is_active)          AS total_active_games,
                    (SELECT COUNT(*) FROM user_games)                     AS total_tracked_rows,
                    (SELECT COUNT(*) FROM daily_completions)              AS total_completions,
                    (SELECT COUNT(*) FROM users WHERE streak_count > 0)   AS users_with_streak
            `),
            database.query(`SELECT role, COUNT(*)::int AS count FROM users GROUP BY role`),
            database.query(`
                SELECT u.username, u.streak_count, COUNT(ug.game_id)::int AS games_tracked
                FROM users u
                LEFT JOIN user_games ug ON ug.user_id = u.id
                WHERE u.streak_count > 0
                GROUP BY u.id, u.username, u.streak_count
                ORDER BY u.streak_count DESC, u.username ASC
                LIMIT 10
            `),
            database.query(`
                SELECT g.id, g.name, g.server, COUNT(ug.id)::int AS tracked_by
                FROM games g
                JOIN user_games ug ON ug.game_id = g.id
                WHERE g.is_active
                GROUP BY g.id
                ORDER BY tracked_by DESC, g.name ASC
                LIMIT 10
            `),
            database.query(`
                SELECT g.server, COUNT(DISTINCT g.id)::int AS game_count, COUNT(ug.id)::int AS tracked_count
                FROM games g
                LEFT JOIN user_games ug ON ug.game_id = g.id
                WHERE g.is_active
                GROUP BY g.server
            `),
            database.query(`SELECT timezone FROM users`),
            database.query(
                `SELECT date_trunc($1, created_at)::date AS bucket, COUNT(*)::int AS count
                 FROM users
                 ${since ? 'WHERE created_at >= $2' : ''}
                 GROUP BY 1 ORDER BY 1`,
                since ? [bucket, since] : [bucket]
            ),
            database.query(
                `SELECT date_trunc($1, completion_date)::date AS bucket, COUNT(*)::int AS count
                 FROM daily_completions
                 ${since ? 'WHERE completion_date >= $2' : ''}
                 GROUP BY 1 ORDER BY 1`,
                since ? [bucket, since] : [bucket]
            ),
        ]);

        // --- summary ---
        const s = summaryResult.rows[0];
        const totalUsers = Number(s.total_users);
        const totalTrackedRows = Number(s.total_tracked_rows);
        const summary = {
            total_users: totalUsers,
            total_active_games: Number(s.total_active_games),
            total_tracked_rows: totalTrackedRows,
            total_completions: Number(s.total_completions),
            users_with_streak: Number(s.users_with_streak),
            avg_games_per_user: totalUsers > 0 ? Math.round((totalTrackedRows / totalUsers) * 10) / 10 : 0,
        };

        // --- role distribution (ordinal 1..4, zero-filled so the axis is always complete) ---
        const roleCounts = new Map<number, number>(roleResult.rows.map(r => [Number(r.role), Number(r.count)]));
        const role_distribution = ROLE_ORDER.map(role => ({
            role,
            role_name: getRoleName(role),
            count: roleCounts.get(role) ?? 0,
        }));

        // --- top streaks / top games (pass through, already shaped) ---
        const top_streaks = streaksResult.rows.map(r => ({
            username: r.username,
            streak_count: Number(r.streak_count),
            games_tracked: Number(r.games_tracked),
        }));
        const top_games = gamesResult.rows.map(r => ({
            id: r.id,
            name: r.name,
            server: r.server,
            tracked_by: Number(r.tracked_by),
        }));

        // --- region popularity (raw server -> canonical region, long tail folded into Other) ---
        const regionTotals = new Map<string, { tracked_count: number; game_count: number }>();
        for (const row of regionResult.rows) {
            const region = regionOf(row.server);
            const cur = regionTotals.get(region) ?? { tracked_count: 0, game_count: 0 };
            cur.tracked_count += Number(row.tracked_count);
            cur.game_count += Number(row.game_count);
            regionTotals.set(region, cur);
        }
        const region_popularity = [...regionTotals.entries()]
            .map(([region, v]) => ({ region, tracked_count: v.tracked_count, game_count: v.game_count }))
            .sort((a, b) => b.tracked_count - a.tracked_count);

        // --- timezone -> country breakdown ---
        const countryCounts = new Map<string, number>();
        for (const row of timezoneResult.rows) {
            const country = countryOf(row.timezone);
            countryCounts.set(country, (countryCounts.get(country) ?? 0) + 1);
        }
        const timezone_breakdown = topNWithOther(countryCounts, 9).map(({ label, count }) => ({ country: label, count }));

        // --- trends (zero-filled range, no gaps for empty buckets) ---
        const toSeries = (rows: { bucket: string; count: number }[]) =>
            rows.map(r => ({ date: r.bucket, count: Number(r.count) }));

        const signupSeries = toSeries(signupsResult.rows);
        let cumulative = 0;
        const signups_over_time = signupSeries.map(pt => {
            cumulative += pt.count;
            return { ...pt, cumulative };
        });
        const completions_over_time = toSeries(completionsResult.rows);

        res.json({
            summary,
            role_distribution,
            top_streaks,
            top_games,
            region_popularity,
            timezone_breakdown,
            signups_over_time,
            completions_over_time,
            range: { days, bucket },
        });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        console.error('Admin analytics error:', msg);
        res.status(500).json({ error: 'Failed to load analytics' });
    }
});

export default analyticsRouter;
