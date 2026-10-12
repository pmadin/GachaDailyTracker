import crypto from 'crypto';
import { Resend } from 'resend';
import database from '../config/database';
import { addPepper } from '../utils/crypto';
import { buildVerificationCodeEmail } from '../workers/emailTemplate';

export const CODE_TTL_MINUTES = 10;
export const MAX_ATTEMPTS = 5;
export const RESEND_COOLDOWN_SECONDS = 60;
/** New signups that never verify are deleted this long after registering (see unverifiedCleanupCron). */
export const UNVERIFIED_ACCOUNT_TTL_DAYS = 7;

export type VerifyResult =
    | { status: 'verified' }
    | { status: 'already_verified' }
    | { status: 'invalid'; attemptsLeft: number }
    | { status: 'expired' }
    | { status: 'too_many_attempts' }
    | { status: 'no_code' };

/** Six random digits, zero-padded so "004211" is as likely as "731903". */
export function generateCode(): string {
    return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/** Accepts "123 456" or "123-456" as typed or pasted; returns null if it isn't 6 digits. */
export function normalizeCode(input: unknown): string | null {
    if (typeof input !== 'string') return null;
    const digits = input.replace(/[\s-]/g, '');
    return /^\d{6}$/.test(digits) ? digits : null;
}

// Keyed with the password pepper and bound to the user, so a leaked row can't be replayed
// against another account. Only the hash is stored, never the code itself.
function hashCode(userId: number, code: string): string {
    return addPepper(`email-verify:${userId}:${code}`);
}

/** Seconds until this user may request another code (0 = allowed now). */
export async function secondsUntilResend(userId: number): Promise<number> {
    const result = await database.query(
        `SELECT GREATEST(0, CEIL($2 - EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at))))::int AS wait
         FROM email_verification_codes
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [userId, RESEND_COOLDOWN_SECONDS]
    );
    return result.rows[0]?.wait ?? 0;
}

/**
 * Replaces any previous code for this user with a fresh one and emails it. Returns whether
 * the email actually went out. Without RESEND_API_KEY (local Docker), the code is printed to
 * the server log instead so signups can still be tested end to end.
 */
export async function issueVerificationCode(
    user: { id: number; username: string; email: string }
): Promise<boolean> {
    const code = generateCode();

    await database.query('DELETE FROM email_verification_codes WHERE user_id = $1', [user.id]);
    await database.query(
        `INSERT INTO email_verification_codes (user_id, code_hash, expires_at)
         VALUES ($1, $2, CURRENT_TIMESTAMP + make_interval(mins => $3))`,
        [user.id, hashCode(user.id, code), CODE_TTL_MINUTES]
    );

    if (!process.env.RESEND_API_KEY) {
        if (process.env.NODE_ENV !== 'production') {
            console.log(`[dev] Email verification code for user ${user.id}: ${code}`);
            return true;
        }
        console.warn(`RESEND_API_KEY not set, verification email not sent for user ${user.id}`);
        return false;
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
        from: `GachaDailyTracker <${process.env.RESEND_FROM_EMAIL ?? 'noreply@gachadailytracker.com'}>`,
        to: user.email,
        subject: `${code} is your GachaDailyTracker verification code`,
        html: buildVerificationCodeEmail(user.username, code, CODE_TTL_MINUTES),
    });

    if (error) {
        console.error(`Verification email failed for user ${user.id}:`, error.message);
        return false;
    }
    console.log(`Verification email sent to user ${user.id}`);
    return true;
}

/**
 * Checks a submitted code. The code row is locked for the duration so parallel guesses
 * can't slip past the attempt cap. On success the user is marked verified and their codes
 * are deleted.
 */
export async function verifyCode(userId: number, code: string): Promise<VerifyResult> {
    const client = await database.getClient();
    try {
        await client.query('BEGIN');

        const userResult = await client.query(
            'SELECT email_verified FROM users WHERE id = $1',
            [userId]
        );
        if (userResult.rows[0]?.email_verified) {
            await client.query('ROLLBACK');
            return { status: 'already_verified' };
        }

        const codeResult = await client.query(
            `SELECT id, code_hash, attempts, (expires_at < CURRENT_TIMESTAMP) AS expired
             FROM email_verification_codes
             WHERE user_id = $1
             ORDER BY created_at DESC
             LIMIT 1
             FOR UPDATE`,
            [userId]
        );

        if (codeResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return { status: 'no_code' };
        }

        const row = codeResult.rows[0];
        if (row.expired) {
            await client.query('ROLLBACK');
            return { status: 'expired' };
        }
        if (row.attempts >= MAX_ATTEMPTS) {
            await client.query('ROLLBACK');
            return { status: 'too_many_attempts' };
        }

        const expected = Buffer.from(row.code_hash, 'hex');
        const actual = Buffer.from(hashCode(userId, code), 'hex');
        const matches = expected.length === actual.length && crypto.timingSafeEqual(expected, actual);

        if (!matches) {
            await client.query(
                'UPDATE email_verification_codes SET attempts = attempts + 1 WHERE id = $1',
                [row.id]
            );
            await client.query('COMMIT');
            const attemptsLeft = MAX_ATTEMPTS - (row.attempts + 1);
            return attemptsLeft > 0 ? { status: 'invalid', attemptsLeft } : { status: 'too_many_attempts' };
        }

        await client.query(
            `UPDATE users
             SET email_verified = true, email_verify_deadline = NULL, updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [userId]
        );
        await client.query('DELETE FROM email_verification_codes WHERE user_id = $1', [userId]);
        await client.query('COMMIT');
        return { status: 'verified' };
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
    } finally {
        client.release();
    }
}
