CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    activity TEXT NOT NULL,
    icon TEXT NOT NULL,
    event_date TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mood (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    percentage INTEGER NOT NULL,
    label TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
