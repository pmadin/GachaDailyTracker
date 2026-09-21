#!/usr/bin/env bash
# Prepares the data that test/postman/"Test Game Sync.postman_collection.json" needs:
#   - an admin user (role 3) and a regular user, plus their JWTs
#   - three synthetic games on server "ZZ-CI":
#       ZZ-CI-SYNC Ghost Tracked    (upstream-managed, not in upstream -> must SURVIVE a sync once tracked)
#       ZZ-CI-SYNC Ghost Untracked  (upstream-managed, not in upstream -> must be deactivated)
#       ZZ-CI-SYNC Admin Game       (source 'admin' -> must be left completely alone)
#
# The role bump has to happen in SQL (roles can't be self-assigned over the API), which is why this
# is a script rather than a Postman folder.
#
# Inputs (env): REGISTRATION_TOKEN (required), BASE_URL (default http://localhost:4000), and the
# standard libpq vars for the database (PGHOST, PGUSER, PGPASSWORD, PGDATABASE).
# Output: `export ADMIN_TOKEN=...` / `export USER_TOKEN=...` lines on stdout (everything else -> stderr).
# Use it as   bash test/ci/sync-test-setup.sh > /tmp/sync-env.sh && source /tmp/sync-env.sh
# (NOT  eval "$(bash ...)"  — that would swallow a failing exit status.)
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:4000}"
: "${REGISTRATION_TOKEN:?REGISTRATION_TOKEN is required}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

log() { echo "[sync-test-setup] $*" >&2; }

# Start from a clean slate so re-runs (and re-runs after a failed run) work.
bash "$HERE/sync-test-cleanup.sh" >&2

# Generated per run — no password literal lives in the repo. Satisfies the register rules:
# >= 15 chars with a lowercase, an uppercase, a digit and one of !@#$%^&*(),.?":{}|<>
PW="CiSync%$(date +%s)a${RANDOM}${RANDOM}"

register() { # <username> <email>
  local code
  code="$(curl -sS -o /tmp/sync-test-register.json -w '%{http_code}' -X POST "$BASE_URL/gdt/auth/register" \
    -H 'Content-Type: application/json' \
    -d "{\"username\":\"$1\",\"email\":\"$2\",\"password\":\"$PW\",\"confirmPassword\":\"$PW\",\"registrationToken\":\"$REGISTRATION_TOKEN\"}")"
  if [ "$code" != "201" ]; then
    log "register $1 failed (HTTP $code): $(head -c 300 /tmp/sync-test-register.json)"
    exit 1
  fi
  log "registered $1"
}

login() { # <username> -> prints JWT
  curl -sS -X POST "$BASE_URL/gdt/auth/login" -H 'Content-Type: application/json' \
    -d "{\"identifier\":\"$1\",\"password\":\"$PW\"}" |
    node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{let j={};try{j=JSON.parse(s)}catch(e){}if(!j.token){console.error("login failed: "+s.slice(0,200));process.exit(1)}process.stdout.write(j.token)})'
}

register ci_sync_admin ci-sync-admin@example.com
register ci_sync_user ci-sync-user@example.com

psql -v ON_ERROR_STOP=1 -q -c "UPDATE users SET role = 3 WHERE username = 'ci_sync_admin'" >&2
log "promoted ci_sync_admin to role 3"

psql -v ON_ERROR_STOP=1 -q >&2 <<'SQL'
INSERT INTO games (name, server, timezone, daily_reset, source) VALUES
  ('ZZ-CI-SYNC Ghost Tracked',   'ZZ-CI', 'Etc/UTC', '04:00', 'game-time-master'),
  ('ZZ-CI-SYNC Ghost Untracked', 'ZZ-CI', 'Etc/UTC', '04:00', 'game-time-master'),
  ('ZZ-CI-SYNC Admin Game',      'ZZ-CI', 'Etc/UTC', '04:00', 'admin')
ON CONFLICT (name, server) DO NOTHING;
SQL
log "inserted synthetic games"

ADMIN_TOKEN="$(login ci_sync_admin)"
USER_TOKEN="$(login ci_sync_user)"
echo "export ADMIN_TOKEN='$ADMIN_TOKEN'"
echo "export USER_TOKEN='$USER_TOKEN'"
