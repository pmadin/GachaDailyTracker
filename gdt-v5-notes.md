# GDT V5: Release Notes & Plan

V5 isn't one big drop. It ships as a series of chunks merged to `main` over time. This file tracks what's already in V5, what's still planned, and in what order. When V5 is called done, section 1 becomes the V5 entry in the README version history.

Last V4 commit: `30ee1c5` (2026-05-22). Everything after that counts as V5.

---

## 1. Shipped in V5 so far ✅

**Streaks & badges**
- ✅ Streak achievement badges on `/profile`, real CSS 3D polyhedra from Iron (7 days) to Diamond (365 days), no WebGL (`6d3b9f2`)
- ✅ Permanent `users.streak_best` that never resets, so badges survive a broken streak (`6d3b9f2`)
- ✅ End-to-end badge milestone test (`npm run test:streak-trigger`), badge preview moved behind admin (`7ca8d22`)
- ✅ Current streak counter with progress to the next badge (`a308549`)

**Homepage**
- ✅ Status-first homepage for signed-in users (`87eb08d`)

**Admin**
- ✅ Statistics/analytics panel: KPIs, signup/completion trends (7d to all-time), top streaks, most-tracked games, region and country breakdowns, every chart has a table view (`977baaf`)
- ✅ Sortable Users/Submissions tables, real pagination, emails masked server-side (`a925fd9`)
- ✅ Kintsugi background generator at `/admin/kintsugi`: seeded, islands grown by sequential cracking, SVG export (`d7dfdcc`, `2467027`)

**Game data**
- ✅ Safe upstream sync: never deletes games, renames in place via `data/game-renames.json`, dry run preview, refuses if upstream looks truncated, never deactivates a game someone tracks (`c0f1227`)
- ✅ Sync planner unit tests plus Postman/CI coverage (`ffa6915`)

**Profile**
- ✅ Timezone selector and IANA timezone validation fix (`333c386`)

**Design**
- ✅ Custom on-brand 404 page, "This banner has already ended." (`b51286f`)
- ✅ Kintsugi card hover veins fixed (pointed at a missing SVG before), toned down and turned off on admin/profile cards (`c61dc48`, `6dcb402`)

**Reliability & ops**
- ✅ Release-phase schema check: Heroku refuses a deploy if the live DB is missing a table or column from `01-schema.sql` (`f565b51`)
- ✅ Daily scheduled Heroku backups plus `npm run backup:pull` for local copies (`f565b51`)
- ✅ Stopped logging the full `DATABASE_URL` on connection errors (`746eb4b`)
- ✅ Clearer error for Brave's disabled push service, spam-folder note on the reset email (`6f1ffa3`)

---

## 2. Pillar 1: Email verification (Resend OTP)

Started when someone registered with `nogid52036@dosbee.com`, a known disposable domain. Verification won't stop every temp email, but it adds a real step at signup and confirms the address works for reset emails and the digest.

**Proposed shape (not built yet):**
- **OTP code instead of a magic link.** The user stays on the register page and types a 6-digit code. No deep-link handling, and it works when their mail app opens on another device.
- **Flow:** register, account is created with `email_verified = false`, code is emailed through Resend, user submits it to `POST /auth/verify-email`, done.
- **Reuse what's there:** Resend is already set up and sending (`src/routes/auth/passwordReset.ts`, `src/workers/emailDigestCron.ts`), and `src/workers/emailTemplate.ts` has the email styling. The verified sending domain already exists, so setup is mostly new code, not new config.
- **Schema** (Heroku migration first, see CLAUDE.md):
  - `users.email_verified BOOLEAN NOT NULL DEFAULT false`, plus `UPDATE users SET email_verified = true` to grandfather existing accounts
  - `email_verification_codes` table: `user_id`, `code_hash`, `expires_at` (~10 min), `attempts`, `created_at`
- **Safety:** store a hash of the code, not the code. Cap wrong attempts (~5), add a resend cooldown (~60 s).
- **Register proxy:** `frontend/app/api/register/route.ts` auto-logs-in and syncs anon games right after signup. Simplest option is to keep that, show a "verify your email" banner, and gate the extras (leaderboard, email digest, push) until verified.
- **Email change:** `src/routes/auth/emailUpdate.ts` should reset `email_verified` and send a fresh code.
- **Resend limits:** free tier is 100 emails/day and 3,000/month. Check that's comfortable next to the digest volume.
- **Cleanup cron (complement):** delete accounts still unverified after N days with zero games. Domain blocklists stay optional; they're a cat-and-mouse game.

**Open questions**
- Gate login, or let them in and gate only features?
- Code length and expiry?
- Grandfather existing accounts, or ask them to verify too?

---

## 3. Pillar 2: Streak badge unlock reveal

Badges unlock correctly today, but nothing tells the user. `POST /tracker/streak` already returns `streakBest` and the dashboard/home handlers ignore it, so a new badge only shows up if someone visits `/profile`.

**The vision: a gacha pull reveal.** When a tier unlocks, a centered overlay plays like a gold pull in WuWa or NIKKE: the screen dims, a streak of light, a burst in the tier's color (Iron grey up to Diamond), then the `PolyhedronBadge` spins in with the tier name and "N-day streak". Click or Esc to skip, and a simple fade for `prefers-reduced-motion`.

**Fallback if the full overlay is too much:** a corner toast, "New badge unlocked". The toast alone is the minimum notice. Clicking it opens a reveal page styled like a banner pull, loot box, or CS2 case opening. Watching it is optional.

**Implementation notes**
- Have the API return `tierUnlocked` so the client doesn't need to diff. Read the old `streak_best` in the same statement (CTE) in `src/routes/tracker/tracker.ts`, compare with `highestEarnedTier()` from `src/constants/streakTiers.ts` (mirrored in `frontend/app/_lib/badges.ts`).
- Trigger from the dashboard `handleToggleComplete` and home `handleToggle`, alongside the existing confetti.
- Dedupe per tier in localStorage (same idea as `gdt_confetti_date`) so a refresh doesn't replay it.
- **Anon users:** skipped. No badges for anon, they're the simple-tracking tier.

---

## 4. Pillar 3: Game submissions revamp + review the 15 pending games

Comes before weekly resets. 15 user-submitted games are sitting in `game_submissions` unreviewed, and the admin page needs work before reviewing them makes sense.

**What "Approve" does today** (`PATCH /admin/submissions/:id` in `src/routes/submissions.ts`): marks the submission approved and inserts the game into `games` with `is_active = false`, `source = 'user-submission'` and no icon. If a game with the same name and server already exists, the insert silently does nothing. The admin then has to find it on `/admin/games` and activate it by hand. There's no way to fix typos before approving, no icon, and no preview.

**Icons.** Every icon `<img>` builds `${NEXT_PUBLIC_ICONS_BASE_URL}/${icon_name}.gif`, and that base URL is the Game-Time-Master GitHub folder. Submitted games aren't in that repo, so they need their own storage. That logic is copy-pasted in `GameCard`, `DashboardCard`, `GamesTray`, `PopularGames` and `home/TodayPlan`; replace those with one `gameIconSrc(game)` helper.

**Where to store custom icons** (decide together):
- **Postgres `bytea` (leaning this way).** Heroku's dyno filesystem is wiped on every restart, so "store it on Heroku" really means storing it in the DB. A 96×96 icon is about 5–15 KB, so even 50 of them is tiny. Admins can upload from the UI, the API serves them at something like `/gdt/icons/custom/:id` with long cache headers, and they're in the daily backups for free.
- **Git repo** (`frontend/public/icons-custom/`). Simplest to serve through Vercel, but every icon needs a commit and a deploy, so no uploading from the admin page.
- Vercel Blob also works but adds another service for a handful of files.

**Upload rules**
- Admins only (role 3+). Users can never upload files.
- Still clean admin uploads: check the real file type from the bytes (PNG, JPEG, WebP, GIF; no SVG), cap the input size (~2 MB), then re-encode with `sharp`, which strips metadata and anything hidden in the file.
- Resize to 96×96 to match the upstream icons, keeping the aspect ratio (pad to square, or center-crop; pick after trying a few).
- Same processing as a CLI script (`scripts/process-icon.js`) for batch or local use.

**Admin submissions page revamp** (`frontend/app/admin/submissions/page.tsx`)
- Edit name, server, timezone and daily reset before approving, with the submitter's original values shown next to them.
- Duplicate check: list existing games with a similar name or server so near-duplicates get caught.
- Icon upload with a **live preview** of the real `GameCard` and `DashboardCard` using the edited data (countdown, local reset time, server tag), so the admin sees exactly what users will see.
- "Approve & activate" in one step, with "approve as inactive" still available. Reject with a note.
- Schema likely gets `games.icon_data BYTEA` + `icon_mime` (or a separate `game_icons` table), and maybe a `content_rating` column. Heroku migration first.

**Then review the 15 together.** Check each one against official sources (reset time, server, timezone), fix what's wrong, add an icon, approve or reject.

**NSFW / adult gacha games.** Not disallowed, but a gray area. Options:
- (a) Allow with a `content_rating` flag. Hidden from browse and popular lists by default, opt-in toggle (profile for accounts, localStorage for anon), icon blurred until opted in.
- (b) Allow only if the game is on a mainstream store (Google Play, App Store, Steam) and use that store's rating as the line.
- (c) Reject explicit-only titles.

Leaning (a). Decide during the review. The ToS and privacy policy may need a line either way.

---

## 5. Pillar 4: Weekly resets

From a closed GitHub issue: WuWa has a mode that gives 160 Astrite and resets weekly, HSR has a similar weekly mode for pull currency. When asked, the idea was a weekly checkbox that resets once a week next to the daily one (not a weekly history view).

**Notes**
- Game-Time-Master has no weekly data, only `dailyReset`, so weekly reset days are admin-curated. Most games reset Monday at their daily reset time. Add `games.weekly_reset_day SMALLINT` (null means no weekly tracking).
- Store completions in a `weekly_completions` table (or a `period_type` column on `daily_completions`), with the period computed in game-local time like the V2.5 daily fix.
- UI: a second checkbox or "weekly" pill on `DashboardCard`, with a countdown to the weekly reset. The admin games page gets a weekly-day field. Submissions could include it later.

**Open questions**
- One weekly box per game, or multiple named weeklies (bosses, shop, mode)?
- Do weeklies count toward the streak?
- Anon support? Probably yes, it's cheap in localStorage.

---

## 6. Smaller V5 items

**Anon browser notifications.** Anon users are deliberately minimal, but notifications are the one thing they really miss. Idea: after an anon user adds their first game, a small settings prompt offers to turn on browser push. The catch is that push is sent by the server per user (`push_subscriptions.user_id`, `src/workers/notificationCron.ts`), so anon push needs either an anon subscription row that carries their game IDs, or a lighter "notify while the tab is open" mode. Clearing site data removes it, same as the rest of anon state.

**Per-page kintsugi backgrounds.** ✅ The generator itself is done. What's left: give login, register, forgot-password, reset-password and 404 their own generated SVGs, since they all share `kintsugi-veins-login-reg.svg` right now. A Web Worker to keep slider drags smooth is optional.

**Popular Games: count anon users, weighted.** Right now only accounts move the chart. `/games/popular` ranks by `games.add_count`, which only goes up on the logged-in add routes (`POST /tracker/games/:id` and `/bulk` in `src/routes/tracker/tracker.ts`). Anon adds stay in localStorage, and only reach the chart if that person later registers and their list gets bulk-synced. `add_count` also never goes down: removing a game or deleting an account doesn't subtract, so it's lifetime adds rather than current popularity. With a small user base, a few accounts adding and removing games reshuffled the top 10 a lot within about two months.

Plan: a weighted score that mixes both groups.
- **Accounts:** rank by how many users track the game right now (`COUNT(*)` from `user_games`) instead of the lifetime `add_count`, so removals and deleted accounts drop out.
- **Anon:** new `games.anon_add_count` column, bumped by a public endpoint (e.g. `POST /games/:id/anon-add`) when an anon user adds a game. One count per game per browser (localStorage flag) and a per-IP rate limit, since anyone can call an endpoint that has no login. Removing the game in the browser could call a matching decrement.
- **Score:** something like `current_trackers + 0.5 × anon_add_count`, with the anon weight stored in `site_settings` so an admin can tune it or set it to 0 if it gets gamed.
- Count each person only once: a registering anon user's bulk sync already counts them as an account, so it shouldn't also keep their anon count. Accept a small overlap or decrement on sync.
- Keep `add_count` for the analytics panel's history.

Open questions: starting weight? Does anon decrement on remove, or count adds only? Show the account/anon breakdown in admin analytics?

**IP geolocation.** Low priority. `getTimezoneFromIP()` in `src/services/timezoneService.ts` is still a stub returning `America/Los_Angeles`. Real users send their browser timezone at signup, so only raw API calls hit it. Free options if it's ever needed: `ipapi.co`, `ip-api.com`, `ipinfo.io`.

---

## 7. Last, for fun: Gacha-chan mascot

Replaces the old "badge mascot per tier" idea. The polyhedra stay as the badge art.

- **Gacha-chan:** the embodiment of the top-tier pull, the gold/SSR/UR character. Kintsugi black and gold, chibi style. Other character ideas are welcome.
- **First use:** a dazed Gacha-chan with swirly (@_@) eyes on the 404 page, as a static SVG so the 404 stays a zero-JS Server Component. Maybe a slow CSS-only spin on the eyes.
- **Later:** she could show up in the badge reveal.
- **Needs concept work first:** silhouette, outfit, gold-crack motifs, a few expressions. Hand-written SVG anime art from Claude is hit or miss, so the likely path is concept art with an image generator, then trace and simplify to SVG.

---

## 8. Dropped

- **Hoyolab API sync.** No official public API, it would need users' Hoyolab auth cookies, and it risks breaking Hoyoverse's ToS. Not doing it.

---

## 9. Open questions

- Email verification: gate login, or only features?
- Custom icon storage: DB or repo?
- NSFW policy for submitted games
- Weekly resets: one box per game or named weeklies?
- Is anon push worth the backend work?
- Popular Games: anon weight, and whether to rank by current trackers
