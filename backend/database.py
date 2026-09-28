"""Database connection: Turso online, a SQLite file on your computer.

- TURSO_DATABASE_URL is set  -> Turso (SQLite in the cloud, data is permanent). Used on Vercel.
- not set                    -> backend/data/vazifa.db (a normal SQLite file). Used locally.

Both speak the same SQLite SQL, so the rest of the code doesn't care which one is used.
"""

import os
import sqlite3
from contextlib import contextmanager
from datetime import date, timedelta
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
SCHEMA_PATH = BASE_DIR / "schema.sql"

TURSO_URL = os.getenv("TURSO_DATABASE_URL", "").strip()
TURSO_TOKEN = os.getenv("TURSO_AUTH_TOKEN", "").strip()
ON_VERCEL = bool(os.getenv("VERCEL"))

if TURSO_URL:
    MODE = "turso"
    DB_PATH = None
elif ON_VERCEL:
    # Vercel can only write to /tmp, and /tmp is wiped often: data will NOT be kept.
    # This only exists so the app starts; set TURSO_DATABASE_URL on Vercel.
    MODE = "tmp"
    DB_PATH = Path("/tmp/vazifa.db")
else:
    MODE = "file"
    DB_PATH = Path(os.getenv("DB_PATH", BASE_DIR / "data" / "vazifa.db"))


def _connect():
    if MODE == "turso":
        import turso_serverless  # imported here so local runs don't need it

        # isolation_level=None: every statement commits on its own (fewer network round trips)
        return turso_serverless.connect(TURSO_URL, auth_token=TURSO_TOKEN or None, isolation_level=None)
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


@contextmanager
def get_conn():
    """Open a short-lived connection. Commits on success, rolls back on error."""
    conn = _connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def fetch_all(conn, sql: str, params=()) -> list[dict]:
    """Run a SELECT and return rows as dictionaries: [{"id": 1, "title": "..."}]."""
    cur = conn.execute(sql, params)
    cols = [d[0] for d in cur.description or ()]
    return [dict(zip(cols, row)) for row in cur.fetchall()]


def fetch_one(conn, sql: str, params=()) -> dict | None:
    rows = fetch_all(conn, sql, params)
    return rows[0] if rows else None


def init_db() -> None:
    if DB_PATH is not None:
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with get_conn() as conn:
        if MODE != "turso":
            # WAL = faster writes and readers never block the writer (local file only)
            conn.execute("PRAGMA journal_mode = WAL")
            conn.execute("PRAGMA synchronous = NORMAL")
        conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
        if fetch_one(conn, "SELECT COUNT(*) AS n FROM projects")["n"] == 0:
            _seed(conn)


def _seed(conn) -> None:
    """Demo data. Dates are relative to today, so 'overdue' and 'today' always look right."""
    today = date.today()

    def day(offset: int) -> str:
        return (today + timedelta(days=offset)).isoformat()

    projects = [
        ("Veb-sayt", "Kompaniya veb-saytining yangi dizayni va sahifalari.", "orange"),
        ("Mobil ilova", "iOS va Android uchun mijozlar ilovasi.", "blue"),
        ("Marketing", "Ijtimoiy tarmoqlar va elektron pochta kampaniyalari.", "green"),
    ]
    ids = []
    for p in projects:
        cur = conn.execute("INSERT INTO projects (name, description, color) VALUES (?, ?, ?)", p)
        ids.append(cur.lastrowid)
    web, mobile, marketing = ids

    tasks = [
        ("Bosh sahifa dizaynini tayyorlash",
         "Asosiy sahifa va mobil versiya maketlarini tayyorlash va jamoa bilan ko'rib chiqish.",
         "todo", "high", day(2), web),
        ("Ro'yxatdan o'tish sahifasi",
         "SMS kod orqali tasdiqlash va parolni tiklash ekranlari.",
         "todo", "high", day(-2), mobile),
        ("Ijtimoiy tarmoq posti",
         "Kuzgi aksiyalar haqida Instagram va Telegram kanallari uchun matnlar.",
         "todo", "low", day(6), marketing),
        ("Foydalanuvchi so'rovnomasi",
         "Mijozlar bilan intervyu natijalarini jamlash va xulosalar chiqarish.",
         "todo", "medium", day(8), web),
        ("API ulash",
         "FastAPI endpointlari bilan frontend integratsiyasini yakunlash.",
         "in_progress", "high", day(0), web),
        ("Push-bildirishnomalarni sozlash",
         "Yangi vazifalar haqida foydalanuvchilarga eslatma yuborish.",
         "in_progress", "medium", day(3), mobile),
        ("Elektron pochta xabarnomasi",
         "Faol foydalanuvchilar uchun haftalik dayjest andozasi.",
         "in_progress", "low", day(5), marketing),
        ("Logotip variantlari",
         "3 ta konsept ishlab chiqildi va jamoa bilan tasdiqlandi.",
         "done", "medium", day(-4), web),
        ("Ilova ikonkasini yaratish",
         "iOS va Android uchun barcha o'lchamlardagi ikonka to'plami.",
         "done", "low", day(-5), mobile),
    ]
    conn.executemany(
        """INSERT INTO tasks (title, description, status, priority, due_date, project_id)
           VALUES (?, ?, ?, ?, ?, ?)""",
        tasks,
    )
