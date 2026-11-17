import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import {generateLoot,generateShop,generateNPC,normalizePreparation,preparationValue,preparationHTML} from './preparation-generators.mjs';
import {sealPackage,validatePackage,normalizePackage} from './session-package.mjs';
import {adjustedCreatureLevel} from './encounter-plan.mjs';
const items=JSON.parse(fs.readFileSync(new URL('../../site/generator-items.json',import.meta.url)));
const creatures=JSON.parse(fs.readFileSync(new URL('../../site/encounter-creatures.json',import.meta.url)));
const options={level:3,partySize:4,share:25,count:6,seed:'stable-test',kind:'general',rarity:'common'};
const packageFor=p=>({format:'saeroth-session',version:3,name:p.name,createdAt:'2026-11-17T12:00:00Z',assets:[],actors:[],preparations:[p],journal:{name:p.name,pages:[{name:p.name,type:'text',text:{format:1,content:preparationHTML(p)}}]}});
test('native item metadata has valid references, prices and source budgets',()=>{
  assert(items.items.length>5000);assert.equal(new Set(items.items.map(i=>i.uuid)).size,items.items.length);
  assert.equal(items.budgets[3].totalCp,50000);assert.equal(Object.keys(items.budgets).length,20);
  for(const i of items.items){assert.match(i.uuid,/^Compendium\.pf2e\.equipment-srd\.Item\.[A-Za-z0-9]{16}$/);assert(Number.isSafeInteger(i.priceCp)&&i.priceCp>0);assert(Number.isInteger(i.pricePer)&&i.pricePer>=1);}
});
test('treasure fills a bounded value budget, respects rarity, and has reproducible rolls',()=>{
  const p=generateLoot(options,items);assert.equal(preparationValue(p),12500);assert.equal(p.targetCp,12500);
  assert.deepEqual(generateLoot(options,items),p);assert.notDeepEqual(generateLoot({...options,seed:'another'},items),p);
  for(let level=1;level<=20;level++){
    const result=generateLoot({...options,level},items);assert.equal(preparationValue(result),Math.floor(items.budgets[level].totalCp/4));
    assert(result.items.every(row=>items.items.find(i=>i.uuid===row.uuid).rarity==='common'));
  }
  const currency=generateLoot({...options,count:0},items);assert.deepEqual(currency.items,[]);assert.equal(preparationValue(currency),12500);
  assert.throws(()=>generateLoot({...options,share:101},items));
});
test('shops respect settlement level, specialty, quantity packs, rarity, and native prices',()=>{
  for(const kind of ['general','blacksmith','magic','alchemical','temple']){
    const shop=generateShop({...options,kind,count:20,fundsCp:4321},items);assert.equal(shop.kind,'shop');
    assert(shop.items.length>0);assert.equal(new Set(shop.items.map(i=>i.uuid)).size,shop.items.length);
    for(const row of shop.items){const original=items.items.find(i=>i.uuid===row.uuid);assert(original.level<=3);assert.equal(original.rarity,'common');assert.equal(row.quantity,original.pricePer);assert.equal(row.priceCp,original.priceCp);assert.equal(row.pricePer,original.pricePer);if(kind==='blacksmith')assert(['weapon','armor','shield','ammo'].includes(original.type));}
  }
  assert.throws(()=>generateShop({...options,count:101},items));
  const pack=generateShop({...options,level:0,count:1,fundsCp:0},{items:[{uuid:items.items[0].uuid,name:'Bundle',level:0,type:'ammo',rarity:'common',traits:[],priceCp:1,pricePer:10}]});
  assert.equal(pack.items[0].quantity,10);assert.equal(preparationValue(pack),1,'A bundle costing one copper must not become ten copper.');
});
test('NPC generation supplies a native humanoid profile at every supported level',()=>{
  for(let level=-1;level<=20;level++){
    const npc=generateNPC({level,role:'guard',seed:'npc-'+level},creatures),source=creatures.creatures.find(c=>c.source.uuid===npc.source.uuid);
    assert(source.traits.includes('humanoid'));assert.equal(adjustedCreatureLevel(source.level,npc.adjustment),level);
    assert.match(npc.description,/Wants/);assert.match(npc.description,/will not/);
    assert.deepEqual(generateNPC({level,role:'guard',seed:'npc-'+level},creatures),npc);
  }
  const named=generateNPC({level:3,role:'any',name:'Chosen name',seed:'test'},creatures);assert.equal(named.name,'Chosen name');
});
test('v3 binds generator stock to the package identity and preserves legacy boundaries',async()=>{
  const loot=generateLoot(options,items),raw=packageFor(loot),bundle=await sealPackage(raw);
  assert.deepEqual(await validatePackage(bundle),bundle);
  const changed=structuredClone(bundle);changed.preparations[0].coins.gp++;await assert.rejects(validatePackage(changed),/changed/);
  assert.throws(()=>normalizePackage({...raw,version:2}),/version 3/);
  const wrong=structuredClone(loot);wrong.items[0].uuid='Compendium.another.module.Item.abcdefghijklmnop';assert.throws(()=>normalizePreparation(wrong));
  const duplicate=structuredClone(loot);duplicate.items.push({...duplicate.items[0]});assert.throws(()=>normalizePreparation(duplicate));
  const escaped=generateNPC({level:3,role:'any',name:'<script>alert(1)</script>',seed:'test'},creatures);
  assert(!preparationHTML(escaped).includes('<script>'));assert(preparationHTML(escaped).includes('&lt;script&gt;'));
  assert.throws(()=>normalizePreparation({...loot,items:[{...loot.items[0],quantity:-1}]}));
});
