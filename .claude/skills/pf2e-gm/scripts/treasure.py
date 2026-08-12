"""Treasure budgets, hoards and shop inventories drawn from the vault.

The per-level treasure budget is read out of the vault's own "Treasure by
Level" table at runtime rather than being copied into this file. That keeps the
numbers correct for whichever edition the user's vault holds, and means a
vault rebuild is the only thing needed when the table changes.

    treasure.py budget --level 5 --party-size 5
    treasure.py hoard  --level 5 --seed 3
    treasure.py shop   --level 4 --kind alchemical --count 12

`hoard` returns real items at the levels the table calls for, priced, in a
single call — the same batching principle as `encounter.py build`.
"""

from __future__ import annotations

import argparse
import random
import re
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from vault_index import open_vault, parse_frontmatter  # noqa: E402

ITEM_TYPES = ("equipment", "weapon", "armor", "shield")
ORDINAL = re.compile(r"\*\*(\d+)(?:st|nd|rd|th)\*\*\s*:\s*(\d+)")

# Prefer post-Remaster printings when the same item appears twice.
REMASTER_SOURCES = ("Player Core", "GM Core", "Monster Core", "Remaster")

# Sampling uniformly across ~7,800 items surfaces splatbook curiosities far more
# often than the staples a GM expects, because the long tail is most of the
# pool. Tiering the sources fixes that: a hoard should read like treasure, not
# like a tour of every book ever printed.
CORE_SOURCES = (
    "Player Core", "GM Core", "Core Rulebook", "Advanced Player's Guide",
)
SUPPLEMENT_SOURCES = (
    "Treasure Vault", "Secrets of Magic", "Guns & Gears", "Grand Bazaar",
    "Dark Archive", "Rage of Elements", "Battlecry", "Impossible Magic",
)
RARITY_RANK = {"common": 0, "uncommon": 1, "rare": 2, "unique": 3}


def _tier(row) -> int:
    """Lower is more mainstream: 0 core, 1 broad supplement, 2 everything else."""
    src = row["primary_source"] or ""
    if any(s in src for s in CORE_SOURCES):
        return 0
    if any(s in src for s in SUPPLEMENT_SOURCES):
        return 1
    return 2


def _desirability(row) -> tuple[int, int]:
    """Sort key: mainstream source first, then common before rare."""
    return _tier(row), RARITY_RANK.get((row["rarity"] or "common").lower(), 1)


def _money(copper) -> str:
    """Vault prices are stored in copper; render them the way a table reads."""
    try:
        cp = int(str(copper).strip())
    except (TypeError, ValueError):
        return str(copper or "—")
    if cp <= 0:
        return "—"
    gp, rem = divmod(cp, 100)
    sp, cp2 = divmod(rem, 10)
    parts = [f"{gp:,} gp" if gp else "", f"{sp} sp" if sp else "", f"{cp2} cp" if cp2 else ""]
    return ", ".join(p for p in parts if p) or "—"


def _gp(copper) -> float:
    try:
        return int(str(copper).strip()) / 100
    except (TypeError, ValueError):
        return 0.0


# ---------------------------------------------------------------------------
# the table
# ---------------------------------------------------------------------------

def load_table(vault: Path) -> dict[int, dict]:
    """Parse the vault's Treasure by Level table into per-level budgets."""
    candidates = sorted(vault.glob("Rules/Treasure by Level*.md"))
    if not candidates:
        raise SystemExit(
            "Could not find a 'Treasure by Level' note in the vault. "
            "Rebuild the vault, or pass budgets by hand."
        )
    # Prefer the Remaster printing when both are present.
    candidates.sort(key=lambda p: 0 if "GM Core" in p.name else 1)
    text = candidates[0].read_text(encoding="utf-8")

    table: dict[int, dict] = {}
    for line in text.split("\n"):
        if not line.strip().startswith("|"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) < 5 or not cells[0].isdigit():
            continue
        level = int(cells[0])
        table[level] = {
            "total": cells[1],
            "permanent": [(int(a), int(b)) for a, b in ORDINAL.findall(cells[2])],
            "consumable": [(int(a), int(b)) for a, b in ORDINAL.findall(cells[3])],
            "currency": cells[4],
            "per_extra": cells[5] if len(cells) > 5 else "",
        }
    if not table:
        raise SystemExit(f"Found {candidates[0].name} but could not parse its table.")
    return table


def _budget(table: dict, level: int) -> dict:
    if level not in table:
        raise SystemExit(f"level {level} is outside the table ({min(table)}-{max(table)})")
    return table[level]


# ---------------------------------------------------------------------------
# item selection
# ---------------------------------------------------------------------------

def _pick(conn: sqlite3.Connection, level: int, count: int, rng: random.Random,
          consumable: bool | None = None, trait: str | None = None,
          exotic: bool = False) -> list[sqlite3.Row]:
    """Pick `count` distinct items of exactly `level` from the vault."""
    conn.row_factory = sqlite3.Row
    where = [f"n.type IN ({','.join('?' * len(ITEM_TYPES))})", "n.level = ?",
             "n.price IS NOT NULL",
             "(n.rarity IS NULL OR LOWER(n.rarity) NOT IN ('unique'))"]
    params: list = [*ITEM_TYPES, level]

    if consumable is not None:
        clause = ("EXISTS" if consumable else "NOT EXISTS")
        where.append(
            f"{clause} (SELECT 1 FROM tags t WHERE t.note_id = n.id "
            "AND t.field='trait' AND LOWER(t.value)='consumable')"
        )
    if trait:
        where.append(
            "EXISTS (SELECT 1 FROM tags t WHERE t.note_id = n.id "
            "AND t.field='trait' AND LOWER(t.value)=?)"
        )
        params.append(trait.lower())

    rows = conn.execute(
        f"SELECT n.* FROM notes n WHERE {' AND '.join(where)}", params
    ).fetchall()

    # The vault carries both printings of many items; keep one per name,
    # preferring the Remaster entry.
    best: dict[str, sqlite3.Row] = {}
    for r in rows:
        key = (r["title"] or "").lower()
        src = r["primary_source"] or ""
        if key not in best or (any(s in src for s in REMASTER_SOURCES)
                               and not any(s in (best[key]["primary_source"] or "")
                                           for s in REMASTER_SOURCES)):
            best[key] = r
    pool = list(best.values())
    if not pool:
        return []

    if exotic:
        rng.shuffle(pool)
        return pool[:count]

    # Draw from the most mainstream band that can fill the order, widening only
    # when it cannot. Shuffling within a band keeps results varied between runs
    # without letting the long tail dominate.
    bands: dict[tuple[int, int], list] = {}
    for r in pool:
        bands.setdefault(_desirability(r), []).append(r)

    picked: list[sqlite3.Row] = []
    for key in sorted(bands):
        band = bands[key]
        rng.shuffle(band)
        picked.extend(band[: count - len(picked)])
        if len(picked) >= count:
            break
    return picked[:count]


def _print_items(rows: list[sqlite3.Row], level: int, wanted: int) -> float:
    if not rows:
        print(f"  level {level}: (no items found at this level)")
        return 0.0
    spent = 0.0
    for r in rows:
        rarity = f", {r['rarity']}" if r["rarity"] and r["rarity"].lower() != "common" else ""
        print(f"  lvl {level:>2}  {_money(r['price']):>12}  {r['title']}{rarity}  [{r['path']}]")
        spent += _gp(r["price"])
    if len(rows) < wanted:
        print(f"  (wanted {wanted} at level {level}, vault had {len(rows)})")
    return spent


# ---------------------------------------------------------------------------
# commands
# ---------------------------------------------------------------------------

def cmd_budget(args, conn, vault) -> None:
    b = _budget(load_table(vault), args.level)
    extra = max(0, args.party_size - 4)
    print(f"Party treasure for level {args.level} ({args.party_size} characters)")
    print(f"  Total value      {b['total']}")
    print(f"  Permanent items  " + ", ".join(f"lvl {l} x{n}" for l, n in b["permanent"]))
    print(f"  Consumables      " + ", ".join(f"lvl {l} x{n}" for l, n in b["consumable"]))
    print(f"  Currency         {b['currency']}")
    if extra and b["per_extra"]:
        print(f"  + {b['per_extra']} per character beyond four  (x{extra} here)")
    print("\nThis is a level's worth of treasure, not one hoard — spread it across "
          "the whole level.")


def cmd_hoard(args, conn, vault) -> None:
    b = _budget(load_table(vault), args.level)
    rng = random.Random(args.seed)
    share = args.share / 100.0

    print(f"Hoard for a level {args.level} party ({args.party_size} characters)")
    if share < 1.0:
        print(f"Showing {args.share}% of the level's budget — a single hoard, not the whole level.")
    print(f"Level budget: {b['total']} total, {b['currency']} currency\n")

    def scaled(n: int) -> int:
        return max(1, round(n * share)) if share < 1 else n

    spent = 0.0
    print("Permanent items")
    for lvl, n in b["permanent"]:
        want = scaled(n)
        spent += _print_items(_pick(conn, lvl, want, rng, consumable=False,
                                    trait=args.trait, exotic=args.exotic), lvl, want)
    print("\nConsumables")
    for lvl, n in b["consumable"]:
        want = scaled(n)
        spent += _print_items(_pick(conn, lvl, want, rng, consumable=True,
                                    trait=args.trait, exotic=args.exotic), lvl, want)

    cur = re.sub(r"[^\d]", "", b["currency"] or "0")
    cur_val = int(cur or 0) * share
    print(f"\nCurrency  ~{cur_val:,.0f} gp")
    print(f"Items above total ~{spent:,.0f} gp")
    print("\nSwap freely — anything of the same item level keeps the budget intact.")


def cmd_shop(args, conn, vault) -> None:
    """A settlement's stock: items at or below the settlement's level."""
    rng = random.Random(args.seed)
    conn.row_factory = sqlite3.Row
    print(f"Shop stock up to item level {args.level}"
          + (f" ({args.kind})" if args.kind else ""))
    print("Higher-level goods should be special order, not shelf stock.\n")

    per_level = max(1, args.count // max(1, args.level))
    total = 0.0
    for lvl in range(max(0, args.level), max(-1, args.level - 5), -1):
        rows = _pick(conn, lvl, per_level, rng, trait=args.kind, exotic=args.exotic)
        if not rows:
            continue
        total += _print_items(rows, lvl, per_level)
    if total == 0:
        print("Nothing matched. Try dropping --kind, or raising --level.")
    else:
        print(f"\nStock value ~{total:,.0f} gp")


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="treasure.py", description="PF2e treasure budgets, hoards and shops.",
        formatter_class=argparse.RawDescriptionHelpFormatter, epilog=__doc__,
    )
    p.add_argument("--vault")
    p.add_argument("--rebuild", action="store_true")
    p.add_argument("--quiet", action="store_true")
    sub = p.add_subparsers(dest="cmd", required=True)

    b = sub.add_parser("budget", help="the level's treasure allowance")
    b.add_argument("--level", type=int, required=True)
    b.add_argument("--party-size", type=int, default=4)

    h = sub.add_parser("hoard", help="concrete items at the right levels")
    h.add_argument("--level", type=int, required=True)
    h.add_argument("--party-size", type=int, default=4)
    h.add_argument("--share", type=int, default=100,
                   help="percent of the level budget in this hoard (default: 100)")
    h.add_argument("--trait", help="theme the loot, e.g. fire, healing, undead")
    h.add_argument("--seed", type=int)
    h.add_argument("--exotic", action="store_true",
                   help="sample the whole catalogue, including obscure splatbook items")

    s = sub.add_parser("shop", help="settlement stock list")
    s.add_argument("--level", type=int, required=True, help="highest item level stocked")
    s.add_argument("--kind", help="trait filter, e.g. alchemical, consumable, magical")
    s.add_argument("--count", type=int, default=12)
    s.add_argument("--seed", type=int)
    s.add_argument("--exotic", action="store_true",
                   help="sample the whole catalogue, including obscure splatbook items")

    args = p.parse_args(argv)
    vault, conn = open_vault(args)
    {"budget": cmd_budget, "hoard": cmd_hoard, "shop": cmd_shop}[args.cmd](args, conn, vault)
    return 0


if __name__ == "__main__":
    sys.exit(main())
