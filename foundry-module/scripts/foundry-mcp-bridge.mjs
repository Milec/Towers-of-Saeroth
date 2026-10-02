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
const operations = new Map();

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "mcpBridgeEnabled", {
    name: "Enable local MCP bridge",
    hint: "Lets a locally running MCP server interact with this world through an authenticated GM client.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    restricted: true,
  });

  game.settings.register(MODULE_ID, "mcpBridgePort", {
    name: "Local MCP bridge port",
    hint: "Must match FOUNDRY_MCP_PORT in the companion MCP process. The default is 32123.",
    scope: "world",
    config: true,
    type: Number,
    default: 32123,
    range: { min: 1024, max: 65535, step: 1 },
    restricted: true,
  });

  game.settings.register(MODULE_ID, "mcpBridgeToken", {
    name: "Local MCP bridge token",
    hint: "A long random token shared with the companion MCP process. Treat it like a password.",
    scope: "world",
    config: true,
    type: String,
    default: "",
    restricted: true,
  });
});

Hooks.once("ready", () => {
  if (!game.user.isGM || !game.settings.get(MODULE_ID, "mcpBridgeEnabled")) return;
  connect();
});

function bridgeConfiguration() {
  const token = game.settings.get(MODULE_ID, "mcpBridgeToken").trim();
  const port = Number(game.settings.get(MODULE_ID, "mcpBridgePort"));
  return { token, port };
}

function connect() {
  const { token, port } = bridgeConfiguration();
  if (!token) {
    ui.notifications.warn("Saeroth MCP bridge is enabled but has no token. Configure it in Module Settings.");
    return;
  }

  socket?.close();
  socket = new WebSocket(`ws://127.0.0.1:${port}/foundry-mcp?token=${encodeURIComponent(token)}`);
  socket.addEventListener("open", () => {
    send({
      kind: "hello",
      world: game.world.id,
      worldTitle: game.world.title,
      foundryVersion: game.version,
      system: { id: game.system.id, version: game.system.version },
      user: { id: game.user.id, name: game.user.name },
    });
    console.info(`${MODULE_ID} | Connected to local MCP bridge.`);
  });
  socket.addEventListener("message", async (event) => {
    try {
      const request = JSON.parse(event.data);
      if (request.kind !== "request" || !request.id || !request.tool) return;
      const result = await execute(request.tool, request.args ?? {});
      send({ kind: "response", id: request.id, ok: true, result });
    } catch (error) {
      console.error(`${MODULE_ID} | MCP request failed`, error);
      send({
        kind: "response",
        id: safeRequestId(event.data),
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
  socket.addEventListener("close", () => {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(connect, RETRY_DELAY_MS);
  });
  socket.addEventListener("error", () => socket.close());
}

function safeRequestId(data) {
  try {
    return JSON.parse(data).id;
  } catch {
    return null;
  }
}

function send(payload) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
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

function assertArrayProperty(source, property) {
  if (source[property] !== undefined && !Array.isArray(source[property])) {
    throw new Error(`scene.${property} must be an array when supplied.`);
  }
}

async function buildScene(args) {
  const source = args.scene;
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new Error("scene must be an object containing a Foundry Scene source.");
  }
  if (!source.name?.trim()) throw new Error("scene.name is required.");

  // These are Foundry's native Scene embedded-document collections. Keeping
  // them in the creation source preserves cross-references such as wall/light
  // levels and results in a fully configured scene instead of a blank canvas.
  for (const property of [
    "levels", "walls", "lights", "tiles", "drawings", "notes", "sounds", "regions", "tokens",
  ]) assertArrayProperty(source, property);

  const scene = await Scene.create(source);
  if (args.activate === true) await scene.activate();
  return {
    ...sceneBuildSummary(scene),
    operationId: recordCreateOperation(`Create scene ${scene.name}`, [scene.uuid]),
  };
}

async function previewScene(args) {
  const source = args.scene;
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new Error("scene must be an object containing a Foundry Scene source.");
  }
  const errors = [];
  const warnings = [];
  const width = Number(source.width);
  const height = Number(source.height);
  if (!source.name?.trim()) errors.push("scene.name is required.");
  if (!Number.isFinite(width) || width <= 0) errors.push("scene.width must be a positive number.");
  if (!Number.isFinite(height) || height <= 0) errors.push("scene.height must be a positive number.");
  for (const property of ["levels", "walls", "lights", "tiles", "drawings", "notes", "sounds", "regions", "tokens"]) {
    if (source[property] !== undefined && !Array.isArray(source[property])) errors.push(`scene.${property} must be an array.`);
  }
  const levels = source.levels ?? [];
  const levelIds = new Set(levels.map((level) => level._id).filter(Boolean));
  if (!levels.length) warnings.push("The scene has no explicit levels or background image.");
  for (const [index, level] of levels.entries()) {
    const path = level?.background?.src;
    if (!path) {
      warnings.push(`levels[${index}] has no background image.`);
      continue;
    }
    try {
      const response = await fetch(path, { method: "HEAD" });
      if (!response.ok) errors.push(`levels[${index}] background is unavailable: ${path}`);
    } catch {
      errors.push(`levels[${index}] background could not be checked: ${path}`);
    }
  }
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
  for (const property of ["lights", "tiles", "drawings", "notes", "sounds", "tokens"]) {
    for (const [index, document] of (source[property] ?? []).entries()) {
      pointIsValid(document.x, document.y, `${property}[${index}]`);
      if (levelIds.size && Array.isArray(document.levels) && document.levels.some((id) => !levelIds.has(id))) {
        errors.push(`${property}[${index}] references a missing level.`);
      }
    }
  }
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    counts: Object.fromEntries(["levels", "walls", "lights", "tiles", "drawings", "notes", "sounds", "regions", "tokens"]
      .map((property) => [property, (source[property] ?? []).length])),
  };
}

async function findDocument(uuid) {
  const document = await fromUuid(uuid);
  if (!document || !ALLOWED_DOCUMENT_TYPES.has(document.documentName)) {
    throw new Error(`No supported document found for UUID: ${uuid}`);
  }
  return document;
}

function recordCreateOperation(label, uuids) {
  const id = crypto.randomUUID();
  operations.set(id, { kind: "create", label, uuids, createdAt: new Date().toISOString() });
  while (operations.size > MAX_OPERATIONS) operations.delete(operations.keys().next().value);
  return id;
}

function recordUpdateOperation(label, uuid, before) {
  const id = crypto.randomUUID();
  operations.set(id, { kind: "update", label, uuid, before, createdAt: new Date().toISOString() });
  while (operations.size > MAX_OPERATIONS) operations.delete(operations.keys().next().value);
  return id;
}

async function undoOperation(operationId) {
  const operation = operations.get(operationId);
  if (!operation) throw new Error("That operation is unavailable. Undo history resets when the GM client reloads.");
  if (operation.kind === "create") {
    for (const uuid of [...operation.uuids].reverse()) {
      const document = await fromUuid(uuid);
      if (document) await document.delete();
    }
  } else {
    const document = await fromUuid(operation.uuid);
    if (!document) throw new Error("The original document no longer exists.");
    await document.update(operation.before);
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

async function resolveActor(actorUuid) {
  const source = await fromUuid(actorUuid);
  if (!source || source.documentName !== "Actor") throw new Error(`No Actor found for UUID: ${actorUuid}`);
  if (!source.pack) return { actor: source, imported: false };
  const actor = await Actor.create(sourceWithoutId(source));
  return { actor, imported: true };
}

function positionedToken(actor, placement) {
  if (!Number.isFinite(placement.x) || !Number.isFinite(placement.y)) {
    throw new Error("Token placement requires numeric x and y scene coordinates.");
  }
  const token = actor.prototypeToken.toObject();
  delete token._id;
  return foundry.utils.mergeObject(token, { ...placement, actorId: actor.id, actorLink: false }, { inplace: false, recursive: true });
}

async function placeActor(scene, actorUuid, tokenData) {
  const { actor, imported } = await resolveActor(actorUuid);
  const [token] = await scene.createEmbeddedDocuments("Token", [positionedToken(actor, tokenData)]);
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
  const items = await Promise.all((args.items ?? []).map(itemSource));
  const actor = await Actor.create({
    ...args.actorData,
    name: args.name.trim(),
    type: "loot",
    img: args.img ?? "icons/containers/chest/worn-chest-brown.webp",
  });
  if (items.length) await actor.createEmbeddedDocuments("Item", items);
  const [token] = await scene.createEmbeddedDocuments("Token", [positionedToken(actor, args.token ?? {})]);
  return {
    actor: documentSummary(actor),
    token: documentSummary(token),
    itemCount: items.length,
    operationId: recordCreateOperation(`Place loot ${actor.name}`, [actor.uuid, token.uuid]),
  };
}

async function setupEncounter(args) {
  const scene = await findWorldScene(args.sceneUuid);
  if (!Array.isArray(args.participants) || !args.participants.length) throw new Error("At least one encounter participant is required.");
  const createdUuids = [];
  const placed = [];
  for (const participant of args.participants) {
    const result = await placeActor(scene, participant.actorUuid, participant.token ?? {});
    placed.push({ actor: documentSummary(result.actor), token: documentSummary(result.token), name: participant.name ?? result.actor.name });
    createdUuids.push(result.token.uuid);
    if (result.imported) createdUuids.push(result.actor.uuid);
  }
  const combat = await Combat.create({ scene: scene.id, active: true });
  createdUuids.push(combat.uuid);
  const combatants = await combat.createEmbeddedDocuments("Combatant", placed.map((entry) => ({
    tokenId: entry.token.id,
    actorId: entry.actor.id,
    name: entry.name,
  })));
  if (args.rollInitiative === true) await combat.rollInitiative(combatants.map((combatant) => combatant.id));
  return {
    combat: documentSummary(combat),
    participants: placed,
    operationId: recordCreateOperation(`Set up encounter in ${scene.name}`, createdUuids),
  };
}

async function createLocationNote(args) {
  const scene = await findWorldScene(args.sceneUuid);
  if (!args.name?.trim()) throw new Error("A location note name is required.");
  if (!Number.isFinite(args.x) || !Number.isFinite(args.y)) throw new Error("Location notes require numeric x and y scene coordinates.");
  const entry = await JournalEntry.create({
    name: args.name.trim(),
    pages: [{ name: args.name.trim(), type: "text", text: { content: args.content ?? "" } }],
  });
  const [note] = await scene.createEmbeddedDocuments("Note", [{
    entryId: entry.id,
    pageId: entry.pages.contents[0]?.id,
    x: args.x,
    y: args.y,
    icon: args.icon ?? "icons/svg/book.svg",
    iconSize: args.iconSize ?? 32,
    text: args.label ?? entry.name,
  }]);
  return {
    journal: documentSummary(entry),
    note: documentSummary(note),
    operationId: recordCreateOperation(`Create location note ${entry.name}`, [entry.uuid, note.uuid]),
  };
}

async function publishToCompendium(args) {
  const document = await findDocument(args.uuid);
  const pack = game.packs.get(args.pack);
  if (!pack) throw new Error(`No compendium pack found: ${args.pack}`);
  if (pack.documentName !== document.documentName) throw new Error(`Pack ${args.pack} does not accept ${document.documentName} documents.`);
  const wasLocked = pack.locked;
  if (wasLocked) await pack.configure({ locked: false });
  try {
    const imported = await pack.importDocument(document);
    return {
      document: documentSummary(imported),
      operationId: recordCreateOperation(`Publish ${document.name} to ${pack.title}`, [imported.uuid]),
    };
  } finally {
    if (wasLocked) await pack.configure({ locked: true });
  }
}

async function assignAsset(args) {
  const target = args.target;
  if (target === "actorPortrait" || target === "actorToken") {
    const actor = await findDocument(args.uuid);
    if (actor.documentName !== "Actor") throw new Error("Actor asset targets require an Actor UUID.");
    const before = sourceWithoutId(actor);
    await actor.update(target === "actorPortrait" ? { img: args.assetPath } : { "prototypeToken.texture.src": args.assetPath });
    return { document: documentSummary(actor), operationId: recordUpdateOperation(`Assign ${target} for ${actor.name}`, actor.uuid, before) };
  }
  if (target === "sceneLevelBackground") {
    const scene = await findWorldScene(args.uuid);
    const level = scene.levels.get(args.levelId);
    if (!level) throw new Error(`No Scene Level found: ${args.levelId}`);
    const before = sourceWithoutId(level);
    await level.update({ "background.src": args.assetPath });
    return { document: documentSummary(level), operationId: recordUpdateOperation(`Assign background for ${scene.name}`, level.uuid, before) };
  }
  throw new Error(`Unknown asset target: ${target}`);
}

async function execute(tool, args) {
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
      const document = await DocumentClass.create({
        ...args.data,
        name: args.name.trim(),
      });
      return {
        document: documentSummary(document),
        operationId: recordCreateOperation(`Create ${document.name}`, [document.uuid]),
      };
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
      const before = sourceWithoutId(document);
      await document.update(args.changes);
      return {
        document: documentSummary(document),
        operationId: recordUpdateOperation(`Update ${document.name}`, document.uuid, before),
      };
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
