const MODULE_ID = "saeroth-pf2e-content";
const PACK_ID = `${MODULE_ID}.saeroth-scenes`;
const SLUGS = ["berruel-caravan-ambush", "berruel-caravan-campsite", "berruel-caravan-road"];

export function matchingSource(document, sources) {
  const origin = document._stats?.compendiumSource ?? document._source?._stats?.compendiumSource
    ?? document.flags?.core?.sourceId;
  return sources.find(source => document.id === source._id
    || origin === `Compendium.${PACK_ID}.Scene.${source._id}`);
}

export function backgroundRepair(document, source) {
  if (!source) return null;
  // Our damaged scenes have exactly one empty default level. Leave custom
  // multi-level scenes and any user-selected background alone.
  const levels = Array.from(document.levels ?? []);
  if (levels.length !== 1 || levels[0].background?.src) return null;
  const expected = source.levels.find(level => level._id === source.initialLevel);
  if (!expected?.background?.src) return null;
  return { _id: levels[0].id ?? levels[0]._id,
    "background.src": expected.background.src,
    textures: structuredClone(expected.textures) };
}

export async function repairDocuments(sources, { pack, scenes }) {
  const result = { compendium: 0, world: 0 };
  // Change embedded Levels through Foundry's API, never rewrite a live DB.
  // Preserve the exact lock override (including an inherited default).
  if (pack) {
    const documents = await pack.getDocuments();
    const pending = documents.map(document => ({ document,
      update: backgroundRepair(document, matchingSource(document, sources)) })).filter(p => p.update);
    if (pending.length) {
      const previousLock = pack.config?.locked;
      const unlock = pack.locked;
      try {
        if (unlock) await pack.configure({ locked: false });
        for (const { document, update } of pending) {
          await document.updateEmbeddedDocuments("Level", [update], { pack: pack.collection });
          result.compendium++;
        }
      } finally {
        if (unlock) await pack.configure({ locked: previousLock });
      }
    }
  }
  for (const document of scenes) {
    const update = backgroundRepair(document, matchingSource(document, sources));
    if (!update) continue;
    await document.updateEmbeddedDocuments("Level", [update]);
    result.world++;
  }
  return result;
}

export async function repairCaravanBackgrounds() {
  if (!game.user?.isGM) throw new Error("Only a GM can repair caravan backgrounds.");
  const sources = await Promise.all(SLUGS.map(async slug => {
    const response = await fetch(`modules/${MODULE_ID}/content/scenes/${slug}.json`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Cannot read caravan scene ${slug}: HTTP ${response.status}`);
    const source = await response.json();
    const image = source.levels?.[0]?.background?.src;
    if (!image?.startsWith(`modules/${MODULE_ID}/assets/maps/`)) throw new Error("Invalid caravan map asset path.");
    const check = await fetch(image, { method: "HEAD", cache: "no-store" });
    if (!check.ok || !check.headers.get("content-type")?.startsWith("image/")) throw new Error(`Map image unavailable: ${image}`);
    return source;
  }));
  const result = await repairDocuments(sources, { pack: game.packs.get(PACK_ID), scenes: game.scenes });
  if (result.compendium || result.world) ui.notifications.info(`Caravan backgrounds repaired: ${result.compendium} compendium, ${result.world} world scene(s).`);
  return result;
}

if (globalThis.Hooks) Hooks.once("ready", async () => {
  const module = game.modules.get(MODULE_ID);
  module.api ??= {};
  module.api.repairCaravanBackgrounds = repairCaravanBackgrounds;
  // One active GM performs this idempotent repair; no player-side writes.
  const gm = game.users.activeGM ?? game.users.find(user => user.active && user.isGM);
  if (!game.user?.isGM || gm?.id !== game.user.id) return;
  try { await repairCaravanBackgrounds(); }
  catch (error) {
    console.error(`${MODULE_ID}: caravan background repair failed`, error);
    ui.notifications.error(`Caravan background repair failed: ${error.message}`);
  }
});
