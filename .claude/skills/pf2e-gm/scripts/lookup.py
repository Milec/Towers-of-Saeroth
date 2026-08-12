"""Query the PF2e vault: full-text search, structured filters, note display.

Output is kept deliberately lean, because every line printed here is context
someone pays for. Result lists are one line per hit, `show` strips wikilink
paths down to their display text and truncates long entries, and `--full`
opts back into the verbose form when it is genuinely wanted. Where several
entries share a name (a remastered spell alongside its pre-remaster version,
say) the source book is printed, since that is usually the only thing
distinguishing them.

Examples
--------
    lookup.py search "flanking rules"
    lookup.py find --type creature --level 3-6 --trait undead
    lookup.py find --type spell --level 3 --trait fire --tradition arcane
    lookup.py show "Spells/Fireball"
    lookup.py stats
"""

from __future__ import annotations

import argparse
import re
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from statline import stat_lines  # noqa: E402
from vault_index import open_vault, parse_frontmatter  # noqa: E402

# FTS5 treats these as operators; queries here are natural language, so quote
# bare terms rather than making the user escape them.
FTS_SPECIAL = re.compile(r'[^\w\s*]')


def _fts_query(text: str) -> str:
    parts = [p for p in FTS_SPECIAL.sub(" ", text).split() if p]
    if not parts:
        raise SystemExit("empty search query")
    return " ".join(f'"{p}"' for p in parts)


def _parse_level(spec: str) -> tuple[int, int]:
    """Accept `5`, `3-6` or `3..6` and return an inclusive range."""
    spec = spec.strip().replace("..", "-")
    m = re.fullmatch(r"(-?\d+)\s*-\s*(-?\d+)", spec)
    if m:
        lo, hi = int(m.group(1)), int(m.group(2))
        return (lo, hi) if lo <= hi else (hi, lo)
    try:
        n = int(spec)
    except ValueError:
        raise SystemExit(f"could not read level {spec!r}; use 5 or 3-6")
    return n, n


WIKILINK = re.compile(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]")


def plain(text: str) -> str:
    """Strip wikilink syntax down to its display text.

    Vault bodies are dense with links like `[[Rules/Conditions/Grabbed|grabbed]]`,
    which cost roughly a dozen tokens to convey one word. Callers reading this
    output want the word, not the path, so collapse them everywhere.
    """
    if not text:
        return ""
    return WIKILINK.sub(lambda m: (m.group(2) or m.group(1).rsplit("/", 1)[-1]), text)


def _fmt_row(row: sqlite3.Row, show_source: bool, full: bool) -> str:
    """One compact line per hit; the path is the handle for a later `show`."""
    meta = []
    if row["level"] is not None:
        meta.append(f"lvl {row['level']}")
    if row["rarity"] and row["rarity"].lower() != "common":
        meta.append(row["rarity"])
    if show_source and row["primary_source"]:
        meta.append(row["primary_source"])
    tail = f"  ({', '.join(meta)})" if meta else ""
    line = f"{row['title'] or row['path']}{tail}  [{row['path']}]"
    if full and row["summary"]:
        line += f"\n    {plain(row['summary'])[:160]}"
    return line


def _print_rows(rows: list[sqlite3.Row], total: int | None = None, full: bool = False) -> None:
    if not rows:
        print("no matches")
        return
    titles = [r["title"] for r in rows]
    show_source = len(titles) != len(set(titles))
    for row in rows:
        print(_fmt_row(row, show_source, full))
    if total is not None and total > len(rows):
        print(f"...{total - len(rows)} more (raise --limit or narrow filters)")


# ---------------------------------------------------------------------------
# commands
# ---------------------------------------------------------------------------

def cmd_search(args, conn: sqlite3.Connection) -> None:
    conn.row_factory = sqlite3.Row
    where = ["search MATCH ?"]
    params: list = [_fts_query(args.query)]
    if args.type:
        where.append("n.type = ?")
        params.append(args.type)
    sql = (
        "SELECT n.* FROM search s JOIN notes n ON n.id = s.rowid "
        f"WHERE {' AND '.join(where)} ORDER BY bm25(search) LIMIT ?"
    )
    params.append(args.limit)
    _print_rows(conn.execute(sql, params).fetchall(), full=args.full)


def cmd_find(args, conn: sqlite3.Connection) -> None:
    conn.row_factory = sqlite3.Row
    where: list[str] = []
    params: list = []

    if args.type:
        where.append("n.type = ?")
        params.append(args.type)
    if args.name:
        where.append("n.title LIKE ?")
        params.append(f"%{args.name}%")
    if args.rarity:
        where.append("LOWER(n.rarity) = ?")
        params.append(args.rarity.lower())
    if args.level:
        lo, hi = _parse_level(args.level)
        where.append("n.level BETWEEN ? AND ?")
        params += [lo, hi]
    if args.source:
        where.append("n.primary_source LIKE ?")
        params.append(f"%{args.source}%")

    # Each list filter needs its own EXISTS so multiple traits AND together
    # rather than fighting over a single join row.
    for field, values in (("trait", args.trait), ("tradition", args.tradition)):
        for value in values or []:
            where.append(
                "EXISTS (SELECT 1 FROM tags t WHERE t.note_id = n.id "
                "AND t.field = ? AND LOWER(t.value) = ?)"
            )
            params += [field, value.lower()]

    if not where:
        raise SystemExit("give at least one filter (see --help)")

    clause = " AND ".join(where)
    total = conn.execute(
        f"SELECT COUNT(*) FROM notes n WHERE {clause}", params
    ).fetchone()[0]
    rows = conn.execute(
        f"SELECT n.* FROM notes n WHERE {clause} "
        "ORDER BY n.level IS NULL, n.level, n.title LIMIT ?",
        params + [args.limit],
    ).fetchall()
    _print_rows(rows, total, full=args.full)


def cmd_show(args, conn: sqlite3.Connection, vault: Path) -> None:
    conn.row_factory = sqlite3.Row
    target = args.note.strip().removesuffix(".md")
    row = conn.execute("SELECT * FROM notes WHERE path = ?", (target,)).fetchone()
    if row is None:
        rows = conn.execute(
            "SELECT * FROM notes WHERE title LIKE ? ORDER BY LENGTH(title) LIMIT 12",
            (f"%{target}%",),
        ).fetchall()
        if not rows:
            print(f"no note matching {args.note!r}")
            return
        if len(rows) > 1:
            print(f"{len(rows)} matches — pick one with `show <path>`:\n")
            _print_rows(rows)
            return
        row = rows[0]

    path = vault / (row["path"] + ".md")
    text = path.read_text(encoding="utf-8")
    if args.raw:
        print(text)
        return
    _, body = parse_frontmatter(text)
    body = plain(body).strip()

    # Drop the trailing source backlink; it repeats the path already printed.
    body = re.sub(r"\n*---\n+Source on Archives of Nethys:.*$", "", body, flags=re.S)

    if not args.full and len(body) > args.max_chars:
        cut = body.rfind("\n", 0, args.max_chars)
        body = body[: cut if cut > 0 else args.max_chars].rstrip()
        body += f"\n\n[truncated — rerun with --full for the complete entry]"
    print(body)


def cmd_brief(args, conn: sqlite3.Connection, vault: Path) -> None:
    """Compact stat lines for any number of notes, in a single call.

    This exists to collapse round-trips: pulling six creatures for an encounter
    was six `show` calls, and each round-trip costs far more than the text it
    returns.
    """
    conn.row_factory = sqlite3.Row
    resolved: list[str] = []
    for raw in args.notes:
        target = raw.strip().removesuffix(".md")
        row = conn.execute("SELECT path FROM notes WHERE path = ?", (target,)).fetchone()
        if row is None:
            row = conn.execute(
                "SELECT path FROM notes WHERE title LIKE ? ORDER BY LENGTH(title) LIMIT 1",
                (f"%{target}%",),
            ).fetchone()
        if row is None:
            print(f"{raw}  [no match]")
            continue
        resolved.append(row["path"])
    if resolved:
        print(stat_lines(vault, resolved))


def cmd_stats(args, conn: sqlite3.Connection, vault: Path) -> None:
    total = conn.execute("SELECT COUNT(*) FROM notes").fetchone()[0]
    print(f"vault: {vault}")
    print(f"notes: {total}\n")
    print("largest categories:")
    for kind, count in conn.execute(
        "SELECT type, COUNT(*) c FROM notes GROUP BY type ORDER BY c DESC LIMIT 15"
    ):
        print(f"  {kind:<22} {count:>6}")


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="lookup.py", description="Query the PF2e Obsidian vault.",
        formatter_class=argparse.RawDescriptionHelpFormatter, epilog=__doc__,
    )
    p.add_argument("--vault", help="vault directory (default: auto-detect / $PF2E_VAULT)")
    p.add_argument("--rebuild", action="store_true", help="force an index rebuild")
    p.add_argument("--quiet", action="store_true", help="suppress index progress output")
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("search", help="full-text search across note bodies")
    s.add_argument("query")
    s.add_argument("--type")
    s.add_argument("--limit", type=int, default=6)
    s.add_argument("--full", action="store_true", help="include summary lines")

    f = sub.add_parser("find", help="structured filter on frontmatter")
    f.add_argument("--type")
    f.add_argument("--name")
    f.add_argument("--level", help="e.g. 5 or 3-6")
    f.add_argument("--rarity")
    f.add_argument("--source")
    f.add_argument("--trait", action="append", help="repeatable; traits AND together")
    f.add_argument("--tradition", action="append")
    f.add_argument("--limit", type=int, default=8)
    f.add_argument("--full", action="store_true", help="include summary lines")

    sh = sub.add_parser("show", help="print one note")
    sh.add_argument("note", help="vault path or title")
    sh.add_argument("--raw", action="store_true", help="include YAML frontmatter")
    sh.add_argument("--full", action="store_true", help="print the entry uncut")
    sh.add_argument("--max-chars", type=int, default=1800,
                    help="truncation budget when not using --full (default: 1800)")

    b = sub.add_parser("brief", help="compact stat lines for one or more notes")
    b.add_argument("notes", nargs="+", help="vault paths or titles")

    sub.add_parser("stats", help="index overview")

    args = p.parse_args(argv)
    vault, conn = open_vault(args)

    if args.cmd == "search":
        cmd_search(args, conn)
    elif args.cmd == "find":
        cmd_find(args, conn)
    elif args.cmd == "show":
        cmd_show(args, conn, vault)
    elif args.cmd == "brief":
        cmd_brief(args, conn, vault)
    else:
        cmd_stats(args, conn, vault)
    return 0


if __name__ == "__main__":
    sys.exit(main())
