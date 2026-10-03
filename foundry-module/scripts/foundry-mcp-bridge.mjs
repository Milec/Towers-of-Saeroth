/**
 * A GM-only client for the local Foundry MCP relay.
 *
 * Foundry modules run in a browser client and cannot register server routes.
 * This client therefore opens an outbound, loopback-only WebSocket to the
 * companion MCP process. The process never exposes Foundry to the network.
 */

const MODULE_ID = "saeroth-pf2e-content";
const RETRY_DELAY_MS = 5_000;
const MAX_RESULTS = 100;
const MAX_OPERATIONS = 50;
const ALLOWED_DOCUMENT_TYPES = new Set([
  "Actor", "Item", "Scene", "JournalEntry", "RollTable",
]);

let socket;
let retryTimer;
let requestQueue = Promise.resolve();
const operations = new Map();

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "mcpBridgeEnabled", {
    name: "Enable local MCP bridge",
    hint: "Lets a locally running MCP server interact with this world through an authenticated GM client.",
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
    restricted: true,
    onChange: reconnect,
  });

  game.settings.register(MODULE_ID, "mcpBridgePort", {
    name: "Local MCP bridge port",
    hint: "Must match FOUNDRY_MCP_PORT in the companion MCP process. The default is 32123.",
    scope: "client",
    config: true,
    type: Number,
    default: 32123,
    range: { min: 1024, max: 65535, step: 1 },
    restricted: true,
    onChange: reconnect,
  });

  game.settings.register(MODULE_ID, "mcpBridgeToken", {
    scope: "world", config: false, type: String, default: "", restricted: true,
  });
  game.settings.register(MODULE_ID, "mcpBridgeLocalToken", {
    name: "Local MCP bridge token",
    hint: "A long random token shared with the companion MCP process. Treat it like a password.",
    scope: "client",
    config: true,
    type: String,
    default: "",
    restricted: true,
    onChange: reconnect,
  });
});

Hooks.once("ready", async () => {
  if (!game.user.isGM) return;
  // Never migrate a potentially disclosed world token into private storage.
  if (game.settings.get(MODULE_ID, "mcpBridgeToken")) {
    await game.settings.set(MODULE_ID, "mcpBridgeEnabled", false);
    await game.settings.set(MODULE_ID, "mcpBridgeLocalToken", "");
    await game.settings.set(MODULE_ID, "mcpBridgeToken", "");
    ui.notifications.warn("Saeroth MCP: the old shared token was cleared. Generate a NEW token in both the relay and this GM browser before enabling the bridge.");
    return;
  }
  connect();
});

function enabled() {
  return game.user?.isGM && game.settings.get(MODULE_ID, "mcpBridgeEnabled");
}

function reconnect() {
  clearTimeout(retryTimer);
  const previous = socket;
  socket = undefined;
  previous?.close();
  if (game.ready) connect();
}

function bridgeConfiguration() {
  const token = game.settings.get(MODULE_ID, "mcpBridgeLocalToken").trim();
  const port = Number(game.settings.get(MODULE_ID, "mcpBridgePort"));
  return { token, port };
}

function connect() {
  if (!enabled()) return;
  const { token, port } = bridgeConfiguration();
  if (token.length < 24 || !Number.isInteger(port) || port < 1024 || port > 65535) {
    ui.notifications.warn("Saeroth MCP needs a new random token of at least 24 characters and a valid port in Module Settings.");
    return;
  }

  if (socket) return;
  const peer = new WebSocket(`ws://127.0.0.1:${port}/foundry-mcp?token=${encodeURIComponent(token)}`);
  socket = peer;
  peer.addEventListener("open", () => {
    if (peer !== socket || !enabled()) return peer.close();
    send({
      kind: "hello",
      world: game.world.id,
      worldTitle: game.world.title,
      foundryVersion: game.version,
      system: { id: game.system.id, version: game.system.version },
      user: { id: game.user.id, name: game.user.name, isGM: true },
    }, peer);
    console.info(`${MODULE_ID} | Connected to local MCP bridge.`);
  });
  peer.addEventListener("message", (event) => {
    requestQueue = requestQueue.then(async () => {
      try {
        if (peer !== socket || !enabled()) throw new Error("The GM bridge is no longer enabled in this client.");
        const request = JSON.parse(event.data);
        if (request.kind !== "request" || !request.id || !request.tool) return;
        const result = await execute(request.tool, request.args ?? {});
        send({ kind: "response", id: request.id, ok: true, result }, peer);
      } catch (error) {
        console.error(`${MODULE_ID} | MCP request failed`, error);
        send({
          kind: "response",
          id: safeRequestId(event.data),
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          recovery: error.recovery,
        }, peer);
      }
    });
  });
  peer.addEventListener("close", () => {
    if (peer !== socket) return;
    socket = undefined;
    clearTimeout(retryTimer);
    if (enabled()) retryTimer = setTimeout(connect, RETRY_DELAY_MS);
  });
  peer.addEventListener("error", () => peer.close());
}

function safeRequestId(data) {
  try {
    return JSON.parse(data).id;
  } catch {
    return null;
  }
}

function send(payload, peer = socket) {
  if (peer?.readyState === WebSocket.OPEN) peer.send(JSON.stringify(payload));
}

function assertType(type) {
  if (!ALLOWED_DOCUMENT_TYPES.has(type)) {
    throw new Error(`Unsupported document type: ${type}`);
  }
}

function worldCollection(type) {
  assertType(type);
  const collections = {
    Actor: game.actors,
    Item: game.items,
    Scene: game.scenes,
    JournalEntry: game.journal,
    RollTable: game.tables,
  };
  return collections[type];
}

function documentSummary(document) {
  return {
    uuid: document.uuid,
    id: document.id,
    name: document.name,
    type: document.type,
    documentName: document.documentName,
    img: document.img,
    pack: document.pack ?? null,
  };
}

function sceneBuildSummary(scene) {
  return {
    scene: documentSummary(scene),
    levels: scene.levels.size,
    walls: scene.walls.size,
    lights: scene.lights.size,
    tiles: scene.tiles.size,
    drawings: scene.drawings.size,
    notes: scene.notes.size,
    sounds: scene.sounds.size,
    regions: scene.regions.size,
    tokens: scene.tokens.size,
  };
}

const SCENE_COLLECTIONS = ["levels", "walls", "lights", "tiles", "drawings", "notes", "sounds", "regions", "tokens"];
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function sceneTokenLevels(source) {
  const level = source.initialLevel ?? source.levels?.[0]?._id;
  if (!level || !Array.isArray(source.tokens)) return source;
  return {...source, tokens: source.tokens.map(token => isObject(token)
    ? {...token, level: token.level ?? level} : token)};
}

async function buildScene(args) {
  const preview = await previewScene(args);
  if (!preview.valid) throw new Error(`Scene validation failed: ${preview.errors.join("; ")}`);
  return createOperation(`Create scene ${args.scene.name}`, async (track) => {
    // Explicitly keep embedded IDs: walls and placeables reference level IDs.
    const scene = track(await Scene.create({ ...sceneTokenLevels(args.scene), active: false }, { keepEmbeddedIds: true }));
    if (args.activate === true) await scene.activate();
    return { ...sceneBuildSummary(scene), warnings: preview.warnings };
  });
}

async function previewScene(args) {
  const source = args.scene;
  const errors = [];
  const warnings = [];
  const result = () => ({valid: errors.length === 0, errors, warnings,
    counts: Object.fromEntries(SCENE_COLLECTIONS.map(key => [key, Array.isArray(source?.[key]) ? source[key].length : 0]))});
  if (!isObject(source)) {
    errors.push("scene must be an object containing a Foundry Scene source.");
    return result();
  }
  const {width, height} = source;
  if (typeof source.name !== "string" || !source.name.trim()) errors.push("scene.name is required.");
  if (!Number.isInteger(width) || width <= 0) errors.push("scene.width must be a positive integer.");
  if (!Number.isInteger(height) || height <= 0) errors.push("scene.height must be a positive integer.");
  for (const property of SCENE_COLLECTIONS) {
    const values = source[property];
    if (values === undefined) continue;
    if (!Array.isArray(values)) { errors.push(`scene.${property} must be an array.`); continue; }
    const ids = new Set();
    for (const [index, value] of values.entries()) {
      if (!isObject(value)) { errors.push(`${property}[${index}] must be an object.`); continue; }
      if (value._id !== undefined) {
        if (typeof value._id !== "string" || !/^[a-zA-Z0-9]{16}$/.test(value._id)) errors.push(`${property}[${index}] has an invalid ID.`);
        if (ids.has(value._id)) errors.push(`${property}[${index}] duplicates an ID.`);
        ids.add(value._id);
      }
    }
  }
  // Do not iterate malformed collections or let schema cleaning hide bad shapes.
  if (errors.length) return result();
  const levels = source.levels ?? [];
  const levelIds = new Set(levels.map((level) => level._id).filter(Boolean));
  if (!levels.length) warnings.push("The scene has no explicit levels or background image.");
  if (source.initialLevel && !levelIds.has(source.initialLevel)) errors.push("initialLevel references a missing level.");
  const assets = new Map();
  const checkAsset = async (asset, label) => {
    if (!asset) return;
    if (typeof asset !== "string") { errors.push(`${label} must be a path string.`); return; }
    if (!assets.has(asset)) assets.set(asset, (async () => {
      try {
        const url = new URL(asset, document.baseURI);
        if (!["http:", "https:"].includes(url.protocol)) return false;
        let response = await fetch(url, {method: "HEAD", signal: AbortSignal.timeout(5000)});
        if (response.status === 405) {
          response = await fetch(url, {headers: {Range: "bytes=0-0"}, signal: AbortSignal.timeout(5000)});
          await response.body?.cancel();
        }
        return response.ok;
      } catch { return false; }
    })());
    if (!await assets.get(asset)) errors.push(`${label} is unavailable or could not be verified: ${asset}`);
  };
  const assetChecks = levels.map((level, index) => {
    if (!level.background?.src) warnings.push(`levels[${index}] has no background image.`);
    return checkAsset(level.background?.src, `levels[${index}] background`);
  });
  const pointIsValid = (x, y, label) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) errors.push(`${label} needs numeric coordinates.`);
    else if (Number.isFinite(width) && Number.isFinite(height) && (x < 0 || y < 0 || x > width || y > height)) {
      warnings.push(`${label} is outside the scene bounds.`);
    }
  };
  for (const [index, wall] of (source.walls ?? []).entries()) {
    if (!Array.isArray(wall.c) || wall.c.length !== 4) errors.push(`walls[${index}].c must contain four coordinates.`);
    else {
      pointIsValid(wall.c[0], wall.c[1], `walls[${index}] start`);
      pointIsValid(wall.c[2], wall.c[3], `walls[${index}] end`);
    }
  }
  for (const property of SCENE_COLLECTIONS.filter(key => key !== "levels")) {
    for (const [index, entry] of (source[property] ?? []).entries()) {
      const label = `${property}[${index}]`;
      if (!["walls", "regions"].includes(property)) pointIsValid(entry.x, entry.y, label);
      if (entry.levels !== undefined && !Array.isArray(entry.levels)) errors.push(`${label}.levels must be an array.`);
      else if (entry.levels?.some(id => !levelIds.has(id))) errors.push(`${label} references a missing level.`);
      if (property === "tokens") {
        // Tokens use one `level`, unlike walls/lights which use `levels`.
        if (entry.levels !== undefined) errors.push(`${label} must use singular level, not levels.`);
        const level = entry.level ?? source.initialLevel ?? levels[0]?._id;
        if (level !== undefined && (typeof level !== "string" || !/^[a-zA-Z0-9]{16}$/.test(level)
          || (levels.length && !levelIds.has(level)))) errors.push(`${label} references a missing or invalid token level.`);
        if (entry.actorId && !game.actors.get(entry.actorId)) errors.push(`${label} references a missing world Actor.`);
        const size = source.grid?.size ?? 100;
        if (entry.x + (entry.width ?? 1) * size > width || entry.y + (entry.height ?? 1) * size > height) {
          warnings.push(`${label} footprint extends outside the scene bounds.`);
        }
      }
      assetChecks.push(checkAsset(entry.texture?.src, `${label} texture`));
      if (property === "sounds") assetChecks.push(checkAsset(entry.path, `${label} audio`));
    }
  }
  // Constructing and validating a transient Document does not persist it or run
  // create hooks. This applies the installed Foundry/system schema, including lights.
  try {
    const SceneClass = getDocumentClass("Scene");
    const candidate = new SceneClass(structuredClone(sceneTokenLevels(source)), {strict: true});
    candidate.validate({strict: true});
  } catch (error) { errors.push(`Foundry schema: ${error.message}`); }
  await Promise.all(assetChecks);
  return result();
}

async function findDocument(uuid) {
  const document = await fromUuid(uuid);
  if (!document || !ALLOWED_DOCUMENT_TYPES.has(document.documentName)) {
    throw new Error(`No supported document found for UUID: ${uuid}`);
  }
  return document;
}

function remember(operation) {
  const id = crypto.randomUUID();
  operations.set(id, { ...operation, createdAt: new Date().toISOString() });
  while (operations.size > MAX_OPERATIONS) operations.delete(operations.keys().next().value);
  return id;
}

function snapshot(document) {
  const clean = value => Array.isArray(value) ? value.map(clean) : isObject(value)
    ? Object.fromEntries(Object.entries(value).filter(([key]) => key !== "_stats").map(([key, child]) => [key, clean(child)])) : value;
  return clean(document.toObject());
}

function equal(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => equal(v, b[i]));
  if (!isObject(a) || !isObject(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && equal(a[key], b[key]));
}

function changesBetween(before, after, path = []) {
  const changes = [];
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (key === "_stats" || key === "_id") continue;
    const prior = before[key], next = after[key], parts = [...path, key];
    if (equal(prior, next)) continue;
    if (isObject(prior) && isObject(next)) changes.push(...changesBetween(prior, next, parts));
    else changes.push({path: parts, before: structuredClone(prior), after: structuredClone(next)});
  }
  return changes;
}

async function unlocked(document, work) {
  const pack = document.pack ? game.packs.get(document.pack) : null;
  const locked = pack?.locked;
  if (locked) await pack.configure({locked: false});
  try { return await work(); }
  finally { if (locked) await pack.configure({locked: true}); }
}

async function createOperation(label, work) {
  const created = [];
  const track = document => {
    if (!document?.uuid) throw new Error("Foundry did not create the requested document.");
    created.push(document);
    return document;
  };
  try {
    const result = await work(track);
    const entries = created.map(document => ({uuid: document.uuid, after: snapshot(document)}));
    return {...result, operationId: remember({kind: "create", label, entries})};
  } catch (error) {
    const remaining = [];
    for (const document of [...created].reverse()) {
      try { await unlocked(document, () => document.delete()); }
      catch { remaining.unshift({uuid: document.uuid, after: snapshot(document)}); }
    }
    if (remaining.length) {
      error.recovery = {operationId: remember({kind: "create", label: `Clean up failed ${label}`, entries: remaining}),
        uuids: remaining.map(entry => entry.uuid)};
      error.message += ` Cleanup incomplete; recovery operation: ${error.recovery.operationId}.`;
    }
    throw error;
  }
}

async function updateOperation(document, changes, label) {
  // Foundry merges embedded arrays by ID, not as replaceable JSON arrays.
  // Reject those here instead of promising an inverse that cannot restore them.
  const embedded = new Set(Object.values(document.constructor.metadata?.embedded ?? {}));
  for (const key of Object.keys(changes)) {
    const root = key.split(".")[0].replace(/^[-=]+/, "");
    if (["_id", "_stats"].includes(root) || embedded.has(root)) {
      throw new Error(`Updates to ${root} are not supported by reversible document updates. Use a dedicated creation/asset tool.`);
    }
  }
  const before = snapshot(document);
  await document.update(changes);
  const fields = changesBetween(before, snapshot(document));
  return {document: documentSummary(document), operationId: remember({kind: "update", label, uuid: document.uuid, fields})};
}

async function undoOperation(operationId) {
  const operation = operations.get(operationId);
  if (!operation) throw new Error("That operation is unavailable. Undo history resets when the GM client reloads.");
  if (operation.kind === "create") {
    const targets = [];
    // Preflight everything before deleting anything. Don't destroy later work.
    for (const entry of operation.entries) {
      const document = await fromUuid(entry.uuid);
      if (!document) continue;
      if (!equal(snapshot(document), entry.after)) throw new Error(`Undo conflict: ${document.name ?? entry.uuid} was edited after creation.`);
      targets.push(document);
    }
    for (const document of targets.reverse()) await unlocked(document, () => document.delete());
  } else {
    const document = await fromUuid(operation.uuid);
    if (!document) throw new Error("The original document no longer exists.");
    const current = snapshot(document);
    const inverse = {};
    for (const field of operation.fields) {
      const value = field.path.reduce((object, key) => object?.[key], current);
      if (!equal(value, field.after)) throw new Error(`Undo conflict: ${field.path.join(".")} was edited after this operation.`);
      const {ForcedDeletion, ForcedReplacement} = foundry.data.operators;
      inverse[field.path.join(".")] = field.before === undefined
        ? new ForcedDeletion() : new ForcedReplacement(field.before);
    }
    if (Object.keys(inverse).length) await unlocked(document, () => document.update(inverse));
  }
  operations.delete(operationId);
  return { undone: operation.label };
}

async function findWorldScene(uuid) {
  const scene = await findDocument(uuid);
  if (scene.documentName !== "Scene" || scene.pack) {
    throw new Error("Placeable content must target an imported world Scene, not a compendium Scene.");
  }
  return scene;
}

function sourceWithoutId(document) {
  const source = document.toObject();
  delete source._id;
  return source;
}

async function resolveActor(actorUuid, track) {
  const source = await fromUuid(actorUuid);
  if (!source || source.documentName !== "Actor") throw new Error(`No Actor found for UUID: ${actorUuid}`);
  if (!source.pack) return { actor: source, imported: false };
  const actor = track(await Actor.create(sourceWithoutId(source)));
  return { actor, imported: true };
}

function validatePlacement(placement) {
  if (!isObject(placement) || !Number.isFinite(placement.x) || !Number.isFinite(placement.y)) {
    throw new Error("Token placement requires numeric x and y scene coordinates.");
  }
}

function placementLevel(scene, placement) {
  validatePlacement(placement);
  if (placement.levels !== undefined) throw new Error("Token placement must use singular level, not levels.");
  // v14's Scene getter returns a SceneLevel document, not its source ID.
  const level = placement.level ?? scene.initialLevel?.id ?? scene.initialLevel ?? scene.levels?.keys().next().value;
  if (level !== undefined && (typeof level !== "string" || !/^[a-zA-Z0-9]{16}$/.test(level)
    || !scene.levels.has(level))) throw new Error(`No Scene Level found for token placement: ${level}`);
  return level;
}

function positionedToken(scene, actor, placement) {
  const level = placementLevel(scene, placement);
  const token = actor.prototypeToken.toObject();
  delete token._id;
  return foundry.utils.mergeObject(token, { ...placement, ...(level ? {level} : {}), actorId: actor.id, actorLink: false }, { inplace: false, recursive: true });
}

async function placeActor(scene, actorUuid, tokenData, track) {
  const { actor, imported } = await resolveActor(actorUuid, track);
  const [token] = await scene.createEmbeddedDocuments("Token", [positionedToken(scene, actor, tokenData)]);
  track(token);
  return { actor, token, imported };
}

async function itemSource(value) {
  if (value?.uuid) {
    const item = await fromUuid(value.uuid);
    if (!item || item.documentName !== "Item") throw new Error(`No Item found for UUID: ${value.uuid}`);
    return sourceWithoutId(item);
  }
  if (!value || typeof value !== "object" || Array.isArray(value) || !value.name || !value.type) {
    throw new Error("Each item must be a native Item source with name and type, or an object with an Item UUID.");
  }
  return value;
}

async function placeLoot(args) {
  const scene = await findWorldScene(args.sceneUuid);
  if (!args.name?.trim()) throw new Error("A loot or container name is required.");
  placementLevel(scene, args.token);
  const items = await Promise.all((args.items ?? []).map(itemSource));
  return createOperation(`Place loot ${args.name}`, async (track) => {
    const actor = track(await Actor.create({
      ...args.actorData,
      name: args.name.trim(),
      type: "loot",
      img: args.img ?? "icons/containers/chest/worn-chest-brown.webp",
    }));
    if (items.length) await actor.createEmbeddedDocuments("Item", items);
    const [token] = await scene.createEmbeddedDocuments("Token", [positionedToken(scene, actor, args.token)]);
    track(token);
    return {
      actor: documentSummary(actor),
      token: documentSummary(token),
      itemCount: items.length,
    };
  });
}

async function setupEncounter(args) {
  const scene = await findWorldScene(args.sceneUuid);
  if (!Array.isArray(args.participants) || !args.participants.length) throw new Error("At least one encounter participant is required.");
  // Resolve every participant and validate every placement before the first write.
  for (const participant of args.participants) {
    placementLevel(scene, participant?.token);
    const actor = await fromUuid(participant.actorUuid);
    if (!actor || actor.documentName !== "Actor") throw new Error(`No Actor found for UUID: ${participant.actorUuid}`);
  }
  return createOperation(`Set up encounter in ${scene.name}`, async (track) => {
    const placed = [];
    for (const participant of args.participants) {
      const result = await placeActor(scene, participant.actorUuid, participant.token, track);
      placed.push({ actor: documentSummary(result.actor), token: documentSummary(result.token), name: participant.name ?? result.actor.name });
    }
    const combat = track(await Combat.create({ scene: scene.id, active: true }));
    const combatants = await combat.createEmbeddedDocuments("Combatant", placed.map((entry) => ({
      tokenId: entry.token.id,
      actorId: entry.actor.id,
      name: entry.name,
    })));
    if (args.rollInitiative === true) await combat.rollInitiative(combatants.map((combatant) => combatant.id));
    if (args.startCombat === true) await combat.startCombat();
    return {
      combat: documentSummary(combat),
      participants: placed,
      started: combat.started,
    };
  });
}

async function createLocationNote(args) {
  const scene = await findWorldScene(args.sceneUuid);
  if (!args.name?.trim()) throw new Error("A location note name is required.");
  if (!Number.isFinite(args.x) || !Number.isFinite(args.y)) throw new Error("Location notes require numeric x and y scene coordinates.");
  return createOperation(`Create location note ${args.name}`, async (track) => {
    const entry = track(await JournalEntry.create({
      name: args.name.trim(),
      pages: [{ name: args.name.trim(), type: "text", text: { content: args.content ?? "" } }],
    }));
    const [note] = await scene.createEmbeddedDocuments("Note", [{
      entryId: entry.id,
      pageId: entry.pages.contents[0]?.id,
      x: args.x,
      y: args.y,
      texture: {src: args.icon ?? "icons/svg/book.svg"},
      iconSize: args.iconSize ?? 32,
      text: args.label ?? entry.name,
    }]);
    track(note);
    return {journal: documentSummary(entry), note: documentSummary(note)};
  });
}

async function publishToCompendium(args) {
  const document = await findDocument(args.uuid);
  const pack = game.packs.get(args.pack);
  if (!pack) throw new Error(`No compendium pack found: ${args.pack}`);
  if (pack.documentName !== document.documentName) throw new Error(`Pack ${args.pack} does not accept ${document.documentName} documents.`);
  return createOperation(`Publish ${document.name} to ${pack.title}`, async (track) =>
    unlocked({pack: args.pack}, async () => {
      const imported = track(await pack.importDocument(document));
      return {document: documentSummary(imported)};
    }));
}

async function assignAsset(args) {
  const target = args.target;
  if (target === "actorPortrait" || target === "actorToken") {
    const actor = await findDocument(args.uuid);
    if (actor.documentName !== "Actor") throw new Error("Actor asset targets require an Actor UUID.");
    return updateOperation(actor, target === "actorPortrait" ? { img: args.assetPath } : { "prototypeToken.texture.src": args.assetPath }, `Assign ${target} for ${actor.name}`);
  }
  if (target === "sceneLevelBackground") {
    const scene = await findWorldScene(args.uuid);
    const level = scene.levels.get(args.levelId);
    if (!level) throw new Error(`No Scene Level found: ${args.levelId}`);
    return updateOperation(level, { "background.src": args.assetPath }, `Assign background for ${scene.name}`);
  }
  throw new Error(`Unknown asset target: ${target}`);
}

async function execute(tool, args) {
  if (!game.user?.isGM) throw new Error("Only an authenticated GM can execute bridge tools.");
  switch (tool) {
    case "status":
      return {
        world: { id: game.world.id, title: game.world.title },
        foundryVersion: game.version,
        system: { id: game.system.id, version: game.system.version },
        user: { id: game.user.id, name: game.user.name, isGM: game.user.isGM },
        connectedAt: new Date().toISOString(),
      };

    case "list_documents": {
      assertType(args.type);
      const limit = Math.min(Math.max(Number(args.limit) || 50, 1), MAX_RESULTS);
      return worldCollection(args.type).contents.slice(0, limit).map(documentSummary);
    }

    case "search_documents": {
      const query = String(args.query ?? "").trim().toLocaleLowerCase();
      if (!query) throw new Error("A search query is required.");
      const requestedTypes = args.types?.length ? args.types : [...ALLOWED_DOCUMENT_TYPES];
      const types = requestedTypes.filter((type) => ALLOWED_DOCUMENT_TYPES.has(type));
      const matches = types.flatMap((type) => worldCollection(type).contents
        .filter((document) => document.name.toLocaleLowerCase().includes(query))
        .map(documentSummary));
      return matches.slice(0, MAX_RESULTS);
    }

    case "get_document": {
      const document = await findDocument(args.uuid);
      return document.toObject();
    }

    case "create_document": {
      assertType(args.type);
      if (!args.name?.trim()) throw new Error("A document name is required.");
      const DocumentClass = getDocumentClass(args.type);
      if (args.type === "Scene") return buildScene({scene: {...args.data, name: args.name.trim()}});
      return createOperation(`Create ${args.name}`, async (track) => {
        const document = track(await DocumentClass.create({
          ...args.data,
          name: args.name.trim(),
        }));
        return {document: documentSummary(document)};
      });
    }

    case "preview_scene":
      return previewScene(args);

    case "build_scene":
      return buildScene(args);

    case "place_loot":
      return placeLoot(args);

    case "setup_encounter":
      return setupEncounter(args);

    case "create_location_note":
      return createLocationNote(args);

    case "publish_to_compendium":
      return publishToCompendium(args);

    case "assign_asset":
      return assignAsset(args);

    case "update_document": {
      if (!args.changes || typeof args.changes !== "object" || Array.isArray(args.changes)) {
        throw new Error("changes must be an object.");
      }
      const document = await findDocument(args.uuid);
      return updateOperation(document, args.changes, `Update ${document.name}`);
    }

    case "activate_scene": {
      const document = await findDocument(args.uuid);
      if (document.documentName !== "Scene") throw new Error("Only Scene documents can be activated.");
      await document.activate();
      return documentSummary(document);
    }

    case "delete_document": {
      if (args.confirm !== true) {
        throw new Error("Deletion requires confirm: true.");
      }
      const document = await findDocument(args.uuid);
      const summary = documentSummary(document);
      await document.delete();
      return { deleted: summary };
    }

    case "undo_operation":
      return undoOperation(args.operationId);

    default:
      throw new Error(`Unknown MCP tool: ${tool}`);
  }
}
