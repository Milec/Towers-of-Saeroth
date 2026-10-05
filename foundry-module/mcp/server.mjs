#!/usr/bin/env node
/**
 * A dependency-free MCP stdio server and loopback WebSocket relay for Foundry.
 *
 * The HTTP listener only binds to 127.0.0.1. It forwards typed tool requests
 * to a Foundry GM client that has opted in via the companion module script.
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import http from "node:http";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const token = process.env.FOUNDRY_MCP_TOKEN;
const port = Number(process.env.FOUNDRY_MCP_PORT ?? 32123);
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_FRAME_BYTES = 5_000_000;
const PROTOCOL_VERSION = "2025-06-18";
const ASSET_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".mp3", ".ogg", ".wav"]);
const assetSourceRoot = process.env.FOUNDRY_MCP_ASSET_SOURCE_ROOT
  ? path.resolve(process.env.FOUNDRY_MCP_ASSET_SOURCE_ROOT)
  : null;
const moduleDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const foundryDataDirectory = path.resolve(moduleDirectory, "../..");

if (!token || token.length < 24) {
  console.error("FOUNDRY_MCP_TOKEN must be a random token of at least 24 characters.");
  process.exit(1);
}
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  console.error("FOUNDRY_MCP_PORT must be an integer between 1024 and 65535.");
  process.exit(1);
}

let client = null;
let clientStatus = null;
const pending = new Map();
const connections = new Set();
let shuttingDown = false;

const tools = [
  tool("foundry_status", "Return the connected GM world, Foundry version, PF2e system version, and user.", {type: "object", properties: {}}),
  tool("foundry_list_documents", "List world documents of one supported type. Results are capped at 100.", {
    type: "object",
    properties: {
      type: { type: "string", enum: ["Actor", "Item", "Scene", "JournalEntry", "RollTable"] },
      limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
    },
    required: ["type"],
  }),
  tool("foundry_search_documents", "Search world document names. Searches Actors, Items, Scenes, Journal Entries, and Roll Tables unless types are supplied.", {
    type: "object",
    properties: {
      query: { type: "string", minLength: 1 },
      types: { type: "array", items: { type: "string", enum: ["Actor", "Item", "Scene", "JournalEntry", "RollTable"] } },
    },
    required: ["query"],
  }),
  tool("foundry_get_document", "Return a full Foundry document by UUID.", {
    type: "object",
    properties: { uuid: { type: "string", minLength: 1 } },
    required: ["uuid"],
  }),
  tool("foundry_create_document", "Create a world Actor, Item, Scene, Journal Entry, or Roll Table. data is passed to Foundry as document fields.", {
    type: "object",
    properties: {
      type: { type: "string", enum: ["Actor", "Item", "Scene", "JournalEntry", "RollTable"] },
      name: { type: "string", minLength: 1 },
      data: { type: "object" },
    },
    required: ["type", "name"],
  }),
  tool("foundry_build_scene", "Create a complete Foundry Scene from a native Scene source, including levels/backgrounds, walls and doors, lights, tiles, drawings, notes, sounds, regions, and tokens. Set activate to make it the active scene after it is created.", {
    type: "object",
    properties: {
      scene: {
        type: "object",
        description: "A native Foundry v14 Scene source. name is required. Embedded arrays may include levels, walls, lights, tiles, drawings, notes, sounds, regions, and tokens.",
      },
      activate: { type: "boolean", default: false },
    },
    required: ["scene"],
  }),
  tool("foundry_preview_scene", "Validate a proposed native Scene without writing anything. Checks dimensions, embedded collection shapes, map background paths, wall coordinates, level references, and placeable bounds.", {
    type: "object",
    properties: { scene: { type: "object" } },
    required: ["scene"],
  }),
  tool("foundry_setup_encounter", "Place Actors on a world Scene and create a Combat encounter. Set rollInitiative to roll initiative and startCombat to begin round 1 and trigger combat-start effects. Both default to false.", {
    type: "object",
    properties: {
      sceneUuid: { type: "string", minLength: 1 },
      participants: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          properties: {
            actorUuid: { type: "string", minLength: 1 },
            name: { type: "string" },
            token: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } }, required: ["x", "y"] },
          },
          required: ["actorUuid", "token"],
        },
      },
      rollInitiative: { type: "boolean", default: false },
      startCombat: { type: "boolean", default: false },
    },
    required: ["sceneUuid", "participants"],
  }),
  tool("foundry_create_location_note", "Create a Journal Entry from campaign text and place a linked Map Note on an imported world Scene.", {
    type: "object",
    properties: {
      sceneUuid: { type: "string", minLength: 1 },
      name: { type: "string", minLength: 1 },
      content: { type: "string" },
      label: { type: "string" },
      x: { type: "number" },
      y: { type: "number" },
      icon: { type: "string" },
      iconSize: { type: "number", minimum: 16 },
    },
    required: ["sceneUuid", "name", "x", "y"],
  }),
  tool("foundry_place_loot", "Place a loose item, treasure parcel, chest, or merchant container as a PF2e Loot Actor with an inventory and an unlinked scene token.", {
    type: "object",
    properties: {
      sceneUuid: { type: "string", minLength: 1 },
      name: { type: "string", minLength: 1 },
      img: { type: "string" },
      items: { type: "array", items: { type: "object" }, default: [] },
      actorData: { type: "object" },
      token: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } }, required: ["x", "y"] },
    },
    required: ["sceneUuid", "name", "token"],
  }),
  tool("foundry_publish_to_compendium", "Copy a world Actor, Item, Scene, Journal Entry, or Roll Table into a compatible Foundry compendium pack without restarting Foundry.", {
    type: "object",
    properties: { uuid: { type: "string", minLength: 1 }, pack: { type: "string", minLength: 1 } },
    required: ["uuid", "pack"],
  }),
  tool("foundry_import_asset", "Copy an approved image or audio asset from FOUNDRY_MCP_ASSET_SOURCE_ROOT into Foundry's local Data/assets/mcp folder. sourcePath must be relative to that configured root.", {
    type: "object",
    properties: { sourcePath: { type: "string", minLength: 1 }, name: { type: "string" } },
    required: ["sourcePath"],
  }),
  tool("foundry_assign_asset", "Assign an imported Foundry asset path to an Actor portrait, Actor token, or a Scene Level background.", {
    type: "object",
    properties: {
      target: { type: "string", enum: ["actorPortrait", "actorToken", "sceneLevelBackground"] },
      uuid: { type: "string", minLength: 1 },
      assetPath: { type: "string", minLength: 1 },
      levelId: { type: "string" },
    },
    required: ["target", "uuid", "assetPath"],
  }),
  tool("foundry_update_document", "Update a supported document by UUID with conflict-checked undo. Embedded collections, IDs and document statistics cannot be updated with this tool; use dedicated creation/asset tools.", {
    type: "object",
    properties: {
      uuid: { type: "string", minLength: 1 },
      changes: { type: "object" },
    },
    required: ["uuid", "changes"],
  }),
  tool("foundry_activate_scene", "Make an existing world Scene active.", {
    type: "object",
    properties: { uuid: { type: "string", minLength: 1 } },
    required: ["uuid"],
  }),
  tool("foundry_delete_document", "Delete a supported document. This is destructive and requires confirm: true.", {
    type: "object",
    properties: {
      uuid: { type: "string", minLength: 1 },
      confirm: { type: "boolean", const: true },
    },
    required: ["uuid", "confirm"],
  }),
  tool("foundry_undo_operation", "Undo recorded document creations or field updates. Refuses conflicts with subsequent edits. Does not rewind combat side effects, chat, file imports, explicit deletions, or scene activation. Latest 50 operations; resets on GM client reload.", {
    type: "object",
    properties: { operationId: { type: "string", minLength: 1 } },
    required: ["operationId"],
  }),
];

function contained(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function importAsset(args) {
  if (!assetSourceRoot) {
    throw new Error("Asset import is disabled. Set FOUNDRY_MCP_ASSET_SOURCE_ROOT to an approved source directory.");
  }
  if (path.isAbsolute(args.sourcePath) || args.sourcePath.includes(":")) throw new Error("sourcePath must be relative to FOUNDRY_MCP_ASSET_SOURCE_ROOT (no drives or alternate data streams).");
  const source = path.resolve(assetSourceRoot, args.sourcePath);
  if (source === assetSourceRoot || !contained(assetSourceRoot, source)) {
    throw new Error("sourcePath must stay inside FOUNDRY_MCP_ASSET_SOURCE_ROOT.");
  }
  const extension = path.extname(source).toLowerCase();
  if (!ASSET_EXTENSIONS.has(extension)) throw new Error(`Unsupported asset type: ${extension || "none"}`);
  const canonicalRoot = await fs.realpath(assetSourceRoot);
  const canonicalSource = await fs.realpath(source);
  if (!contained(canonicalRoot, canonicalSource)) throw new Error("sourcePath resolves outside the approved asset source root.");
  // Use the resolved path for the copy, not the original symlink/junction.
  const stat = await fs.stat(canonicalSource);
  if (!stat.isFile()) throw new Error("sourcePath must point to a file.");
  const dataRoot = await fs.realpath(foundryDataDirectory);
  let assetDirectory = dataRoot;
  // Check each existing parent before creating the next component. A redirected
  // assets directory must not cause even a mkdir outside Foundry's data root.
  for (const component of ["assets", "mcp"]) {
    const directory = path.join(assetDirectory, component);
    try { await fs.mkdir(directory); } catch (error) { if (error.code !== "EEXIST") throw error; }
    assetDirectory = await fs.realpath(directory);
    if (!contained(dataRoot, assetDirectory)) throw new Error("Asset destination resolves outside Foundry's data root.");
  }
  const stem = path.basename(args.name ?? path.basename(source, extension), extension)
    .replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "asset";
  const filename = `${stem}-${crypto.randomUUID().slice(0, 8)}${extension}`;
  await fs.copyFile(canonicalSource, path.join(assetDirectory, filename), fsConstants.COPYFILE_EXCL);
  return { assetPath: `assets/mcp/${filename}`, bytes: stat.size };
}

function tool(name, description, inputSchema) {
  return { name, description, inputSchema };
}

function write(message) {
  if (!shuttingDown) process.stdout.write(`${JSON.stringify(message)}\n`);
}

function rpcResult(id, result) {
  write({ jsonrpc: "2.0", id, result });
}

function rpcError(id, code, message) {
  write({ jsonrpc: "2.0", id, error: { code, message } });
}

function textResult(value, isError = false) {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    structuredContent: value !== null && typeof value === "object" && !Array.isArray(value)
      ? value : Array.isArray(value) ? {results: value} : {value: value ?? null},
    isError,
  };
}

function frame(payload, opcode = 0x1) {
  const body = Buffer.from(payload);
  if (body.length > MAX_FRAME_BYTES) throw new Error("MCP relay response is too large.");
  let header;
  if (body.length < 126) header = Buffer.from([0x80 | opcode, body.length]);
  else if (body.length < 65536) header = Buffer.from([0x80 | opcode, 126, body.length >> 8, body.length & 0xff]);
  else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(body.length), 2);
  }
  return Buffer.concat([header, body]);
}

function parseFrames(connection, chunk) {
  connection.buffer = Buffer.concat([connection.buffer, chunk]);
  while (connection.buffer.length >= 2) {
    const first = connection.buffer[0];
    const second = connection.buffer[1];
    const opcode = first & 0x0f;
    const final = (first & 0x80) !== 0;
    if ((first & 0x70) || ![0, 1, 8, 9, 10].includes(opcode)) return connection.socket.destroy();
    const masked = (second & 0x80) !== 0;
    let length = second & 0x7f;
    let offset = 2;
    if (length === 126) {
      if (connection.buffer.length < 4) return;
      length = connection.buffer.readUInt16BE(2);
      offset = 4;
    } else if (length === 127) {
      if (connection.buffer.length < 10) return;
      const longLength = connection.buffer.readBigUInt64BE(2);
      if (longLength > BigInt(MAX_FRAME_BYTES)) return connection.socket.destroy();
      length = Number(longLength);
      offset = 10;
    }
    if (!masked || length > MAX_FRAME_BYTES || (opcode >= 8 && (!final || length > 125))) return connection.socket.destroy();
    if (connection.buffer.length < offset + 4 + length) return;
    const mask = connection.buffer.subarray(offset, offset + 4);
    offset += 4;
    const body = Buffer.from(connection.buffer.subarray(offset, offset + length));
    for (let index = 0; index < body.length; index += 1) body[index] ^= mask[index % 4];
    connection.buffer = connection.buffer.subarray(offset + length);
    if (opcode === 0x8) return connection.socket.end(frame(body, 0x8));
    if (opcode === 0x9) { connection.socket.write(frame(body, 0xA)); continue; }
    if (opcode === 0xA) continue;
    if ((opcode === 0 && !connection.fragments) || (opcode === 1 && connection.fragments)) return connection.socket.destroy();
    if (opcode === 1 && final) receiveClientMessage(connection, body.toString("utf8"));
    else {
      connection.fragments = Buffer.concat([connection.fragments ?? Buffer.alloc(0), body]);
      if (connection.fragments.length > MAX_FRAME_BYTES) return connection.socket.destroy();
      if (final) {
        receiveClientMessage(connection, connection.fragments.toString("utf8"));
        connection.fragments = null;
      }
    }
  }
}

function receiveClientMessage(connection, text) {
  if (connection !== client) return;
  let message;
  try {
    message = JSON.parse(text);
  } catch {
    return;
  }
  if (!message || typeof message !== "object") return;
  if (message.kind === "hello" && message.user?.isGM === true && typeof message.world === "string") {
    clearTimeout(connection.helloTimeout);
    clientStatus = {
      world: message.world,
      worldTitle: message.worldTitle,
      foundryVersion: message.foundryVersion,
      system: message.system,
      user: message.user,
    };
    return;
  }
  if (message.kind === "response" && pending.has(message.id)) {
    const request = pending.get(message.id);
    clearTimeout(request.timeout);
    pending.delete(message.id);
    message.ok ? request.resolve(message.result) : request.reject(Object.assign(new Error(message.error || "Foundry rejected the request."), {recovery: message.recovery}));
  }
}

function sendToFoundry(toolName, args) {
  if (!client || !clientStatus) throw new Error("No authenticated Foundry GM client is connected.");
  const id = crypto.randomUUID();
  const payload = frame(JSON.stringify({ kind: "request", id, tool: toolName, args }));
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error("Foundry did not respond within 20 seconds. The operation may still complete; inspect the world before retrying to avoid duplicates."));
    }, REQUEST_TIMEOUT_MS);
    pending.set(id, { resolve, reject, timeout });
    client.socket.write(payload);
  });
}

const relay = http.createServer((request, response) => {
  response.writeHead(404).end();
});

relay.on("upgrade", (request, socket, head) => {
  let url;
  try { url = new URL(request.url, "http://127.0.0.1"); } catch { return socket.destroy(); }
  const supplied = Buffer.from(url.searchParams.get("token") ?? "");
  const expected = Buffer.from(token);
  if (url.pathname !== "/foundry-mcp" || supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }
  const key = request.headers["sec-websocket-key"];
  if (!key || request.headers["sec-websocket-version"] !== "13") {
    socket.destroy();
    return;
  }
  if (client || shuttingDown) return socket.end("HTTP/1.1 409 Conflict\r\nConnection: close\r\n\r\n");
  const accept = crypto.createHash("sha1").update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
  socket.write([
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${accept}`,
    "\r\n",
  ].join("\r\n"));
  const connection = { socket, buffer: Buffer.alloc(0), fragments: null };
  client = connection;
  clientStatus = null;
  connection.helloTimeout = setTimeout(() => socket.destroy(), 5000);
  socket.on("data", (chunk) => parseFrames(connection, chunk));
  socket.on("close", () => {
    clearTimeout(connection.helloTimeout);
    if (client === connection) {
      client = null;
      clientStatus = null;
      rejectPending("Foundry GM client disconnected. In-flight writes may have completed; inspect the world before retrying.");
    }
  });
  socket.on("error", () => socket.destroy());
  if (head.length) parseFrames(connection, head);
});

relay.on("connection", socket => {
  connections.add(socket);
  socket.on("close", () => connections.delete(socket));
});

function rejectPending(message) {
  for (const request of pending.values()) {
    clearTimeout(request.timeout);
    request.reject(new Error(message));
  }
  pending.clear();
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  clearTimeout(client?.helloTimeout);
  rejectPending("MCP relay is shutting down.");
  for (const socket of connections) socket.destroy();
  relay.close();
  input.close();
}

relay.on("error", error => { console.error(`Foundry relay failed: ${error.code ?? error.message}`); process.exitCode = 1; shutdown(); });

relay.listen(port, "127.0.0.1", () => {
  console.error(`Foundry MCP relay listening on ws://127.0.0.1:${port}/foundry-mcp`);
});

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on("close", shutdown);
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
process.stdout.on("error", shutdown);

function validateArguments(value, schema, label = "arguments") {
  const object = value !== null && typeof value === "object" && !Array.isArray(value);
  const valid = schema.type === "object" ? object : schema.type === "array" ? Array.isArray(value)
    : schema.type === "integer" ? Number.isInteger(value) : schema.type === "number" ? Number.isFinite(value)
      : typeof value === schema.type;
  if (!valid) throw new Error(`${label} must be ${schema.type}.`);
  if (schema.enum && !schema.enum.includes(value)) throw new Error(`${label} is not an allowed value.`);
  if (Object.hasOwn(schema, "const") && value !== schema.const) throw new Error(`${label} must be ${schema.const}.`);
  if (typeof value === "string" && schema.minLength && value.trim().length < schema.minLength) throw new Error(`${label} cannot be empty.`);
  if (typeof value === "number" && ((schema.minimum !== undefined && value < schema.minimum) || (schema.maximum !== undefined && value > schema.maximum))) throw new Error(`${label} is out of range.`);
  if (object) {
    for (const key of schema.required ?? []) if (!Object.hasOwn(value, key)) throw new Error(`${label}.${key} is required.`);
    for (const [key, child] of Object.entries(value)) {
      if (["__proto__", "constructor", "prototype"].includes(key)) throw new Error(`${label} has an unsafe key.`);
      if (schema.properties?.[key]) validateArguments(child, schema.properties[key], `${label}.${key}`);
    }
  }
  if (Array.isArray(value)) {
    if (value.length < (schema.minItems ?? 0)) throw new Error(`${label} needs at least ${schema.minItems} entries.`);
    if (schema.items) value.forEach((child, index) => validateArguments(child, schema.items, `${label}[${index}]`));
  }
}

input.on("line", async (line) => {
  let request;
  try {
    request = JSON.parse(line);
  } catch {
    return rpcError(null, -32700, "Parse error");
  }
  if (!request || typeof request !== "object" || Array.isArray(request) || request.jsonrpc !== "2.0" || typeof request.method !== "string") return rpcError(request?.id ?? null, -32600, "Invalid Request");
  // Notifications never receive responses, including unsupported notifications.
  if (!Object.hasOwn(request, "id")) return;
  if (request.method === "ping") return rpcResult(request.id, {});
  if (request.method === "initialize") {
    return rpcResult(request.id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "foundry-local-bridge", version: "0.2.0" },
    });
  }
  if (request.method === "tools/list") return rpcResult(request.id, { tools });
  if (request.method === "tools/call") {
    const requested = tools.find((entry) => entry.name === request.params?.name);
    if (!requested) return rpcResult(request.id, textResult({ error: "Unknown tool." }, true));
    try {
      const args = request.params?.arguments ?? {};
      validateArguments(args, requested.inputSchema);
      const result = requested.name === "foundry_status"
        ? (clientStatus ?? { connected: false })
        : requested.name === "foundry_import_asset"
          ? await importAsset(args)
          : await sendToFoundry(requested.name.replace(/^foundry_/, ""), args);
      return rpcResult(request.id, textResult(result));
    } catch (error) {
      return rpcResult(request.id, textResult({ error: error.message, ...(error.recovery ? {recovery: error.recovery} : {}) }, true));
    }
  }
  return rpcError(request.id ?? null, -32601, "Method not found");
});
