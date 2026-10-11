import cron from 'node-cron';
import { Resend } from 'resend';
import database from '../config/database';
import { buildDigestEmail, DigestRow } from './emailTemplate';

const DIGEST_QUERY = `
  SELECT
    u.id          AS user_id,
    u.email,
    u.username,
    u.timezone,
    u.email_digest_hour,
    json_agg(
      json_build_object(
        'game_name',   g.name,
        'server',      g.server,
        'icon_name',   g.icon_name,
        'daily_reset', g.daily_reset,
        'timezone',    g.timezone,
        'completed',   (dc.id IS NOT NULL)
      ) ORDER BY g.name
    ) AS games
  FROM users u
  JOIN user_games ug ON ug.user_id = u.id
  JOIN games g ON g.id = ug.game_id AND g.is_active = true
  LEFT JOIN daily_completions dc
    ON dc.user_id = u.id
    AND dc.game_id = g.id
    AND dc.completion_date = (
      CASE
        WHEN (CURRENT_TIMESTAMP AT TIME ZONE g.timezone)::time >= g.daily_reset
        THEN (CURRENT_TIMESTAMP AT TIME ZONE g.timezone)::date
        ELSE (CURRENT_TIMESTAMP AT TIME ZONE g.timezone)::date - 1
      END
    )
  WHERE u.email_digest_enabled = true
    AND u.email_verified = true
    AND EXTRACT(HOUR FROM CURRENT_TIMESTAMP AT TIME ZONE u.timezone) = u.email_digest_hour
  GROUP BY u.id, u.email, u.username, u.timezone, u.email_digest_hour
`;

async function runEmailDigestJob(): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.warn('Email digest skipped: RESEND_API_KEY not configured');
    return;
  }
  const resend = new Resend(process.env.RESEND_API_KEY);

  let rows: DigestRow[];
  try {
    const result = await database.query(DIGEST_QUERY);
    rows = result.rows;
  } catch (error) {
    console.error('Email digest query failed:', error);
    return;
  }

  if (rows.length === 0) return;

  console.log(`Sending ${rows.length} digest email(s)`);

  await Promise.all(
    rows.map(async (user) => {
      try {
        const html = buildDigestEmail(user);
        await resend.emails.send({
          from: `GachaDailyTracker <${process.env.RESEND_FROM_EMAIL ?? 'noreply@gachadailytracker.com'}>`,
          to: user.email,
          subject: `GachaDailyTracker — Your daily reset summary`,
          html,
        });
        console.log(`Digest sent to user ${user.user_id}`);
      } catch (error) {
        console.error(`Digest failed for user ${user.user_id}:`, error);
      }
    })
  );
}

export function startEmailDigestCron(): void {
  cron.schedule('0 * * * *', () => {
    runEmailDigestJob().catch((err) => {
      console.error('Email digest cron error:', err);
    });
  });

  // Clean up expired/used password reset tokens daily at 3am UTC
  cron.schedule('0 3 * * *', async () => {
    try {
      const result = await database.query(
        `DELETE FROM password_reset_tokens WHERE expires_at < CURRENT_TIMESTAMP OR used = true`
      );
      if ((result.rowCount ?? 0) > 0) {
        console.log(`Cleaned up ${result.rowCount} expired password reset tokens`);
      }
      const codes = await database.query(
        `DELETE FROM email_verification_codes WHERE expires_at < CURRENT_TIMESTAMP`
      );
      if ((codes.rowCount ?? 0) > 0) {
        console.log(`Cleaned up ${codes.rowCount} expired email verification codes`);
      }
    } catch (error) {
      console.error('Token cleanup error:', error);
    }
  });

  console.log('Email digest cron started (runs every hour)');
}
