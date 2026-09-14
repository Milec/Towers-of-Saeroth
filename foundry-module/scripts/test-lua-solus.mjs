import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";

const root = new URL("../../", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("foundry-module/content/saeroth-creatures.json", root), "utf8"));
const matches = manifest.actors.filter(actor => actor.name === "Lua Solus");
assert.equal(matches.length, 1, "Lua must occur exactly once");
const actor = matches[0];
assert.equal(actor.type, "npc");
assert.equal(actor.system.details.level.value, 12);
assert.equal(actor.system.attributes.hp.max, 160);
assert.equal(actor.system.attributes.ac.value, 32);
assert.equal(actor.flags.saeroth.source, "campaign/npcs/Lua Solus.md");
assert.equal(actor.img, actor.prototypeToken.texture.src);
assert.match(actor.img, /Lua%20Solus%20portrait\.png$/);
await access(new URL("campaign/npcs/Lua Solus portrait.png", root));
await access(new URL(`foundry-module/assets/actors/${actor._id}.png`, root));
const items = actor.__items;
assert.equal(new Set(items.map(item => item._id)).size, items.length);
assert.equal(actor.items.length, items.length);
const spells = items.filter(item => item.type === "spell");
assert.equal(spells.length, 23);
for (const spell of spells) {
  assert.ok(!spell.system.description.value.includes("Add the spell"), `${spell.name} is a placeholder`);
}
const entry = items.find(item => item.type === "spellcastingEntry");
assert.equal(entry.system.spelldc.dc, 32);
assert.equal(entry.system.spelldc.value, 24);
for (const spell of spells) assert.equal(spell.system.location.value, entry._id);
for (const rank of [1, 2, 3, 4, 5, 6]) assert.equal(entry.system.slots[`slot${rank}`].max, 3);
const flare = items.find(item => item.name === "Crescent Flare");
assert.equal(flare.system.actions.value, 2);
assert.match(flare.system.description.value, /@Template\[type:cone\|distance:30\]/);
assert.match(flare.system.description.value, /@Damage\[8d6\[cold\]\]/);
assert.match(flare.system.description.value, /@Check\[reflex\|dc:32\|basic\]/);
assert.match(flare.system.description.value, /@UUID\[Compendium\.pf2e\.conditionitems/);
assert.equal(items.find(item => item.name === "Moonlit Intercession").system.actionType.value, "reaction");
assert.match(items.find(item => item.name === "Lunar Benediction").system.description.value, /\[\[\/r 6d8\+24\]\]/);
console.log("Lua Solus: stats, 23 complete spells, action links, portrait and token checks passed.");
