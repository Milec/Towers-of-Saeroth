const MODULE_ID = "saeroth-pf2e-content";
const HUNGER_FLAG = "sanguinorHunger";
const EFFECTS = {
  fed: {
    slug: "fed",
    uuid: "Compendium.saeroth-pf2e-content.saeroth-sanguinor-effects.Item._nJ0caqSSSyRxx6P",
  },
  unfed: {
    slug: "unfed",
    uuid: "Compendium.saeroth-pf2e-content.saeroth-sanguinor-effects.Item.VQO3iAywKPpd8uU8",
  },
  redThirst: {
    slug: "red-thirst",
    uuid: "Compendium.saeroth-pf2e-content.saeroth-sanguinor-effects.Item.mJAGdb7KRaWAONyX",
  },
};

function isSanguinor(actor) {
  return Boolean(actor?.itemTypes?.ancestry?.some((item) => item.slug === "sanguinor"));
}

function findEffect(actor, slug) {
  return actor.itemTypes?.effect?.find((item) => item.slug === slug);
}

async function addEffect(actor, effect) {
  if (findEffect(actor, effect.slug)) return;
  const source = await fromUuid(effect.uuid);
  if (!source) {
    console.warn(`${MODULE_ID}: could not resolve ${effect.uuid}`);
    return;
  }
  const data = source.toObject();
  delete data._id;
  await actor.createEmbeddedDocuments("Item", [data]);
}

async function removeEffect(actor, slug) {
  const effect = findEffect(actor, slug);
  if (effect) await effect.delete();
}

async function syncHunger(actor, state, { combat = false } = {}) {
  await removeEffect(actor, state === "fed" ? EFFECTS.unfed.slug : EFFECTS.fed.slug);
  await addEffect(actor, EFFECTS[state]);
  if (state === "fed") await removeEffect(actor, EFFECTS.redThirst.slug);
  if (combat && state === "unfed") await addEffect(actor, EFFECTS.redThirst);
}

function sheetRoot(html) {
  return html instanceof HTMLElement ? html : html?.[0] ?? null;
}

Hooks.on("renderActorSheetPF2e", (app, html) => {
  const actor = app.actor;
  if (!isSanguinor(actor)) return;
  const root = sheetRoot(html);
  const actionsTab = root?.querySelector('[data-tab="actions"]');
  if (!actionsTab || actionsTab.querySelector(".saeroth-hunger-tracker")) return;

  const state = actor.getFlag(MODULE_ID, HUNGER_FLAG) === "fed" ? "fed" : "unfed";
  const tracker = document.createElement("section");
  tracker.className = "saeroth-hunger-tracker";
  tracker.innerHTML = `
    <label for="saeroth-sanguinor-hunger">
      <span class="saeroth-hunger-title">Sanguinor Hunger</span>
      <select id="saeroth-sanguinor-hunger" name="saeroth-sanguinor-hunger">
        <option value="fed">Fed</option>
        <option value="unfed">Unfed</option>
      </select>
    </label>
    <p>Unfed Sanguinors gain Red Thirst when combat starts.</p>`;
  const select = tracker.querySelector("select");
  select.value = state;
  select.addEventListener("change", async (event) => {
    const next = event.currentTarget.value === "fed" ? "fed" : "unfed";
    await actor.setFlag(MODULE_ID, HUNGER_FLAG, next);
    await syncHunger(actor, next);
  });
  actionsTab.prepend(tracker);
});

Hooks.on("combatStart", async (combat) => {
  for (const combatant of combat.combatants) {
    const actor = combatant.actor;
    if (!isSanguinor(actor)) continue;
    const state = actor.getFlag(MODULE_ID, HUNGER_FLAG) === "fed" ? "fed" : "unfed";
    await syncHunger(actor, state, { combat: true });
  }
});
