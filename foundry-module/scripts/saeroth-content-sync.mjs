const MODULE_ID = "saeroth-pf2e-content";
const SYNC_PACK = "world.saeroth-synced-creatures";
const CONTENT_URL = "https://raw.githubusercontent.com/Milec/Towers-of-Saeroth/main/foundry-module/content/saeroth-creatures.json";

function rootElement(html) {
  return html instanceof HTMLElement ? html : html?.[0] ?? null;
}

function notify(message, type = "info") {
  ui.notifications[type](`${MODULE_ID}: ${message}`);
}

async function syncedPack() {
  let pack = game.packs.get(SYNC_PACK);
  if (pack) return pack;
  const collection = foundry.documents.collections.CompendiumCollection;
  pack = await collection.createCompendium({
    type: "Actor",
    package: "world",
    name: "saeroth-synced-creatures",
    label: "Saeroth Synced Creatures",
  });
  await pack.configure({ locked: false });
  return pack;
}

function actorData(source) {
  const data = foundry.utils.deepClone(source);
  const items = data.__items ?? [];
  delete data.__items;
  delete data.items;
  delete data._id;
  for (const item of items) delete item._id;
  // Let Foundry supply current defaults rather than copying old module-pack
  // token schema fields into a live world document.
  delete data.prototypeToken?.depth;
  return { data, items };
}

async function replaceItems(actor, items) {
  if (actor.items.size) await actor.deleteEmbeddedDocuments("Item", actor.items.map((item) => item.id));
  if (items.length) await actor.createEmbeddedDocuments("Item", items);
}

async function syncContent() {
  if (!game.user.isGM) return notify("Only a GM can synchronize campaign content.", "warn");
  const button = document.querySelector(".saeroth-content-sync-button");
  if (button) button.disabled = true;
  try {
    const response = await fetch(CONTENT_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`GitHub returned ${response.status}.`);
    const manifest = await response.json();
    if (manifest?.schema !== 1 || !Array.isArray(manifest.actors)) throw new Error("The repository content manifest is invalid.");
    const pack = await syncedPack();
    const existing = await pack.getDocuments();
    const byKey = new Map(existing.map((actor) => [actor.getFlag("saeroth", "syncKey"), actor]));
    let created = 0;
    let updated = 0;
    for (const source of manifest.actors) {
      const key = source?.flags?.saeroth?.syncKey;
      if (!key) continue;
      const { data, items } = actorData(source);
      const previous = byKey.get(key);
      if (previous) {
        await previous.update(data);
        await replaceItems(previous, items);
        updated += 1;
      } else {
        const actor = await Actor.create(data, { pack: pack.collection });
        await replaceItems(actor, items);
        created += 1;
      }
    }
    pack.render(true);
    notify(`Sync complete — ${created} created, ${updated} updated.`);
  } catch (error) {
    console.error(`${MODULE_ID}: content sync failed`, error);
    notify(`Sync failed: ${error.message}`, "error");
  } finally {
    if (button) button.disabled = false;
  }
}

Hooks.on("renderActorDirectory", (_app, html) => {
  if (!game.user.isGM) return;
  const root = rootElement(html);
  if (!root || root.querySelector(".saeroth-content-sync-button")) return;
  const button = document.createElement("button");
  button.className = "saeroth-content-sync-button";
  button.type = "button";
  button.innerHTML = '<i class="fas fa-cloud-arrow-down"></i> Sync Saeroth Content';
  button.addEventListener("click", () => void syncContent());
  const footer = root.querySelector(".directory-footer, footer");
  (footer ?? root).append(button);
});

Hooks.once("ready", () => {
  game.saerothContent ??= {};
  game.saerothContent.sync = syncContent;
});
