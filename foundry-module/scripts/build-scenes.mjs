import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTravelScenes } from "./caravan-travel-scenes.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const moduleId = "saeroth-pf2e-content";
const asset = "assets/maps/berruel-caravan-ambush.png";
await access(join(root, asset));
const id = name => createHash("sha256").update(`saeroth-caravan:${name}`).digest("hex").slice(0, 16);
const levelId = "defaultLevel0000";
// Coordinates traced against the generated 1254px square artwork. Foundry
// fills a 3200px square scene so a 100px square is five feet (32 x 32 squares).
const px = value => Math.round(value * 3200 / 1254);
const walls = [];
function polygon(name, points, opaque = false, gateEdge = -1) {
  points.forEach((point, i) => {
    const next = points[(i + 1) % points.length];
    walls.push({ _id: id(`${name}-wall-${i}`), c: [...point, ...next].map(px),
      levels: [levelId], move: 20, sight: opaque ? 20 : 0,
      light: opaque ? 20 : 0, sound: 0, dir: 0, door: i === gateEdge ? 1 : 0,
      ds: 0, flags: { saeroth: { label: `${name}${i === gateEdge ? " tailgate" : ""}` } } });
  });
}
// Open-top wagons: collide with the sides but see/light over them. The short
// east side is a GM-openable tailgate, not an imaginary floor-to-ceiling wall.
polygon("West wagon", [[286,550],[417,550],[417,635],[286,635]], false, 1);
polygon("Middle wagon", [[574,550],[700,550],[700,635],[574,635]], false, 1);
polygon("East wagon", [[866,550],[996,550],[996,635],[866,635]], false, 1);
// Two substantial boulders near the lower edge provide hard cover.
polygon("Southwest boulder", [[310,999],[335,1013],[332,1038],[307,1044],[295,1023]], true);
polygon("Southeast boulder", [[992,905],[1030,905],[1053,929],[1044,951],[1010,963],[981,943]], true);
const lights = [[425,551],[712,551],[1006,551]].map(([x,y], i) => ({
  _id: id(`lantern-${i}`), name: `Wagon ${i+1} lantern`, x: px(x), y: px(y),
  elevation: 5, levels: [levelId], rotation: 0, walls: true, vision: false,
  hidden: false, config: { bright: 20, dim: 40, angle: 360, color: "#ffbf72",
    alpha: .3, luminosity: .5, attenuation: .5, darkness: { min: 0, max: 1 },
    animation: { type: "torch", speed: 2, intensity: 2 } }
}));
const scene = {
  _id: id("scene"), name: "Berruel Caravan — Roadside Ambush", active: false,
  navigation: false, navOrder: 0, width: 3200, height: 3200, padding: 0,
  shiftX: 0, shiftY: 0, initial: { x: 1600, y: 1500, scale: .3 },
  initialLevel: levelId, thumb: `modules/${moduleId}/${asset}`,
  grid: { type: 1, size: 100, distance: 5, units: "ft", alpha: .15,
    color: "#b8b0a0", style: "solidLines", thickness: 1 },
  tokenVision: true,
  environment: { darknessLevel: .25, darknessLock: true, cycle: false,
    globalLight: { enabled: true, bright: false, darkness: { min: 0, max: 1 } } },
  levels: [{ _id: levelId, name: "Road", elevation: { bottom: null, top: null },
    background: { src: `modules/${moduleId}/${asset}`, color: "#252820" },
    textures: { fit: "fill", scaleX: 1, scaleY: 1, anchorX: .5, anchorY: .5,
      offsetX: 0, offsetY: 0, rotation: 0 } }],
  walls, lights, tokens: [], notes: [], sounds: [], drawings: [], regions: [], tiles: [],
  ownership: { default: 0 }, flags: { saeroth: {
    source: "campaign/sessions/Session 01 — The Berruel Consignment.md",
    setup: "160ft square. Wagon sides block movement, not sight/light; open east tailgates to board. Ditch/brush terrain and cover are GM-adjudicated. No actors preplaced. Walls and lights stay fixed if you move the baked-in wagons."
  } }
};
const entries = [{ slug: "berruel-caravan-ambush", asset, scene }, ...buildTravelScenes()];
await mkdir(join(root, "content", "scenes"), { recursive: true });
for (const entry of entries) {
  await access(join(root, entry.asset));
  await writeFile(join(root, "content", "scenes", `${entry.slug}.json`), JSON.stringify(entry.scene, null, 2) + "\n");
}
const require = createRequire(import.meta.url);
if (!process.env.FOUNDRY_NODE_MODULES) throw new Error("Set FOUNDRY_NODE_MODULES to Foundry's bundled node_modules.");
const { ClassicLevel } = require(join(process.env.FOUNDRY_NODE_MODULES, "classic-level"));
const db = new ClassicLevel(join(root, "packs", "saeroth-scenes"), { valueEncoding: "json" });
await db.open();
try {
  // This pack is generated only by this script. Clearing avoids stale walls.
  await db.clear();
  for (const { scene } of entries) {
    const packed = structuredClone(scene);
    for (const collection of ["levels", "walls", "lights"]) {
      packed[collection] = scene[collection].map(document => document._id);
      for (const document of scene[collection]) await db.put(`!scenes.${collection}!${scene._id}.${document._id}`, document);
    }
    await db.put(`!scenes!${scene._id}`, packed);
    const stored = await db.get(`!scenes!${scene._id}`);
    for (const collection of ["walls", "lights", "levels"]) {
      if (stored[collection].length !== scene[collection].length) throw new Error(`Scene pack verification failed: ${scene.name}`);
    }
    console.log(`Built ${scene.name}: ${scene.walls.length} walls, ${scene.lights.length} lights, ${scene.width / scene.grid.size} x ${scene.height / scene.grid.size} five-foot squares.`);
  }
  await db.compactRange("\x00", "\xff");
} finally { await db.close(); }
