import cron from 'node-cron';
import database from '../config/database';

// Deletes new signups that never verified their email within UNVERIFIED_ACCOUNT_TTL_DAYS
// (deadline set at registration). These accounts can't reset a forgotten password and are
// often made-up or disposable addresses, so they aren't worth keeping. Their banner shows
// the deadline in advance.
//
// Only rows with a deadline are touched: verified and grandfathered accounts have NULL, and
// so does an existing user who changed email and hasn't re-verified (they just lose the gated
// features until they do). Admins/owners are never auto-deleted. user_games, completions,
// schedules etc. go with the user via ON DELETE CASCADE.
export async function runUnverifiedCleanup(): Promise<number> {
    try {
        const result = await database.query(
            `DELETE FROM users
             WHERE email_verified = false
               AND email_verify_deadline IS NOT NULL
               AND email_verify_deadline < CURRENT_TIMESTAMP
               AND role < 3
             RETURNING id`
        );
        const count = result.rowCount ?? 0;
        if (count > 0) {
            const ids = result.rows.map((r: { id: number }) => r.id).join(', ');
            console.log(`Unverified cleanup: deleted ${count} account(s) past their verify deadline (ids: ${ids})`);
        }
        return count;
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        console.error('Unverified cleanup error:', msg);
        return 0;
    }
}

export function startUnverifiedCleanupCron(): void {
    // Hourly, so an account goes within the hour of its deadline rather than up to a day late
    cron.schedule('15 * * * *', () => {
        runUnverifiedCleanup().catch(() => {});
    });
    console.log('Unverified account cleanup cron started (runs hourly)');
}
