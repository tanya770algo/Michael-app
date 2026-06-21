"""
שכבת דאטהבייס פשוטה מבוססת SQLite.
הטבלה michael_king_songs שומרת שירים שכבר נותחו, כדי:
  1. שלא נצטרך לנתח מחדש (חוסך זמן לילד).
  2. שלא נשלם שוב ל-Klangio על אותו קובץ (caching לפי hash).
"""
import os
import sqlite3

# הדאטהבייס נשמר כברירת מחדל בשורש הפרויקט (תיקייה אחת מעל michael_king/).
# אפשר לשנות נתיב דרך משתנה הסביבה MK_DB_PATH (נוח לבדיקות / לפריסה).
DB_PATH = os.environ.get(
    "MK_DB_PATH",
    os.path.join(os.path.dirname(os.path.dirname(__file__)), "michael_king.db"),
)


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_conn() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS michael_king_songs (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                file_hash   TEXT UNIQUE,
                song_name   TEXT NOT NULL,
                notes_json  TEXT NOT NULL,
                source      TEXT NOT NULL DEFAULT 'klangio',
                best_streak INTEGER NOT NULL DEFAULT 0,
                created_at  TEXT NOT NULL DEFAULT (datetime('now'))
            )
            """
        )
        conn.commit()


def find_by_hash(file_hash):
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM michael_king_songs WHERE file_hash = ?", (file_hash,)
        ).fetchone()
        return row


def insert_song(file_hash, song_name, notes_json, source="klangio"):
    with get_conn() as conn:
        cur = conn.execute(
            """INSERT INTO michael_king_songs (file_hash, song_name, notes_json, source)
               VALUES (?, ?, ?, ?)""",
            (file_hash, song_name, notes_json, source),
        )
        conn.commit()
        return conn.execute(
            "SELECT * FROM michael_king_songs WHERE id = ?", (cur.lastrowid,)
        ).fetchone()


def list_songs():
    with get_conn() as conn:
        return conn.execute(
            "SELECT * FROM michael_king_songs ORDER BY created_at DESC, id DESC"
        ).fetchall()


def get_song(song_id):
    with get_conn() as conn:
        return conn.execute(
            "SELECT * FROM michael_king_songs WHERE id = ?", (song_id,)
        ).fetchone()


def delete_song(song_id):
    with get_conn() as conn:
        conn.execute("DELETE FROM michael_king_songs WHERE id = ?", (song_id,))
        conn.commit()


def update_best_streak(song_id, streak):
    """מעדכן שיא רצף אישי רק אם הרצף החדש גבוה מהקיים. מחזיר את השיא הסופי."""
    with get_conn() as conn:
        row = conn.execute(
            "SELECT best_streak FROM michael_king_songs WHERE id = ?", (song_id,)
        ).fetchone()
        if row is None:
            return 0
        best = max(int(row["best_streak"] or 0), int(streak or 0))
        conn.execute(
            "UPDATE michael_king_songs SET best_streak = ? WHERE id = ?", (best, song_id)
        )
        conn.commit()
        return best
