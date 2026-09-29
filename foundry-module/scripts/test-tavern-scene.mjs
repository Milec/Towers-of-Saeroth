import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { buildTavernScene } from "./tavern-scene.mjs";
import { SCENE_CORE_VERSION } from "./caravan-scene-version.mjs";

const root = new URL("../", import.meta.url);
const scope = "saeroth-pf2e-content";
const { scene: expected, assets } = buildTavernScene();
const scene = JSON.parse(await readFile(new URL("content/scenes/large-tavern.json", root), "utf8"));
assert.deepEqual(scene, expected, "Rebuild stale tavern scene JSON");
assert.equal(scene._stats.coreVersion, SCENE_CORE_VERSION);
assert.equal(scene.active, false);
assert.equal(scene.tokenVision, true);
assert.equal(scene.width / scene.grid.size, 36);
assert.equal(scene.height / scene.grid.size, 24);
assert.equal(scene.grid.distance, 5);
assert.equal(scene.levels.length, 3);
assert.equal(scene.initialLevel, scene.levels[0]._id);
assert.deepEqual(scene.levels.map(l => l.elevation), [
  { bottom: 0, top: 10 }, { bottom: -10, top: 0 }, { bottom: 10, top: 20 }
]);
assert.equal(scene.environment.globalLight.enabled, false);
assert.equal(scene.walls.filter(w => w.door).length, 21);
assert.equal(scene.lights.length, 30);
assert.equal(scene.walls.filter(w => w.ds === 2).length, 1);
assert.equal(scene.walls.find(w => w.ds === 2).flags[scope].label, "Secure wine room");
const ids = [scene._id, ...["levels", "walls", "lights"].flatMap(k => scene[k].map(d => d._id))];
assert.equal(ids.length, new Set(ids).size);
for (const id of ids) assert.match(id, /^[a-zA-Z0-9]{16}$/);
for (const [i, level] of scene.levels.entries()) {
  assert.equal(level.background.src, `modules/${scope}/${assets[i]}`);
  assert.equal(level.textures.fit, "fill");
  const png = await readFile(new URL(assets[i], root));
  assert.equal(png.subarray(1, 4).toString(), "PNG");
  assert.equal(png.readUInt32BE(16), 1536);
  assert.equal(png.readUInt32BE(20), 1024);
  assert.equal(scene.walls.filter(w => w.levels[0] === level._id && w.door).length, [8, 5, 8][i]);
}
const levels = new Map(scene.levels.map(l => [l._id, l]));
for (const wall of scene.walls) {
  assert.equal(wall.levels.length, 1);
  assert.ok(levels.has(wall.levels[0]));
  assert.equal(wall.c.length, 4);
  assert.notDeepEqual(wall.c.slice(0, 2), wall.c.slice(2));
  wall.c.forEach((c, i) => assert.ok(Number.isInteger(c) && c >= 0 && c <= (i % 2 ? scene.height : scene.width)));
  assert.equal(wall.move, 20);
  assert.equal(wall.light, wall.sight);
}
for (const light of scene.lights) {
  const level = levels.get(light.levels[0]);
  assert.ok(level && light.levels.length === 1);
  assert.ok(light.elevation >= level.elevation.bottom && light.elevation < level.elevation.top);
  assert.ok(light.x > 0 && light.x < scene.width && light.y > 0 && light.y < scene.height);
  assert.ok(light.config.dim >= light.config.bright);
  assert.equal(light.walls, true);
}

// Assert actual passable paths, not merely a stair label. Closed doors still block.
const px = n => Math.round(n * 3600 / 1536);
function intersects(a, b, c, d) {
  const cross = (p, q, r) => (q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);
  return cross(a,b,c)*cross(a,b,d) < 0 && cross(c,d,a)*cross(c,d,b) < 0;
}
function clearPath(level, points) {
  const path = points.map(p => p.map(px));
  for (let i = 1; i < path.length; i++) for (const wall of scene.walls.filter(w => w.levels[0] === level)) {
    assert.ok(!intersects(path[i-1], path[i], wall.c.slice(0,2), wall.c.slice(2)),
      `Blocked route: ${wall.flags[scope].label}`);
  }
}
const [ground, cellar, upstairs] = scene.levels.map(l => l._id);
clearPath(ground, [[414,450],[414,330],[414,195]]);
clearPath(upstairs, [[434,205],[434,140],[505,140],[505,410],[760,460]]);
clearPath(ground, [[1250,400],[1250,333],[1345,333],[1345,380]]);
clearPath(cellar, [[1220,525],[1345,525],[1345,470]]);
for (const [level, expectedEnd] of [[ground,174],[upstairs,314]]) {
  const stair = scene.walls.filter(w => w.levels[0] === level && w.flags[scope].label.startsWith("Guest stair"));
  assert.equal(stair.length, 3);
  assert.deepEqual(stair.find(w => w.flags[scope].label.endsWith("closed end")).c.filter((_,i) => i % 2), [px(expectedEnd),px(expectedEnd)]);
}
assert.ok(!scene.walls.some(w => w.flags[scope].label.startsWith("Northwest table")), "Removed table must not leave invisible collisions");
console.log("Tavern: three backgrounds, eight bedrooms, 21 doors, 30 lights, floor isolation and passable stair approaches passed.");

if (process.env.FOUNDRY_NODE_MODULES) {
  const require = createRequire(import.meta.url);
  const { ClassicLevel } = require(join(process.env.FOUNDRY_NODE_MODULES, "classic-level"));
  const db = new ClassicLevel(fileURLToPath(new URL("packs/saeroth-scenes", root)), { valueEncoding: "json", createIfMissing: false });
  await db.open();
  try {
    assert.equal((await db.keys().all()).filter(k => k.startsWith("!scenes!")).length, 4);
    const packed = await db.get(`!scenes!${scene._id}`);
    for (const collection of ["levels", "walls", "lights"]) {
      packed[collection] = await Promise.all(packed[collection].map(id => db.get(`!scenes.${collection}!${scene._id}.${id}`)));
    }
    assert.deepEqual(packed, scene);
    console.log("Tavern native scene pack round-trip passed; all four scenes retained.");
  } finally { await db.close(); }
}
