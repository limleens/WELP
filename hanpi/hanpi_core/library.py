"""Offline starred vocabulary library backed by a local SQLite file.

No cloud sync or login. An override path is available for tests and backups.
"""
from __future__ import annotations

import os
import sqlite3
from dataclasses import dataclass
from pathlib import Path

from hanpi_core.text import MAX_HANZI, clean_hanzi, get_syllables

DB_PATH = Path(__file__).resolve().parents[1] / "data" / "hanpi_library.sqlite3"


@dataclass(frozen=True)
class SavedEntry:
    id: int
    kind: str
    hanzi: str
    written_pinyin: str
    spoken_pinyin: str
    meaning: str
    practice_count: int
    created_at: str
    last_practiced: str | None


def _db(path: str | Path | None = None) -> sqlite3.Connection:
    name = str(path or os.getenv("HANPI_LIBRARY_PATH") or DB_PATH)
    if name != ":memory:":
        Path(name).expanduser().parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(name, timeout=8)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout=8000")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS starred (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            kind TEXT NOT NULL CHECK (kind IN ('word', 'sentence')),
            hanzi TEXT NOT NULL,
            written_pinyin TEXT NOT NULL,
            spoken_pinyin TEXT NOT NULL,
            meaning TEXT NOT NULL,
            practice_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            last_practiced TEXT,
            UNIQUE(kind, hanzi)
        )
    """)
    conn.commit()
    return conn


def _entry(row: sqlite3.Row | None) -> SavedEntry | None:
    return SavedEntry(**dict(row)) if row else None


def save_entry(kind: str, hanzi: str, meaning: str, *, db_path: str | Path | None = None) -> SavedEntry:
    """Create/update a starred item; re-starring it never loses practice history."""
    if kind not in {"word", "sentence"}:
        raise ValueError("Save either a word or a sentence.")
    raw = (hanzi or "").strip()
    clean = clean_hanzi(raw, max_hanzi=MAX_HANZI + 1)
    if not clean or clean != raw or len(clean) > MAX_HANZI:
        raise ValueError(f"Choose 1–{MAX_HANZI} Chinese characters (without punctuation).")
    meaning = (meaning or "").strip()
    if not meaning:
        raise ValueError("Add an English meaning before starring this item.")
    if len(meaning) > 240:
        raise ValueError("Keep the English meaning under 240 characters.")
    syllables = get_syllables(clean)
    written = " ".join(s.written_pinyin for s in syllables)
    spoken = " ".join(s.spoken_pinyin for s in syllables)
    with _db(db_path) as db:
        db.execute("""
            INSERT INTO starred (kind, hanzi, written_pinyin, spoken_pinyin, meaning)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(kind, hanzi) DO UPDATE SET
                written_pinyin=excluded.written_pinyin,
                spoken_pinyin=excluded.spoken_pinyin,
                meaning=excluded.meaning
        """, (kind, clean, written, spoken, meaning))
        row = db.execute("SELECT * FROM starred WHERE kind=? AND hanzi=?", (kind, clean)).fetchone()
        db.commit()
        result = _entry(row)
        assert result is not None
        return result


def list_entries(*, db_path: str | Path | None = None) -> list[SavedEntry]:
    with _db(db_path) as db:
        rows = db.execute("SELECT * FROM starred ORDER BY created_at DESC, id DESC").fetchall()
    return [e for row in rows if (e := _entry(row)) is not None]


def get_entry(entry_id: int | str | None, *, db_path: str | Path | None = None) -> SavedEntry | None:
    if not entry_id or not str(entry_id).isdigit():
        return None
    with _db(db_path) as db:
        return _entry(db.execute("SELECT * FROM starred WHERE id=?", (int(entry_id),)).fetchone())


def delete_entry(entry_id: int | str | None, *, db_path: str | Path | None = None) -> bool:
    if not entry_id or not str(entry_id).isdigit():
        return False
    with _db(db_path) as db:
        result = db.execute("DELETE FROM starred WHERE id=?", (int(entry_id),))
        db.commit()
        return result.rowcount > 0


def mark_practiced(entry_id: int | str | None, *, db_path: str | Path | None = None) -> None:
    if not entry_id or not str(entry_id).isdigit():
        return
    with _db(db_path) as db:
        db.execute("""
            UPDATE starred SET practice_count=practice_count+1,
            last_practiced=CURRENT_TIMESTAMP WHERE id=?
        """, (int(entry_id),))
        db.commit()
