"""Produce NPCs, either by reskinning a published stat block or building one.

Two routes, because neither covers everything:

`make` searches the vault's several thousand stat blocks for one at the right
level and prints its statistics. Reskinning a published block is the safer
default — the numbers are already correct, and changing the name, appearance
and ability flavour costs nothing mechanically.

`build` is for when nothing published fits: it reads PF2e's creature-building
tables out of the vault and reports the target number for each statistic at a
given level and tier. The tables are parsed at runtime rather than copied in
here, so they track whichever edition the vault holds.

Both stop at the mechanics. Naming an NPC and giving it something to want is
writing, and a writer does that better than a random table would.

    npc.py make  --level 4 --role guard
    npc.py build --level 5 --role brute
    npc.py build --level 8 --role caster --saves extreme
    npc.py roles
"""

from __future__ import annotations

import argparse
import random
import re
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from statline import stat_lines  # noqa: E402
from vault_index import open_vault  # noqa: E402

# NPC Core is purpose-built for exactly this, so prefer it, then the other
# humanoid-heavy books, before falling back to the wider bestiary.
PREFERRED_SOURCES = ("NPC Core", "Gamemastery Guide", "GM Core")

# Rough role keywords -> title/ability matches. Deliberately loose: these are
# search hints, not a taxonomy, and a GM asking for a "thug" will accept a
# bandit.
ROLES: dict[str, tuple[str, ...]] = {
    "guard": ("guard", "sentry", "watch", "soldier", "warden"),
    "thug": ("bandit", "thug", "brigand", "ruffian", "cutthroat"),
    "leader": ("captain", "boss", "commander", "chief", "lord", "queen", "king"),
    "priest": ("priest", "acolyte", "cleric", "prophet", "oracle"),
    "caster": ("wizard", "sorcerer", "witch", "mage", "adept", "occultist"),
    "scout": ("scout", "hunter", "tracker", "ranger", "poacher"),
    "merchant": ("merchant", "trader", "shopkeep", "peddler", "smuggler"),
    "commoner": ("commoner", "farmer", "labor", "servant", "beggar", "porter"),
    "noble": ("noble", "aristocrat", "courtier", "diplomat", "envoy"),
    "criminal": ("assassin", "thief", "burglar", "spy", "fence", "poisoner"),
    "sailor": ("sailor", "pirate", "captain", "navigator", "corsair"),
    "healer": ("healer", "surgeon", "medic", "apothecary"),
}


def _candidates(conn: sqlite3.Connection, level: int, role: str | None,
                humanoid_only: bool) -> list[sqlite3.Row]:
    conn.row_factory = sqlite3.Row
    where = ["n.type = 'creature'", "n.level = ?",
             "(n.rarity IS NULL OR LOWER(n.rarity) != 'unique')"]
    params: list = [level]

    if humanoid_only:
        where.append(
            "EXISTS (SELECT 1 FROM tags t WHERE t.note_id = n.id "
            "AND t.field='trait' AND LOWER(t.value) IN "
            "('humanoid','human','dwarf','elf','gnome','goblin','halfling','orc'))"
        )
    if role:
        keys = ROLES.get(role.lower(), (role.lower(),))
        where.append("(" + " OR ".join("LOWER(n.title) LIKE ?" for _ in keys) + ")")
        params += [f"%{k}%" for k in keys]

    rows = conn.execute(
        f"SELECT n.* FROM notes n WHERE {' AND '.join(where)}", params
    ).fetchall()

    # De-duplicate reprints, preferring the NPC-focused books.
    best: dict[str, sqlite3.Row] = {}
    for r in rows:
        key = (r["title"] or "").lower()
        src = r["primary_source"] or ""
        cur = best.get(key)
        if cur is None or (any(s in src for s in PREFERRED_SOURCES)
                           and not any(s in (cur["primary_source"] or "")
                                       for s in PREFERRED_SOURCES)):
            best[key] = r

    ranked = sorted(
        best.values(),
        key=lambda r: 0 if any(s in (r["primary_source"] or "") for s in PREFERRED_SOURCES) else 1,
    )
    return ranked


def cmd_make(args, conn, vault) -> None:
    rows = _candidates(conn, args.level, args.role, not args.any_type)
    matched_role = args.role if rows else None
    if not rows and args.role:
        # Fall back to any creature at the level, but do not go on claiming the
        # results match the requested role — a caller relaying that verbatim
        # would hand the GM a professor labelled as a merchant.
        print(f"No level {args.level} stat block matches role {args.role!r}. "
              f"Showing unfiltered candidates at that level instead — pick one "
              f"whose numbers suit a {args.role} and reskin it.\n")
        rows = _candidates(conn, args.level, None, not args.any_type)
    if not rows:
        print(f"No level {args.level} creatures found. Try --any-type, or a "
              "neighbouring level — an NPC one level off is usually fine.")
        return

    rng = random.Random(args.seed)
    head, tail = rows[: args.count * 3], rows[args.count * 3:]
    rng.shuffle(head)
    picks = (head + tail)[: args.count]

    print(f"{len(picks)} stat block(s) at level {args.level}"
          + (f" for role '{matched_role}'" if matched_role else "")
          + " — reskin freely:\n")
    print(stat_lines(vault, [r["path"] for r in picks]))
    print(
        "\nSafe to change: name, appearance, ancestry, traits, the flavour of "
        "abilities.\nLeave alone: AC, HP, saves, attack bonuses, damage and DCs — "
        "those are what keep the encounter maths honest.\n"
        "Give each one a want and something they will not do; that is what makes "
        "them memorable, not their statistics."
    )


# ---------------------------------------------------------------------------
# building from the creature-building tables
# ---------------------------------------------------------------------------

# Each statistic lives in its own vault note. Globs rather than exact names,
# because the Remaster and legacy printings sit side by side and either will do.
STAT_TABLES: dict[str, tuple[str, ...]] = {
    "Perception": ("Perception (GM Core)*", "Perception (Gamemastery*"),
    "AC": ("Armor Class (GM Core)*", "Armor Class (AC)*"),
    "HP": ("Hit Points*",),
    "Saves": ("Saving Throws (GM Core)*", "Saving Throws*"),
    "Skills": ("Skills (GM Core)*",),
    "Ability mods": ("Ability Modifiers (Gamemastery*", "Ability Modifiers (GM*"),
    "Strike attack": ("Strike Attack Bonus*",),
    "Strike damage": ("Strike Damage*",),
    "Spell DC/attack": ("Spell DC and Spell Attack Roll*", "Spell DC and Spell Attack Modifier*"),
}

# Role presets: which tier each statistic should sit at. These are the shapes
# the creature-building guidance describes — a brute hits hard and thinks
# poorly, a sniper is accurate but fragile — expressed as tier choices.
ROLE_PRESETS: dict[str, dict[str, str]] = {
    "brute":      {"AC": "Low", "HP": "High", "Perception": "Moderate",
                   "Saves": "High", "Strike attack": "High", "Strike damage": "High"},
    "soldier":    {"AC": "High", "HP": "Moderate", "Perception": "Moderate",
                   "Saves": "Moderate", "Strike attack": "High", "Strike damage": "Moderate"},
    "skirmisher": {"AC": "High", "HP": "Low", "Perception": "High",
                   "Saves": "Moderate", "Strike attack": "Moderate", "Strike damage": "Moderate"},
    "sniper":     {"AC": "Moderate", "HP": "Low", "Perception": "High",
                   "Saves": "Low", "Strike attack": "High", "Strike damage": "Moderate"},
    "caster":     {"AC": "Moderate", "HP": "Low", "Perception": "Moderate",
                   "Saves": "Low", "Strike attack": "Low", "Strike damage": "Low"},
    "leader":     {"AC": "High", "HP": "Moderate", "Perception": "High",
                   "Saves": "High", "Strike attack": "Moderate", "Strike damage": "Moderate"},
    "social":     {"AC": "Low", "HP": "Low", "Perception": "Moderate",
                   "Saves": "Low", "Strike attack": "Low", "Strike damage": "Low"},
}


def _parse_tier_table(path: Path) -> tuple[list[str], dict[int, list[str]]]:
    """Read a by-level building table into (column names, {level: cells})."""
    cols: list[str] = []
    rows: dict[int, list[str]] = {}
    for line in path.read_text(encoding="utf-8").split("\n"):
        if not line.strip().startswith("|"):
            continue
        cells = [c.strip().replace("**", "") for c in line.strip().strip("|").split("|")]
        if not cols:
            cols = cells
            continue
        if set("".join(cells)) <= set("- "):
            continue
        try:
            level = int(cells[0].replace("—", "-").strip())
        except ValueError:
            continue
        rows[level] = cells
    return cols, rows


def _load_stat_tables(vault: Path) -> dict[str, tuple[list[str], dict[int, list[str]]]]:
    out: dict[str, tuple[list[str], dict[int, list[str]]]] = {}
    rules = vault / "Rules"
    for stat, patterns in STAT_TABLES.items():
        for pat in patterns:
            hits = sorted(rules.glob(pat))
            hits = [h for h in hits if _parse_tier_table(h)[1]]
            if hits:
                out[stat] = _parse_tier_table(hits[0])
                break
    return out


def _ascending(cell: str) -> str:
    """The HP table prints its ranges high-to-low; show them the usual way."""
    m = re.fullmatch(r"\s*(\d+)\s*[–-]\s*(\d+)\s*", cell or "")
    if not m:
        return cell
    a, b = int(m.group(1)), int(m.group(2))
    return f"{min(a, b)}–{max(a, b)}"


def _lookup(table, level: int, tier: str) -> str:
    cols, rows = table
    if level not in rows:
        return "—"
    cells = [_ascending(c) for c in rows[level]]
    # Match the tier column case-insensitively; fall back to the middle column.
    for i, c in enumerate(cols):
        if c.lower().startswith(tier.lower()) and i < len(cells):
            return cells[i]
    mid = min(len(cells) - 1, max(1, len(cells) // 2))
    return cells[mid]


def cmd_build(args, conn, vault) -> None:
    tables = _load_stat_tables(vault)
    if not tables:
        raise SystemExit(
            "Could not find the creature-building tables in the vault "
            "(expected notes like 'Armor Class (GM Core)' under Rules/)."
        )

    preset = dict(ROLE_PRESETS.get((args.role or "").lower(), ROLE_PRESETS["soldier"]))
    for stat, flag in (("AC", args.ac), ("HP", args.hp), ("Perception", args.perception),
                       ("Saves", args.saves), ("Strike attack", args.attack),
                       ("Strike damage", args.damage)):
        if flag:
            preset[stat] = flag.capitalize()

    lvl = args.level
    print(f"Custom NPC — level {lvl}, built as a '{args.role or 'soldier'}'\n")
    print("Statistic        Tier        Value")
    print("-" * 48)
    order = ["Perception", "AC", "HP", "Saves", "Strike attack", "Strike damage",
             "Skills", "Ability mods", "Spell DC/attack"]
    for stat in order:
        if stat not in tables:
            continue
        tier = preset.get(stat, "Moderate")
        val = _lookup(tables[stat], lvl, tier)
        print(f"{stat:<16} {tier:<11} {val}")

    missing = [s for s in STAT_TABLES if s not in tables]
    if missing:
        print(f"\n(Not found in this vault: {', '.join(missing)})")

    print(
        "\nHow to use this:\n"
        "  Saves, skills and ability modifiers each take a tier per entry, not one\n"
        "  tier across the board. Give the NPC one clearly weak save — it is what\n"
        "  rewards players for probing — and pick two or three skills it is good at\n"
        "  rather than filling every line.\n"
        "  Three interesting abilities beat eight; complexity spent on something\n"
        "  that dies in two rounds is wasted.\n"
        f"\nCross-check against a published block of the same level:\n"
        f"  python3 scripts/npc.py make --level {lvl}"
        + (f" --role {args.role}" if args.role else "")
    )


def cmd_roles(args, conn, vault) -> None:
    print("Build presets (npc.py build --role ...):\n")
    for name, tiers in sorted(ROLE_PRESETS.items()):
        print(f"  {name:<11} " + ", ".join(f"{k} {v}" for k, v in tiers.items()))
    print("\nSearch keywords (npc.py make --role ...) — loose title matches:\n")
    for name, keys in sorted(ROLES.items()):
        print(f"  {name:<10} {', '.join(keys)}")


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="npc.py", description="Find PF2e NPC stat blocks to reskin.",
        formatter_class=argparse.RawDescriptionHelpFormatter, epilog=__doc__,
    )
    p.add_argument("--vault")
    p.add_argument("--rebuild", action="store_true")
    p.add_argument("--quiet", action="store_true")
    sub = p.add_subparsers(dest="cmd", required=True)

    m = sub.add_parser("make", help="candidate stat blocks at a level")
    m.add_argument("--level", type=int, required=True)
    m.add_argument("--role", help="e.g. guard, priest, merchant (see `roles`)")
    m.add_argument("--count", type=int, default=3)
    m.add_argument("--any-type", action="store_true",
                   help="do not restrict to humanoids")
    m.add_argument("--seed", type=int)

    bd = sub.add_parser("build", help="stat scaffold from the creature-building tables")
    bd.add_argument("--level", type=int, required=True)
    bd.add_argument("--role", help=", ".join(ROLE_PRESETS))
    for f in ("ac", "hp", "perception", "saves", "attack", "damage"):
        bd.add_argument(f"--{f}", help="extreme | high | moderate | low | terrible")

    sub.add_parser("roles", help="list role keywords and build presets")

    args = p.parse_args(argv)
    vault, conn = open_vault(args)
    {"make": cmd_make, "build": cmd_build, "roles": cmd_roles}[args.cmd](args, conn, vault)
    return 0


if __name__ == "__main__":
    sys.exit(main())
