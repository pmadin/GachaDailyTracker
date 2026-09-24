-- v4.0 3NF normalization:
-- Dropped from users: first_name, last_name, phone (never used in app features)
-- Dropped from user_games: is_enabled (always true, never filtered on)

-- Users table
CREATE TABLE users (
    id              SERIAL PRIMARY KEY,
    username        VARCHAR(50)  UNIQUE NOT NULL,
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    timezone        VARCHAR(50)  DEFAULT 'America/Los_Angeles',

    -- Role system: 1=user, 2=premium, 3=admin, 4=owner
    role            INTEGER NOT NULL DEFAULT 1,

    -- Streak tracking
    streak_count             INTEGER NOT NULL DEFAULT 0,
    streak_last_date         DATE,
    streak_last_attempted_at TIMESTAMP,
    streak_best              INTEGER NOT NULL DEFAULT 0,

    -- Push notification default offset (minutes before reset)
    notification_offset INTEGER NOT NULL DEFAULT 30,

    -- Leaderboard opt-out (admins/owners can hide themselves)
    leaderboard_hidden BOOLEAN NOT NULL DEFAULT FALSE,

    -- Email digest opt-in
    email_digest_enabled BOOLEAN  NOT NULL DEFAULT false,
    email_digest_hour    SMALLINT NOT NULL DEFAULT 8,

    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Games table
CREATE TABLE games (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    server          VARCHAR(100) NOT NULL,
    timezone        VARCHAR(50)  NOT NULL,
    daily_reset     TIME         NOT NULL,
    icon_name       VARCHAR(100),
    source          VARCHAR(50)  DEFAULT 'game-time-master',
    is_active       BOOLEAN      DEFAULT true,
    add_count       INTEGER      NOT NULL DEFAULT 0,
    last_verified   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(name, server)
);

-- User's selected games
CREATE TABLE user_games (
    id                     SERIAL PRIMARY KEY,
    user_id                INTEGER REFERENCES users(id) ON DELETE CASCADE,
    game_id                INTEGER REFERENCES games(id) ON DELETE CASCADE,
    custom_reminder_offset INTEGER DEFAULT 0,  -- minutes before reset (0 = use user default)
    display_order          INTEGER NOT NULL DEFAULT 0,
    created_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, game_id)
);

-- Daily completion tracking
CREATE TABLE daily_completions (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER REFERENCES users(id) ON DELETE CASCADE,
    game_id         INTEGER REFERENCES games(id) ON DELETE CASCADE,
    completion_date DATE NOT NULL,
    completed_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, game_id, completion_date)
);

-- Push notification subscriptions (one row per browser/device per user)
CREATE TABLE push_subscriptions (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
    endpoint    TEXT NOT NULL,
    p256dh      TEXT NOT NULL,
    auth        TEXT NOT NULL,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, endpoint)
);

-- Game submissions (user-submitted games pending admin review)
CREATE TABLE game_submissions (
    id              SERIAL PRIMARY KEY,
    submitted_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    submitter_role  INTEGER NOT NULL,
    name            VARCHAR(255) NOT NULL,
    server          VARCHAR(100) NOT NULL,
    timezone        VARCHAR(50)  NOT NULL,
    daily_reset     TIME         NOT NULL,
    notes           TEXT,
    status          VARCHAR(20)  NOT NULL DEFAULT 'pending',
    reviewed_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    review_notes    TEXT,
    reviewed_at     TIMESTAMP,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_status CHECK (status IN ('pending', 'approved', 'rejected'))
);

-- Site-wide settings (generic key-value for admin toggles)
CREATE TABLE IF NOT EXISTS site_settings (
    key         VARCHAR(100) PRIMARY KEY,
    value       TEXT NOT NULL,
    updated_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO site_settings (key, value)
VALUES ('leaderboard_enabled', 'false')
ON CONFLICT (key) DO NOTHING;

-- Password reset tokens (30-minute expiry, single-use)
CREATE TABLE password_reset_tokens (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
    token       VARCHAR(255) UNIQUE NOT NULL,
    expires_at  TIMESTAMP NOT NULL,
    used        BOOLEAN DEFAULT false,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Play schedules (personal play windows per game, per user)
CREATE TABLE play_schedules (
    id                  SERIAL PRIMARY KEY,
    user_id             INTEGER REFERENCES users(id) ON DELETE CASCADE,
    game_id             INTEGER REFERENCES games(id) ON DELETE CASCADE,
    days_of_week        SMALLINT[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}',
    window_start        TIME NOT NULL,
    window_end          TIME NOT NULL,
    hook_notifications  BOOLEAN NOT NULL DEFAULT false,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, game_id)
);

-- Indexes for performance
CREATE INDEX idx_user_games_user_id       ON user_games(user_id);
CREATE INDEX idx_daily_completions_user   ON daily_completions(user_id, completion_date);
CREATE INDEX idx_games_active             ON games(is_active) WHERE is_active = true;
CREATE INDEX idx_users_role               ON users(role);
CREATE INDEX idx_push_subs_user           ON push_subscriptions(user_id);
CREATE INDEX idx_submissions_status       ON game_submissions(status);
CREATE INDEX idx_submissions_submitted_by ON game_submissions(submitted_by);
CREATE INDEX IF NOT EXISTS idx_users_streak ON users(streak_count DESC) WHERE streak_count > 0;
CREATE INDEX idx_reset_tokens_token       ON password_reset_tokens(token);
CREATE INDEX idx_reset_tokens_user_id     ON password_reset_tokens(user_id);
CREATE INDEX idx_play_schedules_user_id   ON play_schedules(user_id);
CREATE INDEX idx_play_schedules_game_id   ON play_schedules(game_id);
