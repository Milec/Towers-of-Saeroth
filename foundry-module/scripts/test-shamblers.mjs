import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";

const root = new URL("../../", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("foundry-module/content/saeroth-creatures.json", root), "utf8"));
for (const [name, level] of [["Kindled Shambler", 0], ["Zombie Shambler", -1]]) {
  const matches = manifest.actors.filter(actor => actor.name === name);
  assert.equal(matches.length, 1);
  const actor = matches[0];
  assert.equal(actor.system.details.level.value, level);
  assert.equal(actor.system.attributes.hp.max, 20);
  assert.equal(actor.system.attributes.hp.negativeHealing, true);
  assert.equal(actor.system.attributes.ac.value, 12);
  assert.deepEqual(actor.system.attributes.immunities.map(i => i.type), ["bleed", "death-effects", "disease", "mental", "paralyzed", "poison", "unconscious"]);
  assert.deepEqual(actor.system.attributes.weaknesses.map(i => [i.type, i.value]), [["slashing", 5], ["vitality", 5]]);
  assert.equal(actor.system.perception.senses[0].type, "darkvision");
  assert.notEqual(actor.img, actor.prototypeToken.texture.src);
  assert.ok(actor.prototypeToken.texture.src.endsWith(`${encodeURIComponent(name)}%20token.png`));
  await access(new URL(`campaign/world/bestiary/${name} token.png`, root));
  await access(new URL(`foundry-module/assets/actors/${actor._id}-token.png`, root));
  await access(new URL(`campaign/world/bestiary/${name} portrait.png`, root));
  await access(new URL(`foundry-module/assets/actors/${actor._id}.png`, root));
  const items = actor.__items;
  assert.equal(items.length, actor.items.length);
  assert.equal(new Set(items.map(i => i._id)).size, items.length);
  assert.equal(items.filter(i => i.type === "melee").length, 2);
  for (const strike of items.filter(i => i.type === "melee")) assert.equal(strike.system.bonus.value, 7);
  for (const action of ["Grab", "Zombie Bite"]) assert.equal(items.find(i => i.name === action).system.actions.value, 1);
  assert.match(items.find(i => i.name === "Slow").system.description.value, /Compendium.pf2e.conditionitems/);
  const burst = items.find(i => i.name === "Death Throes");
  if (level === 0) {
    assert.equal(burst.system.actionType.value, "passive");
    assert.match(burst.system.description.value, /@Template\[type:burst\|distance:5\]/);
    assert.match(burst.system.description.value, /@Check\[reflex\|dc:15\|basic\]/);
    assert.match(burst.system.description.value, /@Damage\[1d8\[fire\]\]/);
    assert.match(burst.system.description.value, /@Damage\[1\[persistent,fire\]\]/);
  } else assert.equal(burst, undefined);
}
console.log("Shamblers: stats, defenses, healing, senses, actions, burst links and portraits passed.");
