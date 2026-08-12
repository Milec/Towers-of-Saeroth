"""Compact stat lines built from note frontmatter.

Reading a full creature entry costs roughly 460 tokens even truncated, and an
encounter needs several of them. Almost all of that is prose the caller does
not need in order to run the fight: what it actually needs is defences,
offences and the names of the interesting abilities.

Measured against this vault, a full `show` runs ~460 tokens and a stat line
~110, so pulling six creatures costs about 660 tokens instead of 2,760 — and,
more importantly, it happens in one tool call instead of six. Round-trips are
the dominant cost (~1,500 tokens each), so collapsing them matters more than
the per-call saving.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from vault_index import parse_frontmatter  # noqa: E402

ABILITIES = (
    ("strength", "Str"), ("dexterity", "Dex"), ("constitution", "Con"),
    ("intelligence", "Int"), ("wisdom", "Wis"), ("charisma", "Cha"),
)


def _one(fm: dict, key: str) -> str:
    v = fm.get(key)
    if isinstance(v, list):
        v = ", ".join(str(x) for x in v if str(x).strip())
    return str(v).strip() if v not in (None, "", []) else ""


def _many(fm: dict, key: str, cap: int = 8) -> str:
    v = fm.get(key)
    if not v:
        return ""
    items = v if isinstance(v, list) else [v]
    items = [str(x).strip() for x in items if str(x).strip()]
    if not items:
        return ""
    shown = items[:cap]
    out = ", ".join(shown)
    if len(items) > cap:
        out += f" (+{len(items) - cap} more)"
    return out


def _defense(fm: dict, key: str) -> str:
    """Immunities/resistances/weaknesses, minus the archive's expansion noise.

    A blanket "all 5" resistance is stored expanded across every damage type,
    which burns a lot of tokens saying one thing. Collapse back to the blanket
    value and keep only the entries that genuinely differ from it.
    """
    v = fm.get(key)
    if not v:
        return ""
    items = [str(x).strip() for x in (v if isinstance(v, list) else [v]) if str(x).strip()]
    if not items:
        return ""

    blanket = next((i for i in items if i.lower().startswith("all ")), None)
    if blanket:
        amount = blanket.split()[-1]
        items = [blanket] + [
            i for i in items
            if i is not blanket and not i.lower().startswith("all ")
            and i.split()[-1] != amount
        ]

    shown = items[:8]
    out = ", ".join(shown)
    if len(items) > 8:
        out += f" (+{len(items) - 8} more)"
    return out


def _signed(fm: dict, key: str) -> str:
    v = fm.get(key)
    try:
        return f"{int(str(v)):+d}"
    except (TypeError, ValueError):
        return ""


def stat_line(vault: Path, note_path: str) -> str:
    """Render one note as a few dense lines. Falls back gracefully."""
    path = vault / (note_path + ".md")
    try:
        fm, _ = parse_frontmatter(path.read_text(encoding="utf-8"))
    except OSError:
        return f"{note_path}  [missing]"
    if not fm:
        return f"{note_path}  [no frontmatter]"

    title = _one(fm, "title") or note_path.rsplit("/", 1)[-1]
    head = title
    if _one(fm, "level"):
        head += f"  lvl {_one(fm, 'level')}"
    rarity = _one(fm, "rarity")
    if rarity and rarity.lower() != "common":
        head += f"  {rarity}"
    head += f"  [{note_path}]"
    out = [head]

    traits = _many(fm, "trait", cap=10)
    if traits:
        out.append(f"  {traits}")

    # Defences on one line: AC, HP, hardness, the three saves.
    d = []
    for key, label in (("ac", "AC"), ("hp", "HP"), ("hardness", "Hardness")):
        if _one(fm, key):
            d.append(f"{label} {_one(fm, key)}")
    saves = [(k, l) for k, l in (("fortitude_save", "Fort"),
                                 ("reflex_save", "Ref"), ("will_save", "Will"))]
    sv = " ".join(f"{l} {_signed(fm, k)}" for k, l in saves if _signed(fm, k))
    if sv:
        d.append(sv)
    if _one(fm, "perception"):
        d.append(f"Perc {_signed(fm, 'perception')}")
    if d:
        out.append("  " + " | ".join(d))

    # Movement, senses, and the defensive exceptions that change tactics.
    m = []
    for key, label in (("speed", "Speed"), ("sense", "Senses")):
        if _one(fm, key):
            m.append(f"{label} {_one(fm, key)}")
    if m:
        out.append("  " + " | ".join(m))

    ex = []
    for key, label in (("immunity", "Immune"), ("resistance", "Resist"),
                       ("weakness", "Weak")):
        val = _defense(fm, key)
        if val:
            ex.append(f"{label} {val}")
    if ex:
        out.append("  " + " | ".join(ex))

    mods = " ".join(f"{lab} {_signed(fm, k)}" for k, lab in ABILITIES if _signed(fm, k))
    if mods:
        out.append(f"  {mods}")

    abil = _many(fm, "creature_ability", cap=12)
    if abil:
        out.append(f"  Abilities: {abil}")

    # Spell-ish and item-ish entries carry different interesting fields.
    for key, label in (("tradition", "Traditions"), ("cast", "Cast"),
                       ("range", "Range"), ("area", "Area"), ("target", "Targets"),
                       ("saving_throw", "Save"), ("duration", "Duration"),
                       ("price", "Price"), ("bulk", "Bulk"),
                       ("prerequisite", "Prereq"), ("trigger", "Trigger")):
        val = _many(fm, key, cap=6)
        if val:
            out.append(f"  {label}: {val}")

    src = _one(fm, "primary_source")
    if src:
        out.append(f"  Source: {src}")
    return "\n".join(out)


def stat_lines(vault: Path, paths: list[str]) -> str:
    return "\n\n".join(stat_line(vault, p) for p in paths)
