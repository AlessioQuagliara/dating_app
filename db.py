import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "data" / "app.db"
SCHEMA_PATH = Path(__file__).parent / "schema.sql"


def get_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    conn = get_db()
    with open(SCHEMA_PATH) as f:
        conn.executescript(f.read())
    row = conn.execute("SELECT COUNT(*) AS c FROM mood").fetchone()
    if row["c"] == 0:
        conn.execute(
            "INSERT INTO mood (percentage, label) VALUES (?, ?)", (80, "Innamorato")
        )
        conn.commit()
    conn.close()
