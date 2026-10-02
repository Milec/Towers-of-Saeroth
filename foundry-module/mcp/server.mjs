#!/usr/bin/env node
/**
 * A dependency-free MCP stdio server and loopback WebSocket relay for Foundry.
 *
 * The HTTP listener only binds to 127.0.0.1. It forwards typed tool requests
 * to a Foundry GM client that has opted in via the companion module script.
 */

import crypto from "node:crypto";
import http from "node:http";
import readline from "node:readline";

const token = process.env.FOUNDRY_MCP_TOKEN;
const port = Number(process.env.FOUNDRY_MCP_PORT ?? 32123);
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_FRAME_BYTES = 5_000_000;

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

const tools = [
  tool("foundry_status", "Return the connected GM world, Foundry version, PF2e system version, and user.", {}),
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
  tool("foundry_update_document", "Update a supported world or compendium document by UUID. changes is passed to Foundry's document update method.", {
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
];

function tool(name, description, inputSchema) {
  return { name, description, inputSchema };
}

function write(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
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
    structuredContent: value,
    isError,
  };
}

function frame(payload) {
  const body = Buffer.from(payload);
  if (body.length > MAX_FRAME_BYTES) throw new Error("MCP relay response is too large.");
  let header;
  if (body.length < 126) header = Buffer.from([0x81, body.length]);
  else if (body.length < 65536) header = Buffer.from([0x81, 126, body.length >> 8, body.length & 0xff]);
  else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
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
      if (longLength > BigInt(MAX_FRAME_BYTES)) return connection.socket.end();
      length = Number(longLength);
      offset = 10;
    }
    if (!masked || length > MAX_FRAME_BYTES || connection.buffer.length < offset + 4 + length) return;
    const mask = connection.buffer.subarray(offset, offset + 4);
    offset += 4;
    const body = Buffer.from(connection.buffer.subarray(offset, offset + length));
    for (let index = 0; index < body.length; index += 1) body[index] ^= mask[index % 4];
    connection.buffer = connection.buffer.subarray(offset + length);
    if (opcode === 0x8) return connection.socket.end();
    if (opcode === 0x9) connection.socket.write(Buffer.from([0x8a, 0]));
    if (opcode === 0x1) receiveClientMessage(connection, body.toString("utf8"));
  }
}

function receiveClientMessage(connection, text) {
  let message;
  try {
    message = JSON.parse(text);
  } catch {
    return;
  }
  if (message.kind === "hello") {
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
    message.ok ? request.resolve(message.result) : request.reject(new Error(message.error || "Foundry rejected the request."));
  }
}

function sendToFoundry(toolName, args) {
  if (!client || !clientStatus) throw new Error("No authenticated Foundry GM client is connected.");
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error("Foundry did not respond within 20 seconds."));
    }, REQUEST_TIMEOUT_MS);
    pending.set(id, { resolve, reject, timeout });
    client.socket.write(frame(JSON.stringify({ kind: "request", id, tool: toolName, args })));
  });
}

const relay = http.createServer((request, response) => {
  response.writeHead(404).end();
});

relay.on("upgrade", (request, socket) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  if (url.pathname !== "/foundry-mcp" || url.searchParams.get("token") !== token) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }
  const key = request.headers["sec-websocket-key"];
  if (!key) {
    socket.destroy();
    return;
  }
  const accept = crypto.createHash("sha1").update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
  socket.write([
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${accept}`,
    "\r\n",
  ].join("\r\n"));
  if (client) client.socket.end();
  const connection = { socket, buffer: Buffer.alloc(0) };
  client = connection;
  socket.on("data", (chunk) => parseFrames(connection, chunk));
  socket.on("close", () => {
    if (client === connection) {
      client = null;
      clientStatus = null;
    }
  });
  socket.on("error", () => socket.destroy());
});

relay.listen(port, "127.0.0.1", () => {
  console.error(`Foundry MCP relay listening on ws://127.0.0.1:${port}/foundry-mcp`);
});

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on("line", async (line) => {
  let request;
  try {
    request = JSON.parse(line);
  } catch {
    return rpcError(null, -32700, "Parse error");
  }
  if (request.jsonrpc !== "2.0") return rpcError(request.id ?? null, -32600, "Invalid Request");
  if (request.method === "notifications/initialized") return;
  if (request.method === "initialize") {
    return rpcResult(request.id, {
      protocolVersion: request.params?.protocolVersion ?? "2025-06-18",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "foundry-local-bridge", version: "0.1.0" },
    });
  }
  if (request.method === "tools/list") return rpcResult(request.id, { tools });
  if (request.method === "tools/call") {
    const requested = tools.find((entry) => entry.name === request.params?.name);
    if (!requested) return rpcResult(request.id, textResult({ error: "Unknown tool." }, true));
    try {
      const result = requested.name === "foundry_status"
        ? (clientStatus ?? { connected: false })
        : await sendToFoundry(requested.name.replace(/^foundry_/, ""), request.params?.arguments ?? {});
      return rpcResult(request.id, textResult(result));
    } catch (error) {
      return rpcResult(request.id, textResult({ error: error.message }, true));
    }
  }
  return rpcError(request.id ?? null, -32601, "Method not found");
});
