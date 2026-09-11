import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { copyFile, mkdir, readdir, readFile, rm } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryDir = resolve(moduleDir, "..");
const campaignDir = join(repositoryDir, "campaign");
const packDir = join(moduleDir, "packs", "saeroth-actors");
const actorAssetDir = join(moduleDir, "assets", "actors");

function loadClassicLevel() {
  const nodeModules = process.env.FOUNDRY_NODE_MODULES;
  if (!nodeModules) {
    throw new Error(
      "Set FOUNDRY_NODE_MODULES to Foundry's resources/app/node_modules directory before building packs.",
    );
  }
  const require = createRequire(join(resolve(nodeModules), "package.json"));
  return require("classic-level").ClassicLevel;
}

function stableId(seed) {
  return createHash("sha256").update(seed).digest("base64url").slice(0, 16);
}

function html(value) {
  return `<p>${value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br />")}</p>`;
}

function traitSlug(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function skillSlug(value) {
  const aliases = { "warfare lore": "warfare-lore" };
  return aliases[value.trim().toLowerCase()] ?? traitSlug(value);
}

function parseFrontmatter(source, path) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) throw new Error(`${path}: missing frontmatter.`);
  const fields = Object.fromEntries(
    match[1]
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const separator = line.indexOf(":");
        return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
      }),
  );
  if (!fields.title || !["creature", "npc"].includes(fields.type)) {
    throw new Error(`${path}: requires title and type: creature or type: npc.`);
  }
  return fields;
}

function portraitSource(source, notePath) {
  const markdownImage = source.match(/!\[[\s\S]*?\]\(([^)]+)\)/);
  if (!markdownImage) return null;
  const sourcePath = resolve(dirname(notePath), markdownImage[1].trim());
  const campaignRelative = relative(campaignDir, sourcePath);
  if (campaignRelative.startsWith("..") || resolve(campaignDir, campaignRelative) !== sourcePath) {
    throw new Error(`${notePath}: portrait must be stored beneath campaign/.`);
  }
  if (!/\.(avif|gif|jpe?g|png|svg|webp)$/i.test(sourcePath)) {
    throw new Error(`${notePath}: portrait must be an image file.`);
  }
  return sourcePath;
}

function statValue(block, label) {
  const match = block.match(new RegExp(`\\*\\*${label}\\*\\*\\s*([+-]?\\d+)`, "i"));
  return match ? Number(match[1]) : null;
}

function parseList(line) {
  return line ? line.split(",").map((entry) => entry.trim()).filter(Boolean) : [];
}

function spellRank(label) {
  if (/^cantrips/i.test(label)) return 0;
  return Number.parseInt(label, 10);
}

function spellHeightenedLevel(label) {
  return Number(label.match(/\((\d+)(?:st|nd|rd|th)\)/i)?.[1] ?? spellRank(label));
}

function titleCase(value) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function makeFallbackSpell(name, rank, entryId, heightenedLevel) {
  return {
    _id: stableId(`${entryId}:spell:${name}`),
    name: titleCase(name),
    type: "spell",
    img: "systems/pf2e/icons/default-icons/spell.svg",
    system: {
      area: { type: "", value: 0 },
      cost: { value: "" },
      counteraction: false,
      damage: {},
      defense: { save: { basic: false, statistic: null } },
      description: { value: "<p>Imported from a Saeroth statblock. Add the spell's full text before play.</p>" },
      duration: { sustained: false, value: "" },
      level: { value: Math.max(rank, 1) },
      location: { value: entryId, heightenedLevel },
      publication: { license: "", remaster: true, title: "Towers of Saeroth" },
      range: { value: "" },
      requirements: "",
      rules: [],
      slug: traitSlug(name),
      target: { value: "" },
      time: { value: "" },
      traits: { rarity: "common", traditions: [], value: [] },
    },
  };
}

function parseActor(source, path, spellSources, portrait) {
  const frontmatter = parseFrontmatter(source, path);
  const fence = source.match(/```pf2e-stats\r?\n([\s\S]*?)```/i);
  if (!fence) throw new Error(`${path}: no pf2e-stats block.`);
  const block = fence[1].trim();
  const name = block.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const level = Number(block.match(/^##\s+Creature\s+(-?\d+)$/mi)?.[1]);
  if (!name || !Number.isInteger(level)) throw new Error(`${path}: statblock needs '# Name' and '## Creature <level>'.`);

  const abilityLine = block.match(/\*\*Str\*\*\s*([+-]?\d+),\s*\*\*Dex\*\*\s*([+-]?\d+),\s*\*\*Con\*\*\s*([+-]?\d+),\s*\*\*Int\*\*\s*([+-]?\d+),\s*\*\*Wis\*\*\s*([+-]?\d+),\s*\*\*Cha\*\*\s*([+-]?\d+)/i);
  const defenseLine = block.match(/\*\*AC\*\*\s*(\d+);\s*\*\*Fort\*\*\s*([+-]?\d+),\s*\*\*Ref\*\*\s*([+-]?\d+),\s*\*\*Will\*\*\s*([+-]?\d+)/i);
  const hpLine = block.match(/\*\*HP\*\*\s*(\d+)([^\n]*)/i);
  if (!abilityLine || !defenseLine || !hpLine) throw new Error(`${path}: missing ability, defense, or HP line.`);

  const traitsLine = block.split(/\r?\n/).find((line) => line.includes("==")) ?? "";
  const traits = [...traitsLine.matchAll(/==([^=]+)==/g)].map((match) => traitSlug(match[1]));
  const sizeMap = { tiny: "tiny", small: "sm", medium: "med", large: "lg", huge: "huge", gargantuan: "grg" };
  const size = sizeMap[traits.find((trait) => Object.hasOwn(sizeMap, trait))] ?? "med";
  const actorTraits = traits.filter((trait) => !Object.hasOwn(sizeMap, trait));
  const perception = statValue(block, "Perception") ?? 0;
  const perceptionDetails = block.match(/\*\*Perception\*\*[^;\n]*(?:;\s*([^\n]+))?/i)?.[1] ?? "";
  const languages = parseList(block.match(/\*\*Languages\*\*\s*([^\n]+)/i)?.[1]).map(traitSlug);
  const skillText = block.match(/\*\*Skills\*\*\s*([^\n]+)/i)?.[1] ?? "";
  const skills = Object.fromEntries(
    [...skillText.matchAll(/([A-Za-z ]+?)\s*([+-]\d+)(?:,|$)/g)].map((match) => [skillSlug(match[1]), { base: Number(match[2]) }]),
  );
  const speedLine = block.match(/\*\*Speed\*\*\s*(\d+)\s*feet([^\n]*)/i);
  const otherSpeeds = [...(speedLine?.[2] ?? "").matchAll(/(climb|fly|swim|burrow)\s+(\d+)\s*feet/gi)].map((match) => ({ type: match[1].toLowerCase(), value: Number(match[2]) }));
  const hpTail = hpLine[2];
  const parseDefenses = (label, numeric = false) => {
    const match = hpTail.match(new RegExp(`\\*\\*${label}\\*\\*\\s*([^;]+)`, "i"));
    return parseList(match?.[1]).map((entry) => {
      const parts = entry.match(/(.+?)\s+(\d+)$/);
      if (numeric) return parts ? { type: traitSlug(parts[1]), value: Number(parts[2]), exceptions: [] } : { type: traitSlug(entry), value: 0, exceptions: [] };
      return { type: traitSlug(entry), exceptions: [] };
    });
  };

  const id = stableId(relative(repositoryDir, path));
  const actor = {
    _id: id,
    name,
    type: "npc",
    img: portrait ?? "systems/pf2e/icons/default-icons/npc.svg",
    prototypeToken: { texture: { src: portrait ?? "systems/pf2e/icons/default-icons/npc.svg" } },
    items: [],
    effects: [],
    flags: { saeroth: { source: relative(repositoryDir, path).replaceAll("\\", "/") } },
    system: {
      abilities: Object.fromEntries(["str", "dex", "con", "int", "wis", "cha"].map((ability, index) => [ability, { mod: Number(abilityLine[index + 1]) }])),
      attributes: {
        ac: { value: Number(defenseLine[1]), details: "" },
        allSaves: { value: "" },
        hp: { value: Number(hpLine[1]), max: Number(hpLine[1]), temp: 0, details: "" },
        immunities: parseDefenses("Immunities"),
        resistances: parseDefenses("Resistances", true),
        weaknesses: parseDefenses("Weaknesses", true),
        speed: { value: Number(speedLine?.[1] ?? 25), otherSpeeds, details: "" },
      },
      details: { blurb: "", languages: { value: languages, details: "" }, level: { value: level }, privateNotes: "", publicNotes: html(block), publication: { license: "", remaster: true, title: "Towers of Saeroth" } },
      initiative: { statistic: "perception" },
      perception: { details: perceptionDetails, mod: perception, senses: [] },
      resources: {},
      saves: { fortitude: { value: Number(defenseLine[2]), saveDetail: "" }, reflex: { value: Number(defenseLine[3]), saveDetail: "" }, will: { value: Number(defenseLine[4]), saveDetail: "" } },
      skills,
      traits: { rarity: actorTraits.includes("unique") ? "unique" : "common", size: { value: size }, value: actorTraits.filter((trait) => trait !== "unique") },
    },
  };

  // Statblocks wrap long attacks and actions over multiple source lines. Treat
  // each blank-line-delimited paragraph as one entry before matching it.
  const entries = block
    .split(/\r?\n\s*\r?\n/)
    .map((entry) => entry.replace(/\r?\n\s*/g, " ").trim())
    .filter(Boolean);
  for (const line of entries) {
    const melee = line.match(/^\*\*Melee\*\*\s+`\[[^\]]+\]`\s+(.+?)\s+([+-]\d+)\s*(?:\(([^)]*)\))?,\s*\*\*Damage\*\*\s+(.+)$/i);
    if (melee) {
      const [, weaponName, bonus, traitText = "", damageText] = melee;
      const damage = damageText.match(/^(.+?)\s+(bludgeoning|piercing|slashing|acid|cold|electricity|fire|force|mental|negative|positive|poison|sonic)(?:\s|$)/i);
      const itemId = stableId(`${id}:melee:${weaponName}`);
      actor.items.push(itemId);
      actor.__items ??= [];
      actor.__items.push({ _id: itemId, name: weaponName.trim(), type: "melee", img: "systems/pf2e/icons/default-icons/melee.svg", system: { attackEffects: { value: [] }, bonus: { value: Number(bonus) }, damageRolls: { [stableId(`${itemId}:damage`)]: { damage: damage?.[1] ?? damageText, damageType: damage?.[2]?.toLowerCase() ?? "bludgeoning" } }, description: { value: "" }, publication: { license: "", remaster: true, title: "Towers of Saeroth" }, range: null, rules: [], slug: null, traits: { value: parseList(traitText).map(traitSlug) } } });
      continue;
    }
    const ability = line.match(/^\*\*(.+?)\*\*\s+`\[(one-action|two-actions|three-actions|reaction)\]`\s*(.*)$/i);
    if (ability && !/^Melee$/i.test(ability[1])) {
      const [, abilityName, actionType, text] = ability;
      const itemId = stableId(`${id}:action:${abilityName}`);
      actor.items.push(itemId);
      actor.__items ??= [];
      actor.__items.push({ _id: itemId, name: abilityName.trim(), type: "action", img: actionType === "reaction" ? "systems/pf2e/icons/actions/Reaction.webp" : "systems/pf2e/icons/actions/OneAction.webp", system: { actionType: { value: actionType === "reaction" ? "reaction" : "action" }, actions: { value: actionType === "reaction" ? null : { "one-action": 1, "two-actions": 2, "three-actions": 3 }[actionType] }, category: "offensive", description: { value: html(text) }, publication: { license: "", remaster: true, title: "Towers of Saeroth" }, rules: [], slug: null, traits: { value: [] } } });
    }

    const spellcasting = line.match(/^\*\*(arcane|divine|occult|primal)\s+(prepared|spontaneous|innate|focus)\s+spells\*\*\s+DC\s+(\d+),\s*attack\s+([+-]\d+);\s*(.+)$/i);
    if (!spellcasting) continue;

    const [, tradition, preparation, dc, attack, spellList] = spellcasting;
    const entryId = stableId(`${id}:spellcasting:${tradition}:${preparation}`);
    const slots = {};
    const spells = [];
    for (const match of spellList.matchAll(/\*\*(Cantrips(?:\s+\(\d+(?:st|nd|rd|th)\))?|\d+(?:st|nd|rd|th))\*\*\s+([^;]+)(?:;|$)/gi)) {
      const [, label, names] = match;
      const rank = spellRank(label);
      const heightenedLevel = spellHeightenedLevel(label);
      const spellNames = parseList(names);
      if (rank > 0) slots[`slot${rank}`] = { max: spellNames.length, value: spellNames.length };
      for (const spellName of spellNames) {
        const sourceSpell = spellSources.get(traitSlug(spellName));
        const spell = sourceSpell
          ? structuredClone(sourceSpell)
          : makeFallbackSpell(spellName, rank, entryId, heightenedLevel);
        spell._id = stableId(`${entryId}:spell:${spellName}`);
        spell.system.location = { value: entryId, heightenedLevel };
        spells.push(spell);
      }
    }
    if (spells.length === 0) continue;

    actor.items.push(entryId);
    actor.__items ??= [];
    actor.__items.push({
      _id: entryId,
      name: `${tradition[0].toUpperCase()}${tradition.slice(1).toLowerCase()} ${preparation[0].toUpperCase()}${preparation.slice(1).toLowerCase()} Spells`,
      type: "spellcastingEntry",
      img: "systems/pf2e/icons/default-icons/spellcastingEntry.svg",
      system: {
        autoHeightenLevel: { value: null },
        description: { value: "" },
        prepared: { value: preparation.toLowerCase() },
        proficiency: { value: 1 },
        publication: { license: "", remaster: true, title: "Towers of Saeroth" },
        rules: [],
        slots,
        slug: null,
        spelldc: { dc: Number(dc), value: Number(attack) },
        tradition: { value: tradition.toLowerCase() },
        traits: {},
      },
    });
    actor.items.push(...spells.map((spell) => spell._id));
    actor.__items.push(...spells);
  }
  return actor;
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => entry.isDirectory() ? walk(join(directory, entry.name)) : [join(directory, entry.name)]));
  return files.flat();
}

const ClassicLevel = loadClassicLevel();
const foundryDataDir = process.env.FOUNDRY_DATA_DIR ?? join(process.env.LOCALAPPDATA ?? "", "FoundryVTT", "Data");
const spellPackDir = join(foundryDataDir, "systems", "pf2e", "packs", "spells");
const spellSources = new Map();
const spellDb = new ClassicLevel(spellPackDir, { valueEncoding: "json" });
await spellDb.open();
try {
  for await (const [, item] of spellDb.iterator()) {
    if (item.type === "spell" && item.system?.slug) spellSources.set(item.system.slug, item);
  }
} finally {
  await spellDb.close();
}
const markdown = (await walk(campaignDir)).filter((path) => path.endsWith(".md"));
const actors = [];
let portraits = 0;
await rm(actorAssetDir, { recursive: true, force: true });
await mkdir(actorAssetDir, { recursive: true });
for (const path of markdown) {
  const source = await readFile(path, "utf8");
  if (!/^type:\s*(creature|npc)\s*$/mi.test(source) || !/```pf2e-stats/i.test(source)) continue;
  const id = stableId(relative(repositoryDir, path));
  const sourcePortrait = portraitSource(source, path);
  const portrait = sourcePortrait ? `assets/actors/${id}${extname(sourcePortrait).toLowerCase()}` : null;
  if (sourcePortrait) {
    await copyFile(sourcePortrait, join(moduleDir, portrait));
    portraits += 1;
  }
  actors.push(parseActor(source, path, spellSources, portrait));
}
if (actors.length === 0) throw new Error("No eligible creature or NPC statblocks found.");

await rm(packDir, { recursive: true, force: true });
const db = new ClassicLevel(packDir, { valueEncoding: "json" });
await db.open();
try {
  for (const actor of actors) {
    const items = actor.__items ?? [];
    delete actor.__items;
    await db.put(`!actors!${actor._id}`, actor);
    for (const item of items) await db.put(`!actors.items!${actor._id}.${item._id}`, item);
  }
} finally {
  await db.close();
}
console.log(`Built ${actors.length} PF2e actors and copied ${portraits} portraits in ${relative(repositoryDir, packDir)}.`);
