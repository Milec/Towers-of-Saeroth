"""Build PF2e encounters to an XP budget, drawing creatures from the vault.

The arithmetic is the standard encounter-building maths: a threat level sets
the party's XP budget, each creature costs XP according to how its level
compares to the party's, and the budget scales with party size away from the
baseline of four characters.

Two modes:

    encounter.py budget --party-level 5 --party-size 5 --threat severe
    encounter.py build  --party-level 5 --threat moderate --trait undead

`budget` just shows the maths and what each creature level costs. `build`
additionally proposes combinations drawn from the vault, so a GM gets concrete
creatures rather than a spreadsheet.
"""

from __future__ import annotations

import argparse
import random
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from statline import stat_lines  # noqa: E402
from vault_index import open_vault  # noqa: E402

# XP budget for a four-character party, and the amount to add or remove per
# character above or below that baseline.
THREATS: dict[str, tuple[int, int]] = {
    "trivial": (40, 10),
    "low": (60, 15),
    "moderate": (80, 20),
    "severe": (120, 30),
    "extreme": (160, 40),
}

# Creature XP cost, keyed by (creature level - party level).
COST: dict[int, int] = {-4: 10, -3: 15, -2: 20, -1: 30, 0: 40, 1: 60, 2: 80, 3: 120, 4: 160}

BASELINE_PARTY = 4


def budget_for(threat: str, party_size: int) -> int:
    key = threat.lower()
    if key not in THREATS:
        raise SystemExit(f"unknown threat {threat!r}; pick from {', '.join(THREATS)}")
    base, per = THREATS[key]
    return base + per * (party_size - BASELINE_PARTY)


def cmd_budget(args, conn) -> None:
    total = budget_for(args.threat, args.party_size)
    print(f"Party: {args.party_size} characters at level {args.party_level}")
    print(f"Threat: {args.threat.lower()}")
    print(f"XP budget: {total}\n")
    print("Creature costs at this party level:")
    for delta in sorted(COST):
        lvl = args.party_level + delta
        fits = total // COST[delta]
        print(
            f"  level {lvl:>3} ({delta:+d})  {COST[delta]:>4} XP"
            f"   — up to {fits} of them"
        )


def _candidates(conn: sqlite3.Connection, level: int, args) -> list[sqlite3.Row]:
    conn.row_factory = sqlite3.Row
    where = ["n.type = 'creature'", "n.level = ?"]
    params: list = [level]
    for trait in args.trait or []:
        where.append(
            "EXISTS (SELECT 1 FROM tags t WHERE t.note_id = n.id "
            "AND t.field = 'trait' AND LOWER(t.value) = ?)"
        )
        params.append(trait.lower())
    if args.rarity:
        where.append("LOWER(n.rarity) = ?")
        params.append(args.rarity.lower())
    else:
        # Unique creatures are usually named NPCs tied to a specific plot;
        # they make poor random filler, so leave them out unless asked for.
        where.append("(n.rarity IS NULL OR LOWER(n.rarity) != 'unique')")
    return conn.execute(
        f"SELECT n.* FROM notes n WHERE {' AND '.join(where)} ORDER BY n.title",
        params,
    ).fetchall()


def _compositions(budget: int) -> list[list[int]]:
    """Enumerate spendable mixes of creature levels as deltas from party level.

    Returned newest-first by group size so callers can offer a boss, a pair,
    and a swarm rather than three variations of the same shape.
    """
    out: list[list[int]] = []

    def walk(remaining: int, start: int, acc: list[int]) -> None:
        if len(acc) > 6:
            return
        if remaining == 0 and acc:
            out.append(list(acc))
            return
        for delta in range(start, -5, -1):
            cost = COST[delta]
            if cost <= remaining:
                acc.append(delta)
                walk(remaining - cost, delta, acc)
                acc.pop()

    walk(budget, 4, [])
    return out


def cmd_build(args, conn, vault) -> None:
    total = budget_for(args.threat, args.party_size)
    print(f"Party: {args.party_size} characters at level {args.party_level}")
    print(f"Threat: {args.threat.lower()}  |  XP budget: {total}")
    if args.trait:
        print(f"Filtering creatures by trait: {', '.join(args.trait)}")
    print()

    combos = _compositions(total)
    if not combos:
        print("No combination fits that budget.")
        return

    # Prefer variety: one option per distinct group size, smallest first.
    by_size: dict[int, list[list[int]]] = {}
    for combo in combos:
        by_size.setdefault(len(combo), []).append(combo)

    rng = random.Random(args.seed)
    shown = 0
    for size in sorted(by_size):
        if shown >= args.options:
            break
        combo = rng.choice(by_size[size])
        levels = [args.party_level + d for d in combo]
        if any(lv < -1 for lv in levels):
            continue

        picks: list[str] = []
        chosen: list[str] = []
        ok = True
        for delta in combo:
            level = args.party_level + delta
            pool = _candidates(conn, level, args)
            if not pool:
                ok = False
                break
            row = rng.choice(pool)
            chosen.append(row["path"])
            picks.append(
                f"    level {level:>2} ({delta:+d}, {COST[delta]} XP)  "
                f"{row['title']}  [{row['path']}]"
            )
        if not ok:
            continue

        shown += 1
        spent = sum(COST[d] for d in combo)
        print(f"Option {shown}: {len(combo)} creature(s), {spent} XP")
        print("\n".join(picks))
        # Stat lines are printed inline by default so the caller can judge and
        # write the encounter without a follow-up lookup per creature; each of
        # those round-trips costs far more than the few lines printed here.
        if not args.no_stats:
            print()
            print(stat_lines(vault, list(dict.fromkeys(chosen))))
        print()

    if shown == 0:
        print(
            "No vault creatures matched those filters at the required levels.\n"
            "Try dropping --trait, or use `budget` to see the level spread and "
            "pick creatures by hand."
        )
    else:
        print(
            "Adjust freely: swapping a creature for another of the same level "
            "keeps the budget intact."
        )


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="encounter.py", description="PF2e encounter budgeting and building.",
        formatter_class=argparse.RawDescriptionHelpFormatter, epilog=__doc__,
    )
    p.add_argument("--vault")
    p.add_argument("--rebuild", action="store_true")
    p.add_argument("--quiet", action="store_true")
    sub = p.add_subparsers(dest="cmd", required=True)

    for name, help_text in (("budget", "show the XP maths"), ("build", "propose creatures")):
        s = sub.add_parser(name, help=help_text)
        s.add_argument("--party-level", type=int, required=True)
        s.add_argument("--party-size", type=int, default=BASELINE_PARTY)
        s.add_argument("--threat", default="moderate",
                       help=", ".join(THREATS) + " (default: moderate)")
        if name == "build":
            s.add_argument("--trait", action="append", help="repeatable; traits AND together")
            s.add_argument("--rarity")
            s.add_argument("--options", type=int, default=3)
            s.add_argument("--seed", type=int, help="fix the random picks for reproducibility")
            s.add_argument("--no-stats", action="store_true",
                           help="omit inline stat lines (they are shown by default)")

    args = p.parse_args(argv)
    vault, conn = open_vault(args)
    if args.cmd == "budget":
        cmd_budget(args, conn)
    else:
        cmd_build(args, conn, vault)
    return 0


if __name__ == "__main__":
    sys.exit(main())
