import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";

const root = new URL("../../", import.meta.url);
const feed = JSON.parse(await readFile(new URL("foundry-module/content/saeroth-creatures.json", root), "utf8"));
const matches = feed.actors.filter(a => a.name === "Milo Calvetti");
assert.equal(matches.length, 1);
const actor = matches[0];
assert.equal(actor.type, "npc");
assert.equal(actor.system.details.level.value, 2);
assert.equal(actor.system.attributes.ac.value, 17);
assert.equal(actor.system.attributes.hp.max, 30);
assert.equal(actor.system.skills["caravan-lore"].base, 11);
assert.equal(actor.system.saves.reflex.value, 5);
assert.match(actor._id, /^[a-zA-Z0-9]{16}$/);
assert.equal(actor.__items.length, 4);
assert.deepEqual(actor.items, actor.__items.map(i => i._id));
for (const item of actor.__items) assert.match(item._id, /^[a-zA-Z0-9]{16}$/);
const strikes = actor.__items.filter(i => i.type === "melee");
assert.equal(strikes.length, 2);
for (const item of strikes) assert.equal(item.system.bonus.value, 9);
assert.equal(actor.__items.find(i => i.name === "Roadwise").system.actionType.value, "passive");
const steady = actor.__items.find(i => i.name === "Steady the Team");
assert.equal(steady.system.actions.value, 1);
assert.match(steady.system.description.value, /@UUID\[Compendium\.pf2e\.conditionitems/);
assert.notEqual(actor.img, actor.prototypeToken.texture.src);
assert.match(actor.img, /Milo%20Calvetti%20portrait.png$/);
assert.match(actor.prototypeToken.texture.src, /Milo%20Calvetti%20token.png$/);
for (const suffix of [".png", "-token.png"]) {
  await access(new URL(`foundry-module/assets/actors/${actor._id}${suffix}`, root));
}
console.log("Milo: sheet stats, unique valid IDs, both abilities, condition link and separate artwork passed.");
