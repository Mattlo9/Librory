-- 8. Sesiones de estudio Pomodoro
CREATE TABLE IF NOT EXISTS study_sessions (
    id TEXT PRIMARY KEY,
    item_id TEXT REFERENCES items(id) ON DELETE SET NULL,
    phase TEXT NOT NULL DEFAULT 'focus'
        CHECK (phase IN ('focus', 'short_break', 'long_break')),
    planned_seconds INTEGER NOT NULL CHECK (planned_seconds > 0),
    duration_seconds INTEGER NOT NULL CHECK (duration_seconds > 0),
    completed INTEGER NOT NULL DEFAULT 1 CHECK (completed IN (0, 1)),
    started_at TEXT NOT NULL,
    ended_at TEXT NOT NULL,
    local_date TEXT NOT NULL,
    local_hour INTEGER NOT NULL CHECK (local_hour >= 0 AND local_hour <= 23),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_study_sessions_local_date ON study_sessions(local_date DESC);
CREATE INDEX IF NOT EXISTS idx_study_sessions_item_id ON study_sessions(item_id);
CREATE INDEX IF NOT EXISTS idx_study_sessions_phase_date ON study_sessions(phase, local_date DESC);
