import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const code = await readFile(new URL("saeroth-content-sync.mjs", import.meta.url), "utf8");
const scope = "saeroth-pf2e-content";
const actors = [];
const notices = [];
const pack = {
  collection: "world.saeroth-synced-creatures",
  async getDocuments() { return actors; },
  render() {},
};
let creations = 0;
let updates = 0;
function existing(flags) {
  const itemCollection = values => {const list = structuredClone(values);Object.defineProperty(list, "size", {get() {return this.length;}});return list;};
  return { flags, items: itemCollection([]),
    getFlag() { throw new Error('Flag scope "saeroth" is not valid or not currently active'); },
    async update(data) { this.flags = { ...this.flags, ...data.flags }; updates++; },
    async deleteEmbeddedDocuments() { this.items = itemCollection([]); },
    async createEmbeddedDocuments(_type, items, options) { assert.equal(options.keepId, true, "spell references require preserved embedded IDs"); this.items = itemCollection(items); },
  };
}
actors.push(existing({ saeroth: { syncKey: "old-npc" } }));
actors.push(existing({ [scope]: { syncKey: "new-npc" } }));
const sources = ["old-npc", "new-npc", "milo"].map(syncKey => ({
  _id: "legacy-source-id", name: syncKey, flags: { saeroth: { syncKey } },
  items: ["ClubAction000001", "SpellEntry000001", "SpellRecord00001"], __items: [
    { _id: "ClubAction000001", name: "club", type: "melee" },
    { _id: "SpellEntry000001", name: "Arcane spells", type: "spellcastingEntry", system: { slots: { slot1: { prepared: { 0: { id: "SpellRecord00001", expended: false } } } } } },
    { _id: "SpellRecord00001", name: "Force barrage", type: "spell", system: { location: { value: "SpellEntry000001" } } },
  ],
}));
const context = vm.createContext({
  Hooks: { on() {}, once() {} },
  foundry: { utils: { deepClone: structuredClone } },
  game: { user: { isGM: true }, packs: new Map([[pack.collection, pack]]) },
  document: { querySelector: () => null },
  fetch: async () => ({ ok: true, json: async () => ({ schema: 1, actors: sources }) }),
  Actor: { async create(data) {
    assert.equal(data.flags.saeroth, undefined);
    assert.equal(data.flags[scope].syncKey, "milo");
    const actor = existing(data.flags); actors.push(actor); creations++; return actor;
  } },
  ui: { notifications: { info: m => notices.push(m), error: m => { throw new Error(m); } } },
  console,
});
vm.runInContext(code, context);
await vm.runInContext("syncContent()", context);
assert.equal(creations, 1);
assert.equal(updates, 2);
await vm.runInContext("syncContent()", context);
assert.equal(creations, 1, "repeat sync must not duplicate legacy or current records");
assert.equal(updates, 5);
assert.equal(sources[0].flags.saeroth.syncKey, "old-npc", "source must not be mutated");
assert.equal(sources[0].__items[0]._id, "ClubAction000001");
for (const actor of actors) {
  const entry = actor.items.find(item => item.type === "spellcastingEntry");
  const spell = actor.items.find(item => item.type === "spell");
  assert.equal(entry._id, "SpellEntry000001");
  assert.equal(spell.system.location.value, entry._id);
  assert.equal(entry.system.slots.slot1.prepared[0].id, spell._id);
}
context.invalidSource = structuredClone(sources[0]);context.invalidSource.__items[1]._id = "invalid-item-id";
assert.throws(() => vm.runInContext("actorData(invalidSource)", context), /invalid or duplicate/);
context.invalidSource = structuredClone(sources[0]);context.invalidSource.__items[2].system.location.value = "missing-entry";
assert.throws(() => vm.runInContext("actorData(invalidSource)", context), /without its spellcasting entry/);
assert.equal(notices.length, 2);
console.log("Content sync: legacy/current flags, first/repeat sync, source preservation, embedded IDs and spellcasting references passed.");
