import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
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
