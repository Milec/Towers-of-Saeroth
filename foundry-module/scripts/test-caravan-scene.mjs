import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { buildTravelScenes } from "./caravan-travel-scenes.mjs";
import { SCENE_CORE_VERSION } from "./caravan-scene-version.mjs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const root = new URL("../", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("module.json", root), "utf8"));
assert.equal(manifest.packs.find(p => p.name === "saeroth-scenes").type, "Scene");
const scene = JSON.parse(await readFile(new URL("content/scenes/berruel-caravan-ambush.json", root), "utf8"));
assert.equal(scene.width / scene.grid.size, 32);
assert.equal(scene.height / scene.grid.size, 32);
assert.equal(scene.grid.distance, 5);
assert.equal(scene.active, false);
assert.equal(scene.tokenVision, true);
assert.equal(scene.levels.length, 1);
assert.equal(scene.levels[0]._id, scene.initialLevel);
assert.equal(scene.levels[0].textures.fit, "fill");
await access(new URL(scene.levels[0].background.src.replace("modules/saeroth-pf2e-content/", ""), root));
assert.equal(scene.walls.length, 23);
assert.equal(scene.walls.filter(w => w.door === 1).length, 3);
assert.equal(scene.walls.filter(w => w.sight === 0 && w.move === 20).length, 12);
assert.equal(scene.lights.length, 3);
assert.equal(scene.tokens.length, 0);
const ids = [scene._id, ...scene.levels.map(l => l._id), ...scene.walls.map(w => w._id), ...scene.lights.map(l => l._id)];
assert.equal(ids.length, new Set(ids).size);
for (const id of ids) assert.match(id, /^[a-zA-Z0-9]{16}$/);
for (const wall of scene.walls) {
  assert.equal(wall.c.length, 4);
  for (const coordinate of wall.c) assert.ok(Number.isInteger(coordinate) && coordinate >= 0 && coordinate <= 3200);
  assert.deepEqual(wall.levels, [scene.initialLevel]);
}
for (const light of scene.lights) {
  assert.ok(light.x > 0 && light.x < 3200 && light.y > 0 && light.y < 3200);
  assert.ok(light.config.dim >= light.config.bright);
  assert.equal(light.walls, true);
  assert.deepEqual(light.levels, [scene.initialLevel]);
}
console.log("Caravan scene: asset, v14 level, grid, wall bounds, tailgates, lights and IDs passed.");

const expected = [
  { slug: "berruel-caravan-campsite", size: 3200, walls: 60, doors: 7, lights: 4, night: true },
  { slug: "berruel-caravan-road", size: 3200, walls: 43, doors: 3, lights: 3, night: false }
];
const scenes = [scene];
for (const entry of expected) {
  const current = JSON.parse(await readFile(new URL(`content/scenes/${entry.slug}.json`, root), "utf8"));
  assert.deepEqual(current, buildTravelScenes().find(s => s.slug === entry.slug).scene, "Rebuild stale scene JSON");
  assert.equal(current.width, entry.size);
  assert.equal(current.height, entry.size);
  assert.equal(current.grid.size, 100);
  assert.equal(current.grid.distance, 5);
  assert.equal(current.grid.units, "ft");
  assert.equal(current.active, false);
  assert.equal(current.tokenVision, true);
  assert.equal(current.tokens.length, 0);
  assert.equal(current.walls.length, entry.walls);
  assert.equal(current.walls.filter(w => w.door === 1).length, entry.doors);
  assert.equal(current.lights.length, entry.lights);
  assert.equal(current.levels.length, 1);
  assert.equal(current.levels[0]._id, current.initialLevel);
  assert.equal(current.levels[0].textures.fit, "fill");
  assert.equal(current.environment.globalLight.enabled, !entry.night);
  assert.equal(current.environment.globalLight.bright, !entry.night);
  assert.equal(current.environment.darknessLevel, entry.night ? .75 : 0);
  // The user requires one recognizable caravan across the three maps.
  // Door segmentation may differ, but wagon footprint and scale must not.
  for (const label of ["West wagon", "Middle wagon", "East wagon"]) {
    const bounds = source => {
      const points = source.walls.filter(w => w.flags.saeroth.label.startsWith(label)).flatMap(w => [w.c.slice(0, 2), w.c.slice(2)]);
      return [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])),
        Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))];
    };
    assert.deepEqual(bounds(current), bounds(scene), `${label} scale/position must match original caravan`);
  }
  const png = await readFile(new URL(current.levels[0].background.src.replace("modules/saeroth-pf2e-content/", ""), root));
  assert.equal(png.subarray(1, 4).toString(), "PNG");
  assert.equal(png.readUInt32BE(16), 1254, "Wall tracing assumes original artwork dimensions");
  assert.equal(png.readUInt32BE(20), 1254);
  const documentIds = [current._id, ...current.levels.map(d => d._id), ...current.walls.map(d => d._id), ...current.lights.map(d => d._id)];
  assert.equal(documentIds.length, new Set(documentIds).size);
  documentIds.forEach(id => assert.match(id, /^[a-zA-Z0-9]{16}$/));
  for (const wall of current.walls) {
    assert.equal(wall.c.length, 4);
    wall.c.forEach(c => assert.ok(Number.isInteger(c) && c >= 0 && c <= entry.size));
    assert.notDeepEqual(wall.c.slice(0, 2), wall.c.slice(2));
    assert.deepEqual(wall.levels, [current.initialLevel]);
    assert.equal(wall.move, 20);
    const wagon = wall.flags.saeroth.label.includes("wagon");
    assert.equal(wall.sight, wagon ? 0 : 20);
    assert.equal(wall.light, wagon ? 0 : 20);
    if (wall.door) assert.equal(wall.ds, 0);
  }
  for (const light of current.lights) {
    assert.ok(light.x > 0 && light.x < entry.size && light.y > 0 && light.y < entry.size);
    assert.equal(light.config.bright, 20);
    assert.equal(light.config.dim, 40);
    assert.equal(light.config.darkness.min, entry.night ? 0 : .25);
    assert.equal(light.walls, true);
    assert.deepEqual(light.levels, [current.initialLevel]);
  }
  scenes.push(current);
  console.log(`${current.name}: source parity, image dimensions, grid, doors, walls, lights and bounds passed.`);
}
assert.equal(new Set(scenes.map(s => s._id)).size, 3);
for (const scene of scenes) assert.equal(scene._stats?.coreVersion, SCENE_CORE_VERSION,
  "Native v14 scene data must not run the destructive pre-v14 migrateLevels conversion");
assert.equal(manifest.compatibility.minimum, SCENE_CORE_VERSION);

// Optional native LevelDB round-trip check when the Foundry runtime is present.
if (process.env.FOUNDRY_NODE_MODULES) {
  const require = createRequire(import.meta.url);
  const { ClassicLevel } = require(join(process.env.FOUNDRY_NODE_MODULES, "classic-level"));
  const db = new ClassicLevel(fileURLToPath(new URL("packs/saeroth-scenes", root)), { valueEncoding: "json", createIfMissing: false });
  await db.open();
  try {
    const keys = await db.keys().all();
    assert.ok(keys.filter(k => k.startsWith("!scenes!")).length >= 3);
    for (const expectedScene of scenes) {
      const packed = await db.get(`!scenes!${expectedScene._id}`);
      for (const collection of ["levels", "walls", "lights"]) {
        packed[collection] = await Promise.all(packed[collection].map(id => db.get(`!scenes.${collection}!${expectedScene._id}.${id}`)));
      }
      assert.deepEqual(packed, expectedScene);
    }
    console.log("All three native scene pack documents round-trip exactly, including embedded levels, walls and lights.");
  } finally { await db.close(); }
}
