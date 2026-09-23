import cron from 'node-cron';
import database from '../config/database';

// A streak is stale when streak_last_date is before yesterday — meaning the user
// missed at least one full day without completing their games.
// Condition: streak_last_date < CURRENT_DATE - 1
//   e.g. today=May 18 → threshold=May 17
//        streak_last_date=May 17 → still alive (user can complete today)
//        streak_last_date=May 16 → broken (missed May 17)
async function runStreakAudit(): Promise<void> {
    try {
        // Intentionally does NOT touch streak_best — that's the permanent best-ever value
        // powering streak achievement badges on /profile, and must never decrease, only
        // ratchet up (see POST /tracker/streak in tracker.ts).
        const result = await database.query(
            `UPDATE users
             SET streak_count      = 0,
                 streak_last_date  = NULL,
                 updated_at        = CURRENT_TIMESTAMP
             WHERE streak_count > 0
               AND streak_last_date < CURRENT_DATE - 1`
        );
        const count = result.rowCount ?? 0;
        if (count > 0) {
            console.log(`Streak audit: reset ${count} stale streak(s)`);
        }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        console.error('Streak audit error:', msg);
    }
}

export function startStreakAuditCron(): void {
    // Run once daily at 00:05 UTC (5 minutes after midnight, avoids exact-boundary races)
    cron.schedule('5 0 * * *', () => {
        runStreakAudit().catch(err => console.error('Streak audit cron error:', err));
    });
    console.log('Streak audit cron started (runs daily at 00:05 UTC)');
}
