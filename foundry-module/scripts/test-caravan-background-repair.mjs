import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { backgroundRepair, matchingSource, repairDocuments } from "./caravan-background-repair.mjs";
import { SCENE_CORE_VERSION } from "./caravan-scene-version.mjs";

const source = JSON.parse(await readFile(new URL("../content/scenes/berruel-caravan-campsite.json", import.meta.url), "utf8"));
function document(id = source._id) {
  const level = { id: "defaultLevel0000", background: { src: null } };
  return { id, levels: [level], calls: [], walls: [{ custom: true }], tokens: [{ custom: true }],
    async updateEmbeddedDocuments(type, updates, options) {
      this.calls.push({ type, updates, options });
      assert.equal(type, "Level");
      assert.deepEqual(Object.keys(updates[0]).sort(), ["_id", "background.src", "textures"]);
      level.background.src = updates[0]["background.src"];
    } };
}
const broken = document();
assert.equal(matchingSource(broken, [source]), source);
assert.equal(backgroundRepair(broken, source)["background.src"], source.levels[0].background.src);
const custom = document();
custom.levels[0].background.src = "worlds/custom/own-map.webp";
assert.equal(backgroundRepair(custom, source), null);
const multi = document();
multi.levels.push({ id: "otherLevel000000", background: { src: null } });
assert.equal(backgroundRepair(multi, source), null);
const unrelated = document("unrelatedScene00");
unrelated.name = source.name;
assert.equal(matchingSource(unrelated, [source]), undefined, "A matching name alone must not target a world scene");
const imported = document("newWorldScene000");
imported._stats = { compendiumSource: `Compendium.saeroth-pf2e-content.saeroth-scenes.Scene.${source._id}` };
assert.equal(matchingSource(imported, [source]), source);
const lockChanges = [];
const pack = { collection: "saeroth-pf2e-content.saeroth-scenes", locked: true, config: {},
  getDocuments: async () => [broken], configure: async change => { lockChanges.push(change); } };
assert.deepEqual(await repairDocuments([source], { pack, scenes: [imported, custom, unrelated, multi] }), { compendium: 1, world: 1 });
assert.deepEqual(lockChanges, [{ locked: false }, { locked: undefined }]);
assert.deepEqual(imported.walls, [{ custom: true }]);
assert.deepEqual(imported.tokens, [{ custom: true }]);
assert.deepEqual(await repairDocuments([source], { pack, scenes: [imported] }), { compendium: 0, world: 0 });
assert.equal(broken.calls.length, 1, "Repair must be idempotent");
const failing = document();
failing.updateEmbeddedDocuments = async () => { throw new Error("mock failure"); };
pack.getDocuments = async () => [failing];
pack.config.locked = true;
await assert.rejects(repairDocuments([source], { pack, scenes: [] }), /mock failure/);
assert.deepEqual(lockChanges.at(-1), { locked: true }, "Restore compendium lock even on failure");

// Execute the real installed server's legacy migration, when available. The
// previous raw-DB round-trip test could not catch a loss during server startup.
if (process.env.FOUNDRY_NODE_MODULES) {
  const server = await readFile(join(dirname(process.env.FOUNDRY_NODE_MODULES), "dist/database/documents/scene.mjs"), "utf8");
  const version = server.match(/fn:migrateLevels,version:"([^"]+)"/)?.[1];
  const body = server.match(/function migrateLevels\(e\)\{[\s\S]*?(?=function migrateFogExploration)/)?.[0];
  assert.ok(version && body, "Locate installed Foundry's actual level migration");
  const migrateLevels = new Function("Scene", `return (${body});`)({ metadata: { defaultLevelId: "defaultLevel0000" } });
  const old = structuredClone(source);
  delete old._stats;
  migrateLevels(old);
  assert.equal(old.levels[0].background?.src, undefined, "Reproduce v0.1.20's lost backdrop");
  const numericVersion = value => value.split(".").reduce((n, part) => n * 1000 + Number(part), 0);
  const fixed = structuredClone(source);
  assert.equal(fixed._stats.coreVersion, SCENE_CORE_VERSION);
  // This is the version guard used by ServerDocumentMixin._migrateRecord.
  if (!fixed._stats?.coreVersion || numericVersion(version) > numericVersion(fixed._stats.coreVersion)) migrateLevels(fixed);
  assert.deepEqual(fixed.levels, source.levels, "v14-native version marker preserves the original backdrop");
  console.log(`Real Foundry migration ${version}: old scene loses backdrop; stamped scene retains it.`);
}
console.log("Background repair: identity matching, minimal updates, custom-map preservation, lock restoration and idempotency passed.");
