-- Migration: 005_streak_best
--
-- Adds streak_best to users — a permanent "best-ever" streak value that only
-- increases, independent of streak_count (the current streak, which resets on
-- a missed day per streakAuditCron.ts). Streak achievement badges on /profile
-- are computed from streak_best, so a user keeps earned tiers even after their
-- current streak breaks.
--
-- Backfill note: there is no streak history table, so a user whose streak
-- already broke and reset in the past has an unrecoverable true historical
-- peak. The only safe backfill is streak_best = streak_count (seed from
-- whatever the current value is right now) — anyone who peaked higher and
-- already broke their streak before this migration ships will show a lower
-- (possibly 0) streak_best than their real best. Known, accepted limitation.

ALTER TABLE users ADD COLUMN IF NOT EXISTS streak_best INTEGER NOT NULL DEFAULT 0;
UPDATE users SET streak_best = streak_count WHERE streak_best < streak_count;
