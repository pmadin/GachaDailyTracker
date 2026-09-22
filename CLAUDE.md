# Gacha Daily Tracker — AI Context

Daily-reset tracker for 330+ gacha games. Users browse a game list, add games to a personal list, and mark daily completions. Anonymous use via localStorage; optional account creation syncs data to the DB.

**Current state:** V4. Backend on Heroku, frontend deployed to Vercel on `main`. V4 added a full feature platform on top of the V3.5 Kintsugi visual system: leaderboard with opt-in visibility, email digest, password reset (Resend), streak hardening, play scheduler, game submission flow, admin settings, 3NF schema cleanup, and icon CDN migration. V4 frontend redesign replaced the centered MarketingHero with a split two-column layout (animated hero copy + live game-preview panel) and rebuilt FeaturesSection as an asymmetric bento grid. Login/register page backgrounds now use distinct non-mirror rotations.

---

## Monorepo Layout

```
gacha_tracker/
├── src/                    # Express/TypeScript backend
├── frontend/               # Next.js 16 frontend (App Router)
├── data/                   # game-data-backup.json (330+ games)
├── scripts/                # download-game-data.js, download-icons.js
├── database/init/          # 01-schema.sql
└── test/postman/           # Postman collections
```

---

## Stack

| | Tech |
|---|---|
| Backend | Node.js 18 / TypeScript / Express.js |
| Database | PostgreSQL — Docker locally, Heroku Postgres in prod |
| Auth | JWT (30-day) + bcrypt + HMAC-SHA256 pepper |
| Frontend | Next.js 16.2 / React 19 / Tailwind v4 / Vercel |

---

## Design System — Kintsugi Gold Theme (V3.5)

The entire UI uses a warm black-and-gold palette. **There is no purple/violet anywhere.** All CSS custom properties are defined in `frontend/app/globals.css`.

**CSS variables:**
```
--bg:       #080808
--bg2:      #0d0b08
--bg3:      #111009
--surface:  #18140d
--border:   rgba(200,155,60,0.12)
--border2:  rgba(200,155,60,0.28)
--gold:     #c8913c
--gold-bright: #e8c86a
--gold-dim: #8a6020
--text:     #f0ede8
--text2:    #9a8570
--text3:    #4a3d2a
```

**Gold gradient button:** `background: linear-gradient(135deg, #c8913c, #e8c86a); color: #0a0808`

**Kintsugi card class:** `.kintsugi-card` defined in `globals.css`

**Input focus pattern:** `onFocus`/`onBlur` inline `borderColor` handlers instead of Tailwind focus classes.

**Do NOT change:** Any `red` / `red-400` / `red-950` / `border-red-*` / `focus:border-red-500` values — those are intentional semantic error colors. Never touch `_lib/` files or `src/` backend files.

---

## Frontend — important notes

**This is Next.js 16 App Router.** APIs and conventions differ from older versions. Before writing any Next.js code, check `node_modules/next/dist/docs/`. All pages under `frontend/app/` are Server Components by default; add `'use client'` for any component using hooks or browser APIs.

**Tailwind v4** — config is `@import "tailwindcss"` in `globals.css`, not a `tailwind.config.js` file. Custom CSS keyframes and utility classes go directly in `globals.css`.

**Key files:**
- `frontend/app/_lib/api.ts` — typed API client; `Game`, `TrackedGame`, `PopularGame`, `AuthUser` interfaces. `apiFetch` spreads `...init` BEFORE `headers` so `Content-Type` is never overwritten by auth headers.
- `frontend/app/_lib/storage.ts` — localStorage anon list (`AnonEntry[]` stores full Game objects + `completedDate`); also anon streak helpers (`getAnonStreak`, `updateAnonStreak`) and auth token/user helpers.
- `frontend/app/_lib/countdown.ts` — `getNextResetMs(timezone, dailyReset)` and `getLocalResetTime(timezone, dailyReset)` use `Intl.DateTimeFormat`.
- `frontend/app/_lib/servers.ts` — `SERVER_GROUPS` map (canonical group → raw DB values), `displayServer(raw)` for clean tags, `groupToRawServers(group)` for API filtering.
- `frontend/app/_context/AuthContext.tsx` — provides `token`, `user`, `login()`, `logout()`, `isLoading`.
- `frontend/app/api/register/route.ts` — server-side proxy: injects `REGISTRATION_TOKEN`, auto-calls login (backend register returns no JWT), and bulk-syncs anon games server-side (avoids CORS). Returns `{ token, user, synced: boolean }`.

**Pages:**
- `/` (`app/page.tsx`) — Home: "My Games" horizontal scroll (marquee when >9 games), "Popular Games" top-10 list, About section.
- `/games` — **Hybrid SSR.** `app/games/page.tsx` is an async Server Component that fetches the first 48 games at render time and passes them as `initialGames`/`initialTotal` props to `app/games/GamesClient.tsx` (the `'use client'` component that owns all search/filter/pagination state). The skeleton only shows on subsequent page/filter changes, not on first load.
- `/dashboard` (`app/dashboard/page.tsx`) — My List: sort by reset/alpha/custom (drag with @dnd-kit), streak display, progress bar, confetti on all-complete.
- `/profile` (`app/profile/page.tsx`) — Account info + delete account (client-side identifier validation, 403 → "Incorrect password").
- `/login`, `/register` — Auth forms with kintsugi vein SVG background (see below).
- `/privacy-policy`, `/terms-of-service` — Static legal pages (prose rewrite in V3.5, no lists, gold headings/links).
- `/admin/games` — Admin game management: search with 400ms debounce autocomplete, windowed Pagination component, sortable columns.
- `/admin/analytics` — Stats/analytics panel: KPI row, signup/completion trends (range presets 7d/30d/90d/1y/all — not capped at 30 days like a free-tier traffic-analytics plan, since it's our own DB), top streaks, most-tracked games, region popularity (by each game's own server region), users-by-country (derived from timezone via `countries-and-timezones`, approximate). Charts are `recharts`; shared building blocks are `admin/_components/{RankedBarChart,TrendChart,StatTile,ChartCard}.tsx`. Every chart has a "View as table" twin. Single-hue gold marks throughout (all series are single-series magnitude/ordinal, never a multi-hue identity palette) — see `src/routes/admin/analytics.ts` for the region-grouping/country-mapping logic.

**Key components:**
- `DashboardCard` — shows icon, name, server tag (`displayServer`), countdown (hidden when done), local reset time. Accepts optional `dragHandle` prop.
- `SortableCard` — wraps `DashboardCard` with `useSortable` from @dnd-kit for drag reorder.
- `GameCard` — game browser card with add/remove tracking button.
- `Pagination` — windowed page number component: shows first/last always, ±2 around current, `…` for gaps >1. Used in games browser and admin games page.
- `Navbar` — logo links to `/`. Nav links: Games + My List. Username dropdown (click-outside via `useRef`) with Profile link + Sign out. Hamburger hidden at `xl:` breakpoint (1280px) — needed for 2K monitors at high DPI scaling where `lg:` (1024px) was insufficient.
- `FeaturesSection` — three feature cards + notifications CTA strip at bottom. CTA uses `<Link href="/register">` (next/link imported).
- `Footer` — privacy/ToS links, copyright, GPL-3.0 attribution.
- `MarketingHero` — hero section includes `— GACHA DAILY TRACKER —` mono label (font-jetbrains-mono, `var(--text2)`) between the badge pill and the h1 headline.

**localStorage keys:**
- `gdt_anon_list` — anon tracked games (`AnonEntry[]`)
- `gdt_token` / `gdt_user` — auth persistence
- `gdt_order` — custom dashboard sort order (`number[]` of game_ids)
- `gdt_sort` — persisted dashboard sort preference (`'reset' | 'alpha' | 'custom'`); read on mount, written on every sort change
- `gdt_streak` — anon streak `{ count, lastDate }` (ISO date string)
- `gdt_confetti_date` — ISO date of last confetti fire (prevents re-trigger)

**Env vars (frontend):**
- `NEXT_PUBLIC_API_URL` — backend base URL (client + server)
- `REGISTRATION_TOKEN` — server-only; never sent to browser

**Icons:** 96×96 GIFs live in `frontend/public/icons/` (excluded from git via `.gitignore`). Run `node scripts/download-icons.js` to populate locally. `frontend/public/icons/placeholder.svg` and `frontend/public/placeholder.svg` are committed as fallback — kintsugi gold diamond gem (no text, no question mark).

---

## Favicon & Branding

**Frontend (`frontend/public/favicon.svg`):** Gold faceted diamond on dark `#0d0b08` background. 96×96 viewBox, three polygon facets with gold gradients, horizontal divider line.

**Backend API (`src/public/favicon.svg`):** Gold "G" monogram on dark warm background with gold border stroke. Used by `/gdt/` home, `/gdt/status`, and Swagger UI.

**`frontend/app/layout.tsx` metadata:**
```ts
export const metadata: Metadata = {
  title: 'GachaDailyTracker',
  description: 'Track your daily resets across 330+ gacha games.',
  icons: { icon: '/favicon.svg' },
};
```

**Fonts loaded in `layout.tsx`:** Geist (`--font-geist`), Plus Jakarta Sans (`--font-display`), JetBrains Mono (`--font-jetbrains-mono`), Noto Sans JP (`--font-noto-jp`).

**Navbar logo & wordmark:**
- 34×34 inline SVG: gold faceted diamond (gradients `navfg`/`navft`/`navfb`, line at y=40)
- Wordmark: `Gacha` (`var(--text)`) + `Daily` (`var(--gold, #c8913c)`) + `Tracker` (`var(--text3)`)
- Logo cluster: `display:flex; alignItems:center; gap:10`
- Nav background: `rgba(13,11,8,0.90)` (warm near-black — avoids blue cast of `rgba(10,10,15,...)`)
- All hamburger/desktop breakpoints use `xl:` (1280px), not `lg:`

**Login / Register backgrounds:**
- `frontend/public/kintsugi-veins-login-reg.svg` — kintsugi gold vein texture (color `#c8913c`)
- Login: `transform: scaleX(-1)`, opacity 0.25, radial-gradient mask (transparent center, opaque edges)
- Register: `transform: scaleY(-1)`, same mask and opacity
- Mask: `radial-gradient(ellipse 60% 55% at 50% 50%, transparent 0%, rgba(0,0,0,0.6) 45%, black 75%)`

---

## Backend HTML pages (`src/public/`)

`home.html`, `status.html` — standalone HTML pages (no Next.js). Themed with the same gold palette via inline CSS:
- `:root` vars: `--gold: #c8913c`, `--gold-bright: #e8c86a`, `--gold-dim: #8a6020`, warm dark `--bg`/`--bg2`/`--bg3`
- Gold gradient primary button, gold-tinted grid/orb hero elements
- Brand name: "GachaDailyTracker" (full, one word)
- Operational status dot (green) and error colors (red) are semantic — do not change

`src/config/swagger.ts` — Swagger UI topbar: `linear-gradient(135deg, #8a6020 0%, #c8913c 100%)` with gold border-bottom.

---

## Backend — key notes

**Env vars:** `DATABASE_URL`, `JWT_SECRET`, `PASSWORD_PEPPER`, `REGISTRATION_TOKEN`, `FRONTEND_URL`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`

**Routes** (all under `/gdt`):
- Public: `/games`, `/games/servers/list`, `/games/popular?limit=N`, `/timezones`, `/health`, `/status`
- Auth: `/auth/register`, `/auth/login`, `/auth/profile`, `/auth/update-password`, `/auth/update-email`, `/auth/account` (DELETE), `/auth/forgot-password` (POST), `/auth/reset-password/:token` (GET), `/auth/reset-password` (POST)
- Tracker (JWT): `/tracker/games` (GET — includes `streak` field), `/tracker/games/bulk` (POST), `/tracker/games/:id` (POST/DELETE), `/tracker/games/:id/complete` (POST/DELETE), `/tracker/streak` (POST — idempotent, atomic CASE update), `/tracker/order` (PUT — saves `display_order` via proper client transaction)
- Game mgmt (JWT): `/update/games/:id`, `/update/add/game`, `/update/delete/game/:id`, `/update/games/import`
- Submissions: `/submissions` (POST — create suggestion, JWT), `/admin/submissions` (GET — list, role 3+), `/admin/submissions/:id` (PATCH — approve/reject, role 3+)
- Admin (role 3+): `/admin/users/role/:username`, `/admin/users`, `/admin/users/search`
- Analytics (role 3+): `/admin/analytics` (GET, `?days=7|30|90|365|all`)
- Leaderboard: `/leaderboard/status` (public), `/leaderboard` (public, paginated), `/leaderboard/visibility` (GET/PATCH, JWT)
- Notifications (JWT): `/notifications/preferences` (GET/PATCH), `/notifications/email-preferences` (GET/PATCH), `/notifications/subscribe` (POST), `/notifications/unsubscribe` (DELETE), `/notifications/apply-default` (POST)
- Admin settings (role 3+): `/admin/settings` (GET), `/admin/settings/leaderboard` (PATCH)
- Schedule (JWT): `/schedule` (GET/POST), `/schedule/:gameId` (DELETE), `/schedule/today` (GET), `/schedule/week` (GET)

**Role system:** 1=User · 2=Premium · 3=Admin · 4=Owner

**Game data source:** `cicerakes/Game-Time-Master` (GPL-3.0). Data in `data/game-data-backup.json` is a modified JSON export of that repo's `game-data.js`. Icons from its `game-icons/` folder.

**Upstream sync** (`POST /admin/import/games`, logic in `src/services/gameSyncService.ts`, admin UI: Preview changes / Sync from upstream on `/admin/games`). Built after an earlier sync wiped users' tracked games, so it is deliberately conservative:
- **Never deletes from `games`** — rows are inserted, updated, renamed in place, or soft-deleted. `?dryRun=true` returns the full plan and writes nothing (same code path as a real run).
- **Renames** go in `data/game-renames.json` (`"Old Name||Old Server": "New Name||New Server"`). The existing row is renamed in place so its `id` — and every `user_games` / `daily_completions` / `play_schedules` row pointing at it — is preserved. Check the dry run for games that disappeared upstream: if a tracked game was renamed rather than removed, add a pair here *before* syncing.
- A game that any user tracks is **never deactivated**; it is listed in `skipped_deactivations` for the admin to review. Only `source = 'game-time-master'` rows are ever deactivated; admin/`user-submission` games are left alone and never re-labelled.
- Guards: refuses (422) if upstream has < 80% of the currently-active upstream-managed games; skips + reports duplicate/invalid entries; upstream file is parsed in a `vm` sandbox, not `eval`. The local backup file is only refreshed after a successful commit.
- **Tests:** pure planning rules live in `src/services/syncPlan.ts` (no DB imports) and are unit-tested by `npm run test:sync` (`test/sync/syncPlan.test.ts`). HTTP-level guarantees are in the Postman collection `test/postman/Test Game Sync.postman_collection.json`; it needs an admin JWT, so `test/ci/sync-test-setup.sh` creates the admin/regular users + synthetic `ZZ-CI-SYNC` games (and `sync-test-cleanup.sh` removes them). Both run in CI. To run locally, use a throwaway DB, never your prod copy — the collection performs a real sync.

---

## Database Schema (key tables)

```
users             — accounts, bcrypt hash, role, timezone,
                    streak_count INTEGER DEFAULT 0, streak_last_date DATE,
                    leaderboard_hidden BOOLEAN DEFAULT FALSE,
                    email_digest_enabled BOOLEAN DEFAULT false,
                    email_digest_hour SMALLINT DEFAULT 8
games             — name, server, timezone, daily_reset, icon_name, is_active,
                    add_count INTEGER DEFAULT 0
user_games        — user ↔ game join; display_order INTEGER DEFAULT 0,
                    custom_reminder_offset INTEGER DEFAULT 0
daily_completions — user_id, game_id, completion_date (UNIQUE constraint)
push_subscriptions — user_id, endpoint, p256dh, auth
password_reset_tokens — user_id, token, expires_at, used (30-min expiry, single-use)
site_settings     — key/value admin toggles (leaderboard_enabled)
play_schedules    — user_id, game_id, days_of_week SMALLINT[], window_start TIME, window_end TIME,
                    hook_notifications BOOLEAN (fires push at window_start instead of reset offset)
```

Games use **soft-delete** (`is_active = false`). `UNIQUE(name, server)` prevents duplicates. All user FKs have `ON DELETE CASCADE`.

**Migrations run on Heroku (not in schema file):**
```sql
ALTER TABLE games ADD COLUMN add_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN streak_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN streak_last_date DATE;
ALTER TABLE user_games ADD COLUMN display_order INTEGER NOT NULL DEFAULT 0;

-- v4.0 3NF normalization:
ALTER TABLE users DROP COLUMN IF EXISTS first_name, DROP COLUMN IF EXISTS last_name, DROP COLUMN IF EXISTS phone;
ALTER TABLE user_games DROP COLUMN IF EXISTS is_enabled;
CREATE INDEX IF NOT EXISTS idx_users_streak ON users(streak_count DESC) WHERE streak_count > 0;

-- v4.0 streak hardening:
ALTER TABLE users ADD COLUMN IF NOT EXISTS streak_last_attempted_at TIMESTAMP;

-- v4.1 leaderboard + email digest + password reset:
CREATE TABLE IF NOT EXISTS site_settings (key VARCHAR(100) PRIMARY KEY, value TEXT NOT NULL, updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
INSERT INTO site_settings (key, value) VALUES ('leaderboard_enabled', 'false') ON CONFLICT DO NOTHING;
ALTER TABLE users ADD COLUMN IF NOT EXISTS leaderboard_hidden BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_digest_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_digest_hour SMALLINT NOT NULL DEFAULT 8;
CREATE TABLE IF NOT EXISTS password_reset_tokens (id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, token VARCHAR(255) UNIQUE NOT NULL, expires_at TIMESTAMP NOT NULL, used BOOLEAN DEFAULT false, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS idx_reset_tokens_token ON password_reset_tokens(token);
CREATE INDEX IF NOT EXISTS idx_reset_tokens_user_id ON password_reset_tokens(user_id);

-- v4.2 play scheduler:
CREATE TABLE IF NOT EXISTS play_schedules (id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, game_id INTEGER REFERENCES games(id) ON DELETE CASCADE, days_of_week SMALLINT[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}', window_start TIME NOT NULL, window_end TIME NOT NULL, hook_notifications BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, game_id));
CREATE INDEX IF NOT EXISTS idx_play_schedules_user_id ON play_schedules(user_id);
CREATE INDEX IF NOT EXISTS idx_play_schedules_game_id ON play_schedules(game_id);
```

---

## Dev commands

```bash
# Backend (project root)
npm run local        # Docker DB (.env)
npm run dev          # Heroku DB (.env.development) — talks to PRODUCTION data; don't use for testing writes
npm run db-reset     # restart Docker postgres (postgres:17, matches Heroku PG 17)

# Realistic local data: back up prod (heroku pg:backups:capture + pg_dump -Fc into gitignored backups/),
# then restore into Docker with pg_restore --no-owner --no-acl, skipping _heroku / EVENT TRIGGER /
# EXTENSION entries (pg_restore -L filtered.list). ALWAYS scrub before running the app:
#   UPDATE users SET email='user'||id||'@example.test'; TRUNCATE push_subscriptions, password_reset_tokens;
# backups/ contains emails + password hashes — never commit it.

# Frontend
cd frontend
npm run dev          # http://localhost:3000
node ../scripts/download-icons.js   # populate icons/ folder

# Heroku DB (connect)
heroku pg:psql -a gachadailytracker
```

---

## Key decisions / gotchas

- **Anon storage stores full Game objects**, not just IDs — avoids a pagination lookup problem where games beyond the first 48 results couldn't be found by ID alone.
- **`AuthContext.isLoading`** flag prevents race conditions on mount; always gate effects on `!authLoading`.
- **`apiFetch` header order matters** — `...init` must spread BEFORE `headers: { 'Content-Type', ...init?.headers }` so Content-Type is never overwritten by the caller's auth header object.
- **Streak update happens in both `handleToggleComplete` (dashboard) and `handleToggle` (home page)**, not a `useEffect` — avoids false triggers on load. Both pages call `checkStreak`/`updateAnonStreak` and fire confetti when the last game is marked done.
- **Streak verification**: `POST /tracker/streak` verifies all tracked active games have `daily_completions` rows for their current game-local period before incrementing. Rate limited to once per 60 seconds per user via `streak_last_attempted_at`. Returns `allComplete`, `completed`, `total` so the frontend can trigger confetti/done-state without a separate fetch.
- **Confetti deduplication** uses `localStorage('gdt_confetti_date')` (not a ref) so it survives page refreshes.
- **Register proxy** (`frontend/app/api/register/route.ts`): backend register returns `{ message, user }` with no JWT, so the proxy calls login automatically and also bulk-syncs anon games server-to-server (bypasses CORS). Client clears anon games only if `synced === true`.
- **`PUT /tracker/order` uses `database.getClient()`** for the transaction loop — `database.query()` gets a different connection per call, so BEGIN/COMMIT/ROLLBACK would be on separate connections and have no effect.
- **Custom sort order**: loaded from localStorage on mount via `useEffect` (not lazy `useState` — avoids SSR crash). If no saved order, seeded from DB `display_order` on first load for logged-in users.
- **Server filter** in games route accepts comma-separated values (`server=JP,KR`) mapped from canonical `SERVER_GROUPS`. Empty-after-filter arrays are ignored (no filter applied) rather than returning zero results.
- **`useMemo([games, sortBy])`** for dashboard sort keeps sort from re-running on every countdown tick.
- **Marquee scroll** on home page activates when >9 tracked games: uses `inline-flex` (not `flex`) so `translateX(-50%)` references content width, not viewport width. Cards are doubled in the DOM for seamless loop. Duration = `sorted.length * 3` seconds.
- **Icon img CLS fix**: every game icon `<img>` is wrapped in a fixed-size `<div>` (matching width/height) with `style={{ aspectRatio: '1/1' }}` on the img so `onError` src-swaps don't cause layout shift.
- **Home page CLS fix**: while auth resolves, the top section renders a `min-height: 220px` animate-pulse skeleton instead of a blank div so the Popular Games and Features sections below never shift position.
- **`/games` GamesClient skip-first-load**: a `useRef(initialGames.length > 0)` flag skips the mount `useEffect` fetch when SSR already provided data, preventing a redundant duplicate API call on hydration.
- **Admin games search debounce**: 400ms `useEffect` on `search` state triggers `setSubmittedSearch` and resets `page` to 0 — matches the games browser pattern. No form submit needed.
- **Admin user emails are masked server-side** (`src/utils/mask.ts`, applied in `GET /admin/users`, `GET /admin/users/search`, `PATCH /admin/users/role/:username`) — e.g. `begino4315@gzeos.com` → `b********5@gzeos.com`. Domain stays visible, local part doesn't; done in the API response itself (not just the UI) so a compromised admin token can't bulk-scrape raw emails. Search still matches the real address underneath. `/admin/users` also paginates properly now (`LIMIT`/`OFFSET` + a real `COUNT(*)` for `total`) — it used to ignore `limit`/`offset` entirely and return every matching row on every page.
- **Navbar `xl:` breakpoint**: hamburger uses `xl:hidden` / `xl:flex` (1280px), not `lg:`. 2K monitors at 150–200% DPI scaling bring logical CSS pixels below 1024px, making `lg:` insufficient.
- **Warm near-black**: `rgba(13,11,8,...)` matches the site's `#0d0b08` base. Avoid `rgba(10,10,15,...)` — the higher blue channel creates a visible cool/blue tint against the warm gold accents.
- **placeholder.svg path**: components reference `/icons/placeholder.svg` — the file lives at `frontend/public/icons/placeholder.svg`. A copy also exists at `frontend/public/placeholder.svg`.

---

## Backend bug fixes (V2.5)

- **Game-timezone-aware `completion_date`** (fixed in `tracker.ts`): all three completion queries (`GET /tracker/games` LEFT JOIN, `POST /complete` INSERT, `DELETE /complete`) now compute the **game-local period date** instead of using `CURRENT_DATE` (UTC). Formula: if current time in the game's timezone ≥ `daily_reset` → use today's local date; else → yesterday's local date. This fixes a bug where completing games just before their reset (e.g., at 3 AM for a 4 AM reset) kept them marked done after the reset fired, since both timestamps shared the same UTC calendar date.
