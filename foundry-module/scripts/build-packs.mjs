import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readdir, readFile, rm } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryDir = resolve(moduleDir, "..");
const campaignDir = join(repositoryDir, "campaign");
const packDir = join(moduleDir, "packs", "saeroth-actors");

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

function statValue(block, label) {
  const match = block.match(new RegExp(`\\*\\*${label}\\*\\*\\s*([+-]?\\d+)`, "i"));
  return match ? Number(match[1]) : null;
}

function parseList(line) {
  return line ? line.split(",").map((entry) => entry.trim()).filter(Boolean) : [];
}

function parseActor(source, path) {
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
    img: "systems/pf2e/icons/default-icons/npc.svg",
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
  }
  return actor;
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => entry.isDirectory() ? walk(join(directory, entry.name)) : [join(directory, entry.name)]));
  return files.flat();
}

const ClassicLevel = loadClassicLevel();
const markdown = (await walk(campaignDir)).filter((path) => path.endsWith(".md"));
const actors = [];
for (const path of markdown) {
  const source = await readFile(path, "utf8");
  if (/^type:\s*(creature|npc)\s*$/mi.test(source) && /```pf2e-stats/i.test(source)) actors.push(parseActor(source, path));
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
console.log(`Built ${actors.length} PF2e actors in ${relative(repositoryDir, packDir)}.`);
