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
const ALLOWED_DOCUMENT_TYPES = new Set([
  "Actor", "Item", "Scene", "JournalEntry", "RollTable",
]);

let socket;
let retryTimer;

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
  return sceneBuildSummary(scene);
}

async function findDocument(uuid) {
  const document = await fromUuid(uuid);
  if (!document || !ALLOWED_DOCUMENT_TYPES.has(document.documentName)) {
    throw new Error(`No supported document found for UUID: ${uuid}`);
  }
  return document;
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
      return documentSummary(document);
    }

    case "build_scene":
      return buildScene(args);

    case "update_document": {
      if (!args.changes || typeof args.changes !== "object" || Array.isArray(args.changes)) {
        throw new Error("changes must be an object.");
      }
      const document = await findDocument(args.uuid);
      await document.update(args.changes);
      return documentSummary(document);
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

    default:
      throw new Error(`Unknown MCP tool: ${tool}`);
  }
}
