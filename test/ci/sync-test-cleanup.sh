#!/usr/bin/env bash
# Removes everything sync-test-setup.sh creates. Safe to run repeatedly.
# Uses the standard libpq env vars (PGHOST, PGUSER, PGPASSWORD, PGDATABASE).
# Deleting the users/games cascades to their user_games / daily_completions rows.
set -euo pipefail

psql -v ON_ERROR_STOP=1 -q <<'SQL'
DELETE FROM users WHERE username IN ('ci_sync_admin', 'ci_sync_user');
DELETE FROM games WHERE server = 'ZZ-CI' AND name LIKE 'ZZ-CI-SYNC %';
SQL
echo "[sync-test-cleanup] done" >&2
