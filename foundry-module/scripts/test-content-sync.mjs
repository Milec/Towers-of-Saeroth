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
  return { flags, items: { size: 0 },
    getFlag() { throw new Error('Flag scope "saeroth" is not valid or not currently active'); },
    async update(data) { this.flags = { ...this.flags, ...data.flags }; updates++; },
    async createEmbeddedDocuments() {},
  };
}
actors.push(existing({ saeroth: { syncKey: "old-npc" } }));
actors.push(existing({ [scope]: { syncKey: "new-npc" } }));
const sources = ["old-npc", "new-npc", "milo"].map(syncKey => ({
  _id: "legacy-source-id", name: syncKey, flags: { saeroth: { syncKey } },
  items: ["legacy-item"], __items: [{ _id: "legacy-item", name: "club" }],
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
assert.equal(sources[0].__items[0]._id, "legacy-item");
assert.equal(notices.length, 2);
console.log("Content sync: legacy/current flags, first sync, repeat sync and source preservation passed.");
