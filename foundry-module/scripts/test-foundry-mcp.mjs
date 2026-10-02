import assert from "node:assert/strict";
import {test} from "node:test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import {spawn} from "node:child_process";
import {once} from "node:events";
import net from "node:net";
import readline from "node:readline";
import {pathToFileURL} from "node:url";

const bridgeSource = await fs.readFile(new URL("foundry-mcp-bridge.mjs", import.meta.url), "utf8");
const serverSource = new URL("../mcp/server.mjs", import.meta.url);
const clone = structuredClone;
let operators = {
  ForcedDeletion: class ForcedDeletion {},
  ForcedReplacement: class ForcedReplacement {constructor(value) {this.value = value;}},
};
if (process.env.FOUNDRY_API_ROOT) {
  const root = process.env.FOUNDRY_API_ROOT;
  operators = await import(pathToFileURL(path.join(root, "common/data/operators.mjs")));
  globalThis.CONST = await import(pathToFileURL(path.join(root, "common/constants.mjs")));
  globalThis.CONFIG = {compatibility: {mode: CONST.COMPATIBILITY_MODES.SILENT}};
}
// Portable document doubles exercise our control flow. An optional local run
// uses Foundry's actual merge helper, without opening/writing any world.
function merge(target, changes, {inplace = true} = {}) {
  target = inplace ? target : clone(target);
  for (const [key, value] of Object.entries(changes)) {
    const parts = key.split(".");
    const last = parts.pop();
    let cursor = target;
    for (const part of parts) cursor = cursor[part] ??= {};
    if (value instanceof operators.ForcedDeletion) delete cursor[last];
    else if (value instanceof operators.ForcedReplacement) cursor[last] = clone(value.value);
    else if (last.startsWith("-=")) delete cursor[last.slice(2)];
    else if (value && typeof value === "object" && !Array.isArray(value)) {
      cursor[last] = merge(cursor[last] && typeof cursor[last] === "object" && !Array.isArray(cursor[last]) ? cursor[last] : {}, value);
    } else cursor[last] = clone(value);
  }
  return target;
}
const mergeObject = process.env.FOUNDRY_API_ROOT
  ? (await import(pathToFileURL(path.join(process.env.FOUNDRY_API_ROOT, "common/utils/helpers.mjs")))).mergeObject : merge;

function harness() {
  const documents = new Map(), hooks = {}, registrations = new Map(), settings = new Map();
  const calls = {created: [], deleted: [], nativeValidation: 0, initiative: 0, start: 0};
  const failures = {};
  const warnings = [];
  const game = {ready: false, user: {isGM: true}, packs: new Map(), actors: new Map(), scenes: {},
    settings: {
      register(ns, key, data) {registrations.set(key, data); settings.set(key, data.default);},
      get(ns, key) {return settings.get(key);},
      async set(ns, key, value) {settings.set(key, value);},
    }};
  let index = 0;
  class Doc {
    static metadata = {embedded: {Item: "items", Level: "levels", Token: "tokens", Wall: "walls"}};
    constructor(type, data, pack = null) {
      this.id = String(++index).padStart(16, "0");
      this.uuid = `${type}.${this.id}`; this.documentName = type; this.pack = pack;
      this.state = {_id: this.id, name: data.name, flags: {}, img: "old.png", ...clone(data)};
      this.prototypeToken = {toObject: () => ({name: this.name, texture: {src: this.img}})};
      for (const key of ["levels", "walls", "lights", "tiles", "drawings", "notes", "sounds", "regions", "tokens"]) this[key] = new Map();
      this.pages = {contents: [{id: "page000000000001"}]};
      documents.set(this.uuid, this);
      if (type === "Actor" && !pack) game.actors.set(this.id, this);
    }
    get name() {return this.state.name;}
    get img() {return this.state.img;}
    get type() {return this.state.type;}
    get started() {return (this.state.round ?? 0) > 0;}
    toObject() {return clone(this.state);}
    async update(changes) {mergeObject(this.state, changes, {inplace: true, applyOperators: true}); return this;}
    async delete() {
      if (failures.delete || (this.pack && game.packs.get(this.pack).locked)) throw new Error("delete failed");
      calls.deleted.push(this.uuid); documents.delete(this.uuid);
    }
    async createEmbeddedDocuments(type, sources) {
      failures.tokenAttempts = (failures.tokenAttempts ?? 0) + (type === "Token" ? 1 : 0);
      if (failures[type] || (type === "Token" && failures.tokenAttempts === failures.tokenAt)) throw new Error(`${type} creation failed`);
      return sources.map(source => create(type, source));
    }
    async activate() {if (failures.activate) throw new Error("activate failed");}
    async rollInitiative() {calls.initiative++;}
    async startCombat() {calls.start++; this.state.round = 1; if (failures.start) throw new Error("start failed");}
  }
  function create(type, source, pack = null) {
    const doc = new Doc(type, source, pack); calls.created.push(doc); return doc;
  }
  class NativeScene {
    constructor(source) {this.source = source;}
    validate() {
      calls.nativeValidation++;
      if (this.source.lights?.some(light => light.config?.dim === "invalid")) throw new Error("invalid light configuration");
    }
    static async create(data) {return create("Scene", data);}
  }
  const factory = type => ({create: async data => create(type, data)});
  const api = new Function("Hooks", "game", "fromUuid", "Actor", "Combat", "Scene", "JournalEntry", "getDocumentClass", "foundry", "crypto", "fetch", "document", "AbortSignal", "ui", "WebSocket",
    `${bridgeSource}\nreturn {execute, operations, previewScene, createOperation};`)(
      {once(name, fn) {hooks[name] = fn;}}, game, async uuid => documents.get(uuid),
      factory("Actor"), factory("Combat"), NativeScene, factory("JournalEntry"),
      type => type === "Scene" ? NativeScene : factory(type), {utils: {mergeObject}, data: {operators}}, crypto,
      async () => ({ok: !failures.asset, status: failures.asset ? 404 : 200}),
      {baseURI: "http://localhost:30000/game"}, AbortSignal,
      {notifications: {warn: text => warnings.push(text)}}, class {constructor() {throw new Error("Unexpected connection");}});
  hooks.init();
  return {api, calls, failures, documents, game, hooks, registrations, settings, warnings,
    existing: (type, data = {}, pack = null) => new Doc(type, {name: "Fixture", ...data}, pack)};
}

test("GM token is client-local; compromised world token is cleared, never migrated", async () => {
  const h = harness();
  assert.equal(h.registrations.get("mcpBridgeLocalToken").scope, "client");
  assert.equal(h.registrations.get("mcpBridgeEnabled").scope, "client");
  assert.equal(h.registrations.get("mcpBridgeToken").config, false);
  h.settings.set("mcpBridgeToken", "old-exposed-password");
  await h.hooks.ready();
  assert.equal(h.settings.get("mcpBridgeToken"), "");
  assert.equal(h.settings.get("mcpBridgeLocalToken"), "");
  assert.equal(h.settings.get("mcpBridgeEnabled"), false);
  assert.match(h.warnings[0], /NEW token/);
  h.game.user.isGM = false;
  await assert.rejects(h.api.execute("list_documents", {type:"Actor"}), /authenticated GM/);
});

test("undo removes added fields and preserves subsequent unrelated edits", async () => {
  const h = harness(), actor = h.existing("Actor");
  const result = await h.api.execute("update_document", {uuid: actor.uuid, changes: {img:"new.png",flags:{saeroth:{test:true}}}});
  await actor.update({name:"Later user edit"});
  await h.api.execute("undo_operation", result);
  assert.equal(actor.name, "Later user edit");
  assert.equal(actor.img, "old.png");
  assert.deepEqual(actor.toObject().flags, {});
});

test("undo restores removed fields and refuses same-field conflicts without writes", async () => {
  const h = harness(), actor = h.existing("Actor", {flags:{saeroth:{test:true}}});
  const result = await h.api.execute("update_document", {uuid:actor.uuid, changes:{"flags.-=saeroth":null}});
  await h.api.execute("undo_operation", result);
  assert.equal(actor.toObject().flags.saeroth.test, true);
  const next = await h.api.execute("update_document", {uuid:actor.uuid, changes:{img:"new.png"}});
  await actor.update({img:"later.png"});
  await assert.rejects(h.api.execute("undo_operation", next), /Undo conflict/);
  assert.equal(actor.img, "later.png");
  assert(h.api.operations.has(next.operationId));
});

test("generic reversible updates reject embedded collections before writing", async () => {
  const h=harness(), actor=h.existing("Actor");
  await assert.rejects(h.api.execute("update_document", {uuid:actor.uuid,changes:{items:[]}}), /not supported/);
  assert.equal(h.api.operations.size,0);
});

test("invalid loot placement does not create an Actor", async () => {
  const h=harness(), scene=h.existing("Scene");
  await assert.rejects(h.api.execute("place_loot", {sceneUuid:scene.uuid,name:"Chest",token:{x:"invalid",y:2}}), /numeric/);
  assert.equal(h.calls.created.length,0);
});

for (const stage of ["Item", "Token"]) test(`loot failure at ${stage} rolls back the Actor`, async () => {
  const h=harness(), scene=h.existing("Scene"); h.failures[stage]=true;
  await assert.rejects(h.api.execute("place_loot", {sceneUuid:scene.uuid,name:"Chest",token:{x:1,y:2},items:[{name:"Item",type:"equipment"}]}), /creation failed/);
  assert(h.calls.created.filter(d=>d.documentName==="Actor").every(d=>!h.documents.has(d.uuid)));
  assert.equal(h.api.operations.size,0);
});

test("failed cleanup returns a usable recovery operation", async () => {
  const h=harness(), scene=h.existing("Scene"); h.failures.Token=true;h.failures.delete=true;
  let recovery;
  await assert.rejects(h.api.execute("place_loot", {sceneUuid:scene.uuid,name:"Chest",token:{x:1,y:2}}), error=>{
    recovery=error.recovery;return Boolean(recovery?.operationId);
  });
  h.failures.delete=false;
  await h.api.execute("undo_operation", recovery);
  assert(recovery.uuids.every(uuid=>!h.documents.has(uuid)));
});

test("encounter preflights ALL participants before creating tokens", async () => {
  const h=harness(), scene=h.existing("Scene"), actor=h.existing("Actor");
  await assert.rejects(h.api.execute("setup_encounter", {sceneUuid:scene.uuid,participants:[
    {actorUuid:actor.uuid,token:{x:1,y:1}},{actorUuid:"Actor.missing",token:{x:2,y:2}}
  ]}), /No Actor/);
  assert.equal(h.calls.created.length,0);
});

test("mid-encounter failure cleans up imported Actors and prior tokens in reverse order", async () => {
  const h=harness(), scene=h.existing("Scene"), actor=h.existing("Actor",{},"pf2e.npcs"); h.failures.tokenAt=2;
  await assert.rejects(h.api.execute("setup_encounter", {sceneUuid:scene.uuid,participants:[1,2].map(x=>({actorUuid:actor.uuid,token:{x,y:2}}))}), /creation failed/);
  assert(h.calls.created.every(d=>!h.documents.has(d.uuid)));
  assert.deepEqual(h.calls.deleted,h.calls.created.map(d=>d.uuid).reverse());
});

test("explicit combat start occurs after initiative; default leaves combat unstarted", async () => {
  const h=harness(), scene=h.existing("Scene"), actor=h.existing("Actor");
  const args={sceneUuid:scene.uuid,participants:[{actorUuid:actor.uuid,token:{x:1,y:2}}]};
  const first=await h.api.execute("setup_encounter",args); assert.equal(first.started,false);
  const started=await h.api.execute("setup_encounter",{...args,rollInitiative:true,startCombat:true});
  assert.equal(h.calls.initiative,1); assert.equal(h.calls.start,1);assert.equal(started.started,true);
});

test("create undo checks every document before deleting any; unchanged creates undo", async () => {
  const h=harness(), scene=h.existing("Scene");
  const result=await h.api.execute("place_loot",{sceneUuid:scene.uuid,name:"Chest",token:{x:1,y:2}});
  const actor=h.documents.get(result.actor.uuid);
  await actor.update({name:"User customization"});
  await assert.rejects(h.api.execute("undo_operation",result),/Undo conflict/);
  assert.equal(h.calls.deleted.length,0);
  await actor.update({name:"Chest"});await h.api.execute("undo_operation",result);
  assert(!h.documents.has(result.actor.uuid));assert(!h.documents.has(result.token.uuid));
});

test("map pin failure cleans up its journal", async () => {
  const h=harness(), scene=h.existing("Scene");h.failures.Note=true;
  await assert.rejects(h.api.execute("create_location_note",{sceneUuid:scene.uuid,name:"Town",x:10,y:20}),/creation failed/);
  assert(h.calls.created.every(d=>!h.documents.has(d.uuid)));
});

test("publishing and undo restore the compendium lock", async () => {
  const h=harness(), actor=h.existing("Actor");
  const pack={locked:true,documentName:"Actor",title:"Test",async configure({locked}){this.locked=locked;},
    async importDocument(doc){return h.existing("Actor",doc.toObject(),"world.test");}};
  h.game.packs.set("world.test",pack);
  const result=await h.api.execute("publish_to_compendium",{uuid:actor.uuid,pack:"world.test"});
  assert(pack.locked);await h.api.execute("undo_operation",result);assert(pack.locked);
  assert(!h.documents.has(result.document.uuid));
});

const validScene=()=>({name:"Fixture",width:1000,height:1000,levels:[{_id:"Level00000000001",background:{src:"assets/map.png"}}]});
test("malformed scene collections and entries return validation errors, never crash", async () => {
  const h=harness();
  for(const key of ["levels","walls","lights","tiles","drawings","notes","sounds","regions","tokens"]){
    for(const value of [{},null,[null],["bad"]]){
      const result=await h.api.execute("preview_scene",{scene:{...validScene(),[key]:value}});
      assert.equal(result.valid,false,`${key} ${JSON.stringify(value)}`);
    }
  }
});

test("preview catches wall-level references, missing actors, schema and asset errors", async () => {
  const h=harness(); const scene={...validScene(),walls:[{c:[0,0,5,5],levels:["Unknown000000001"]}],
    tokens:[{x:1,y:1,actorId:"missing"}],lights:[{x:2,y:2,config:{dim:"invalid"}}]};
  h.failures.asset=true;
  const result=await h.api.execute("preview_scene",{scene});
  assert.equal(result.valid,false);
  for(const expected of [/missing level/,/missing world Actor/,/Foundry schema/,/unavailable/])assert(result.errors.some(e=>expected.test(e)));
  assert.equal(h.calls.nativeValidation,1);
  await assert.rejects(h.api.execute("build_scene",{scene}),/validation failed/);
  assert.equal(h.calls.created.length,0);
});

test("valid preview is non-mutating; scene activation failure cleans up the created scene", async () => {
  const h=harness(), scene=validScene(), original=clone(scene);
  assert.equal((await h.api.execute("preview_scene",{scene})).valid,true);
  assert.deepEqual(scene,original);assert.equal(h.calls.created.length,0);
  h.failures.activate=true;
  await assert.rejects(h.api.execute("build_scene",{scene,activate:true}),/activate failed/);
  assert(h.calls.created.every(d=>!h.documents.has(d.uuid)));
});

async function relayFixture(t) {
  const fixture=await fs.mkdtemp(path.join(os.tmpdir(),"saeroth-mcp-test-"));
  const data=path.join(fixture,"Data"), allowed=path.join(fixture,"allowed"), outside=path.join(fixture,"outside");
  const server=path.join(data,"modules","test","mcp","server.mjs");
  await Promise.all([fs.mkdir(path.dirname(server),{recursive:true}),fs.mkdir(allowed),fs.mkdir(outside)]);
  await fs.copyFile(serverSource,server);
  const listener=net.createServer();listener.listen(0,"127.0.0.1");await once(listener,"listening");
  const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
  const token=crypto.randomBytes(32).toString("hex");
  const child=spawn(process.execPath,[server],{env:{...process.env,FOUNDRY_MCP_TOKEN:token,FOUNDRY_MCP_PORT:String(port),FOUNDRY_MCP_ASSET_SOURCE_ROOT:allowed},stdio:["pipe","pipe","pipe"],windowsHide:true});
  const responses=new Map();let id=0,stderr="";
  const exit=once(child,"exit");
  t.after(async()=>{
    if(child.exitCode===null){child.kill();await exit;}
    // This unique fixture tree belongs entirely to this test, including junctions.
    await fs.rm(fixture,{recursive:true,force:true});
  });
  readline.createInterface({input:child.stdout}).on("line",line=>{const msg=JSON.parse(line);responses.get(msg.id)?.(msg);responses.delete(msg.id);});
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error(`relay failed to start: ${stderr}`)),5000);
    child.stderr.on("data",chunk=>{stderr+=chunk;if(stderr.includes("relay listening")){clearTimeout(timer);resolve();}});
    child.once("error",reject);
  });
  const rpc=(method,params)=>new Promise((resolve,reject)=>{
    const requestId=++id,timer=setTimeout(()=>reject(new Error(`RPC timed out: ${method}`)),5000);
    responses.set(requestId,msg=>{clearTimeout(timer);resolve(msg);});
    child.stdin.write(JSON.stringify({jsonrpc:"2.0",id:requestId,method,params})+"\n");
  });
  const call=(name,args={})=>rpc("tools/call",{name,arguments:args});
  const connect=async()=>{
    const ws=new WebSocket(`ws://127.0.0.1:${port}/foundry-mcp?token=${token}`);await once(ws,"open");
    ws.send(JSON.stringify({kind:"hello",world:"test-world",user:{id:"gm",name:"Test GM",isGM:true}}));
    ws.addEventListener("message",event=>{const msg=JSON.parse(event.data);if(msg.kind==="request")ws.send(JSON.stringify({kind:"response",id:msg.id,ok:true,result:[{id:"fixture"}]}));});
    // Poll real status, rather than assuming the WebSocket hello was processed.
    for(let i=0;i<20;i++){if((await call("foundry_status")).result.structuredContent.world)return ws;await new Promise(r=>setTimeout(r,10));}
    throw new Error("GM hello not received");
  };
  return {fixture,data,allowed,outside,port,token,child,exit,rpc,call,connect};
}

test("relay protocol schemas, argument validation, structured results and EOF shutdown", {timeout:15000}, async t=>{
  const f=await relayFixture(t);
  assert.equal((await f.rpc("initialize",{protocolVersion:"unsupported-future-version"})).result.protocolVersion,"2025-06-18");
  assert.deepEqual((await f.rpc("ping",{})).result,{});
  const listed=(await f.rpc("tools/list",{})).result.tools;
  assert(listed.every(tool=>tool.inputSchema.type==="object"));
  assert.equal((await f.call("foundry_place_loot",{sceneUuid:"Scene.1",name:"Chest",token:{x:"bad",y:1}})).result.isError,true);
  const ws=await f.connect();
  const listedDocs=(await f.call("foundry_list_documents",{type:"Actor"})).result;
  assert.deepEqual(listedDocs.structuredContent,{results:[{id:"fixture"}]});
  assert.equal(listedDocs.isError,false);
  f.child.stdin.end(); // Still-connected WebSocket must not keep the process alive.
  const [code]=await f.exit;assert.equal(code,0);
  ws.close();
  // Prove the listening port was released.
  const listener=net.createServer();listener.listen(f.port,"127.0.0.1");await once(listener,"listening");await new Promise(r=>listener.close(r));
});

test("asset intake allows real assets and rejects traversal, junction escape and redirected destination", {timeout:15000}, async t=>{
  const f=await relayFixture(t);
  await fs.writeFile(path.join(f.allowed,"ok.png"),"fixture-image");
  await fs.writeFile(path.join(f.outside,"probe.png"),"must-not-copy");
  const type=process.platform==="win32"?"junction":"dir";
  await fs.symlink(f.outside,path.join(f.allowed,"escape"),type);
  for(const sourcePath of ["../outside/probe.png","escape/probe.png",path.join(f.outside,"probe.png"),"ok.png:alternate"]){
    assert.equal((await f.call("foundry_import_asset",{sourcePath})).result.isError,true,sourcePath);
  }
  const success=(await f.call("foundry_import_asset",{sourcePath:"ok.png"})).result;
  assert.equal(success.isError,false);
  assert.equal(await fs.readFile(path.join(f.data,success.structuredContent.assetPath),"utf8"),"fixture-image");
  // Preserve the original fixture assets and redirect only its replacement path.
  await fs.rename(path.join(f.data,"assets"),path.join(f.data,"test-assets-preserved"));
  await fs.symlink(f.outside,path.join(f.data,"assets"),type);
  assert.equal((await f.call("foundry_import_asset",{sourcePath:"ok.png"})).result.isError,true);
  assert.deepEqual(await fs.readdir(f.outside),["probe.png"]);
});

test("relay rejects wrong tokens and a second client without displacing the GM", {timeout:15000}, async t=>{
  const f=await relayFixture(t);
  const rejected=async token=>{
    const ws=new WebSocket(`ws://127.0.0.1:${f.port}/foundry-mcp?token=${token}`);
    await new Promise(resolve=>ws.addEventListener("error",resolve,{once:true}));ws.close();
  };
  await rejected("wrong-token");
  assert.equal((await f.call("foundry_status")).result.structuredContent.connected,false);
  const first=await f.connect();await rejected(f.token);
  assert.equal((await f.call("foundry_list_documents",{type:"Actor"})).result.isError,false);
  first.close();await once(first,"close");
  for(let i=0;i<20;i++){
    if((await f.call("foundry_status")).result.structuredContent.connected===false)break;
    await new Promise(r=>setTimeout(r,10));
  }
  assert.equal((await f.call("foundry_status")).result.structuredContent.connected,false);
  const second=await f.connect();second.close();await once(second,"close");
});

test("relay accepts fragmented messages and echoes ping payloads", {timeout:15000}, async t=>{
  const f=await relayFixture(t);
  const socket=net.connect(f.port,"127.0.0.1");await once(socket,"connect");t.after(()=>socket.destroy());
  let received=Buffer.alloc(0);socket.on("data",chunk=>{received=Buffer.concat([received,chunk]);});
  socket.write(`GET /foundry-mcp?token=${f.token} HTTP/1.1\r\nHost: 127.0.0.1\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: ${crypto.randomBytes(16).toString("base64")}\r\n\r\n`);
  for(let i=0;i<100&&!received.includes(Buffer.from("\r\n\r\n"));i++)await new Promise(r=>setTimeout(r,5));
  assert.match(received.toString(),/101 Switching Protocols/);received=Buffer.alloc(0);
  const masked=(first,text)=>{
    const body=Buffer.from(text),mask=crypto.randomBytes(4);assert(body.length<126);
    for(let i=0;i<body.length;i++)body[i]^=mask[i%4];
    return Buffer.concat([Buffer.from([first,0x80|body.length]),mask,body]);
  };
  const hello=JSON.stringify({kind:"hello",world:"fragment-test",user:{isGM:true}});
  socket.write(Buffer.concat([masked(0x01,hello.slice(0,10)),masked(0x80,hello.slice(10)),masked(0x89,"echo-this")]));
  for(let i=0;i<100&&received.length<11;i++)await new Promise(r=>setTimeout(r,5));
  assert.deepEqual(received,Buffer.concat([Buffer.from([0x8a,9]),Buffer.from("echo-this")]));
  assert.equal((await f.call("foundry_status")).result.structuredContent.world,"fragment-test");
  socket.destroy();
});
