"""Locate the PF2e vault and maintain a fast SQLite index over it.

The vault holds ~41,600 notes; scanning them on every query is far too slow to
feel interactive, so the first run builds a SQLite index of the YAML
frontmatter plus a full-text table over the bodies. Later runs reuse it and
only rebuild when the vault has changed.

Standard library only, deliberately: the vault ships with no dependencies and
these scripts should run anywhere Python 3.9+ does.
"""

from __future__ import annotations

import os
import re
import sqlite3
import sys
from pathlib import Path

SCHEMA_VERSION = 2

# Frontmatter fields worth querying directly. Everything else stays available
# in the note body, which is what `lookup.py --show` prints.
SCALARS = (
    "title", "type", "level", "rarity", "aon_url", "price", "bulk",
    "actions", "spell_type", "school", "size", "ac", "hp", "perception",
    "primary_source", "pfs", "range", "duration", "area_type", "saving_throw",
)
LISTS = ("trait", "tradition", "source", "skill", "domain", "deity", "component")


# ---------------------------------------------------------------------------
# locating the vault
# ---------------------------------------------------------------------------

def find_vault(explicit: str | None = None) -> Path:
    """Resolve the vault directory.

    Order: an explicit --vault argument, then $PF2E_VAULT, then a `vault/`
    directory beside this checkout, then the current tree. Raising early with
    the list of places tried is friendlier than failing later on empty results.
    """
    candidates: list[Path] = []
    if explicit:
        candidates.append(Path(explicit).expanduser())
    if os.environ.get("PF2E_VAULT"):
        candidates.append(Path(os.environ["PF2E_VAULT"]).expanduser())

    here = Path(__file__).resolve()
    for parent in here.parents:
        candidates.append(parent / "vault")
    candidates.append(Path.cwd() / "vault")
    candidates.append(Path.home() / "AON-Scrap" / "vault")

    for cand in candidates:
        if cand.is_dir() and (cand / "Home.md").exists():
            return cand
    for cand in candidates:
        if cand.is_dir():
            return cand

    tried = "\n  ".join(str(c) for c in dict.fromkeys(candidates))
    raise SystemExit(
        "Could not find the PF2e vault. Clone the AON-Scrap repository and "
        "either pass --vault PATH or set PF2E_VAULT.\nTried:\n  " + tried
    )


# ---------------------------------------------------------------------------
# frontmatter
# ---------------------------------------------------------------------------

_SCALAR_RE = re.compile(r'^([A-Za-z_][\w-]*):\s*(.*)$')
_ITEM_RE = re.compile(r"^\s*-\s+(.*)$")


def _unquote(value: str) -> str:
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
        value = value[1:-1]
        value = value.replace('\\"', '"').replace("\\\\", "\\")
    return value.strip()


def parse_frontmatter(text: str) -> tuple[dict, str]:
    """Split a note into (frontmatter dict, body).

    Only the subset of YAML the vault actually emits is supported — scalars and
    simple string lists — which keeps this dependency-free and fast.
    """
    if not text.startswith("---"):
        return {}, text
    end = text.find("\n---", 3)
    if end == -1:
        return {}, text
    head = text[3:end]
    body = text[end + 4:].lstrip("\n")

    data: dict = {}
    key: str | None = None
    for line in head.split("\n"):
        if not line.strip():
            continue
        item = _ITEM_RE.match(line)
        if item and key:
            data.setdefault(key, [])
            if isinstance(data[key], list):
                data[key].append(_unquote(item.group(1)))
            continue
        m = _SCALAR_RE.match(line)
        if not m:
            continue
        key, raw = m.group(1), m.group(2).strip()
        if raw == "":
            data[key] = []
        else:
            data[key] = _unquote(raw)
    return data, body


def _as_int(value) -> int | None:
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return None


# ---------------------------------------------------------------------------
# index
# ---------------------------------------------------------------------------

def index_path(vault: Path) -> Path:
    return vault.parent / ".pf2e-index.sqlite3"


def _vault_signature(vault: Path) -> tuple[int, int]:
    """Cheap change detector: note count and newest mtime."""
    count = 0
    newest = 0.0
    for path in vault.rglob("*.md"):
        count += 1
        mtime = path.stat().st_mtime
        if mtime > newest:
            newest = mtime
    return count, int(newest)


def build(vault: Path, db_path: Path, verbose: bool = True) -> sqlite3.Connection:
    if db_path.exists():
        db_path.unlink()
    conn = sqlite3.connect(db_path)
    conn.executescript(
        """
        PRAGMA journal_mode=OFF;
        PRAGMA synchronous=OFF;
        CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
        CREATE TABLE notes (
            id INTEGER PRIMARY KEY,
            path TEXT UNIQUE, title TEXT, type TEXT, level INTEGER,
            rarity TEXT, aon_url TEXT, price TEXT, bulk TEXT, actions TEXT,
            spell_type TEXT, school TEXT, size TEXT, ac INTEGER, hp INTEGER,
            perception INTEGER, primary_source TEXT, pfs TEXT, range TEXT,
            duration TEXT, area_type TEXT, saving_throw TEXT, summary TEXT
        );
        CREATE TABLE tags (note_id INTEGER, field TEXT, value TEXT);
        CREATE INDEX idx_notes_type ON notes(type);
        CREATE INDEX idx_notes_level ON notes(level);
        CREATE INDEX idx_notes_title ON notes(title COLLATE NOCASE);
        CREATE INDEX idx_tags ON tags(field, value COLLATE NOCASE);
        CREATE VIRTUAL TABLE search USING fts5(
            title, body, content='', tokenize='porter unicode61'
        );
        """
    )

    rows = 0
    for path in sorted(vault.rglob("*.md")):
        rel = path.relative_to(vault).with_suffix("").as_posix()
        if rel.startswith("_Index/") or rel in ("Home", "LICENSE-AND-ATTRIBUTION"):
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except OSError:
            continue
        fm, body = parse_frontmatter(text)
        if not fm:
            continue

        # First substantial prose line doubles as a preview in result lists.
        # Skip headings, stat lines and link rows (a spell's tradition list is
        # otherwise the first thing matched, which tells a reader nothing).
        summary = ""
        for line in body.split("\n"):
            s = line.strip()
            if not s or s.startswith(("#", "**", ">", "|", "-", "*", "---", "[[")):
                continue
            if s.startswith("Source on Archives of Nethys"):
                continue  # the backlink footer, not a description
            prose = re.sub(r"\[\[[^\]]*\]\]", "", s)
            if len(prose.strip()) < 25:
                continue
            summary = s[:300]
            break

        values = [rel]
        for field in SCALARS:
            raw = fm.get(field)
            if isinstance(raw, list):
                raw = ", ".join(raw)
            if field in ("level", "ac", "hp", "perception"):
                values.append(_as_int(raw))
            else:
                values.append(raw)
        values.append(summary)

        cur = conn.execute(
            "INSERT INTO notes (path, %s, summary) VALUES (%s)"
            % (", ".join(SCALARS), ",".join("?" * (len(SCALARS) + 2))),
            values,
        )
        note_id = cur.lastrowid
        pairs = []
        for field in LISTS:
            raw = fm.get(field)
            if not raw:
                continue
            items = raw if isinstance(raw, list) else [raw]
            pairs += [(note_id, field, str(v)) for v in items if str(v).strip()]
        if pairs:
            conn.executemany("INSERT INTO tags VALUES (?,?,?)", pairs)

        conn.execute(
            "INSERT INTO search (rowid, title, body) VALUES (?,?,?)",
            (note_id, fm.get("title") or rel, body),
        )
        rows += 1
        if verbose and rows % 10000 == 0:
            print(f"  indexed {rows} notes", file=sys.stderr)

    count, newest = _vault_signature(vault)
    conn.executemany(
        "INSERT INTO meta VALUES (?,?)",
        [
            ("schema", str(SCHEMA_VERSION)),
            ("note_count", str(count)),
            ("newest_mtime", str(newest)),
            ("vault", str(vault)),
        ],
    )
    conn.commit()
    if verbose:
        print(f"indexed {rows} notes -> {db_path}", file=sys.stderr)
    return conn


def connect(vault: Path, rebuild: bool = False, verbose: bool = True) -> sqlite3.Connection:
    """Open the index, rebuilding when missing, stale or from an old schema."""
    db_path = index_path(vault)
    if rebuild or not db_path.exists():
        return build(vault, db_path, verbose)

    try:
        conn = sqlite3.connect(db_path)
        meta = dict(conn.execute("SELECT key, value FROM meta").fetchall())
        if meta.get("schema") != str(SCHEMA_VERSION):
            raise ValueError("schema changed")
        count, newest = _vault_signature(vault)
        if meta.get("note_count") != str(count) or meta.get("newest_mtime") != str(newest):
            conn.close()
            if verbose:
                print("vault changed; rebuilding index", file=sys.stderr)
            return build(vault, db_path, verbose)
        return conn
    except (sqlite3.DatabaseError, ValueError):
        return build(vault, db_path, verbose)


def open_vault(args) -> tuple[Path, sqlite3.Connection]:
    vault = find_vault(getattr(args, "vault", None))
    conn = connect(vault, rebuild=getattr(args, "rebuild", False),
                   verbose=not getattr(args, "quiet", False))
    return vault, conn


if __name__ == "__main__":
    import argparse

    p = argparse.ArgumentParser(description="Build the PF2e vault index.")
    p.add_argument("--vault")
    p.add_argument("--rebuild", action="store_true")
    p.add_argument("--quiet", action="store_true")
    a = p.parse_args()
    v, c = open_vault(a)
    total = c.execute("SELECT COUNT(*) FROM notes").fetchone()[0]
    print(f"vault: {v}\nindexed notes: {total}")
