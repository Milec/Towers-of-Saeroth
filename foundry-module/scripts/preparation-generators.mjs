/** Data-only PF2e preparation generators and the v3 Foundry import boundary. */
import {adjustedCreatureLevel} from './encounter-plan.mjs';
export const COINS=Object.freeze({cp:'Compendium.pf2e.equipment-srd.Item.lzJ8AVhRcbFul5fh',sp:'Compendium.pf2e.equipment-srd.Item.5Ew82vBF9YfaiY9f',gp:'Compendium.pf2e.equipment-srd.Item.B6B7tBWJSqOBz5zz',pp:'Compendium.pf2e.equipment-srd.Item.JuNPeK5Qm1w6wpb4'});
export const DENOMINATIONS=Object.freeze({cp:1,sp:10,gp:100,pp:1000});
export const SHOP_KINDS=['general','blacksmith','alchemical','magic','temple'];
export const NPC_ROLES=['any','guard','merchant','scholar','healer','criminal','laborer'];
const rarities=['common','uncommon','rare'];
const itemUUID=/^Compendium\.pf2e\.equipment-srd\.Item\.[a-zA-Z0-9]{16}$/;
const actorUUID=/^Compendium\.pf2e\.[a-z0-9-]+\.Actor\.[a-zA-Z0-9]{16}$/;
function integer(n,label,min,max){if(!Number.isSafeInteger(n)||n<min||n>max)throw Error(`Invalid ${label}.`);return n;}
function string(s,label,max=160){if(typeof s!=='string'||!s.trim()||s.length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(s))throw Error(`Invalid ${label}.`);return s.trim();}
function object(value){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>['__proto__','constructor','prototype'].includes(k)))throw Error('Invalid generated preparation.');return value;}
export function normalizePreparation(value){
  object(value);if(!['loot','shop','npc'].includes(value.kind))throw Error('Choose loot, shop, or NPC preparation.');
  const id=string(value.id,'preparation ID',64);if(!/^[a-z0-9_-]+$/i.test(id))throw Error('Invalid preparation ID.');
  const result={id,kind:value.kind,name:string(value.name,'preparation name'),level:integer(value.level,'preparation level',-1,20),description:string(value.description,'description',6000)};
  if(value.kind==='npc'){
    object(value.source);if(value.source.type!=='compendium'||!actorUUID.test(value.source.uuid))throw Error('NPCs need a native PF2e Actor source.');
    result.source={type:'compendium',uuid:value.source.uuid};result.baseName=string(value.baseName,'NPC profile');
    if(value.adjustment){
      result.baseLevel=integer(value.baseLevel,'NPC base level',-1,25);result.adjustment=value.adjustment;
      if(adjustedCreatureLevel(result.baseLevel,result.adjustment)!==result.level)throw Error('NPC profile adjustment does not match the requested level.');
    }
  }else{
    if(result.level<0)throw Error('Loot and shop levels cannot be negative.');
    if(!Array.isArray(value.items)||value.items.length>100)throw Error('Use at most 100 item lines.');
    const seen=new Set();
    result.items=value.items.map(item=>{object(item);if(!itemUUID.test(item.uuid)||seen.has(item.uuid))throw Error('Use unique native equipment references.');seen.add(item.uuid);return {uuid:item.uuid,name:string(item.name,'item name'),quantity:integer(item.quantity,'item quantity',1,10000),priceCp:integer(item.priceCp,'listed price',1,1e10),pricePer:integer(item.pricePer??1,'price quantity',1,10000)};});
    object(value.coins);result.coins=Object.fromEntries(Object.keys(COINS).map(k=>[k,integer(value.coins[k]??0,k+' coins',0,1e9)]));
    if(value.targetCp!==undefined)result.targetCp=integer(value.targetCp,'treasure target',0,1e12);
    const total=result.items.reduce((n,i)=>n+itemValue(i),0)+Object.entries(result.coins).reduce((n,[k,v])=>n+v*DENOMINATIONS[k],0);
    integer(total,'total preparation value',0,1e12);
  }
  return result;
}
export function randomSource(seed){let n=2166136261;for(const c of String(seed)){n^=c.charCodeAt(0);n=Math.imul(n,16777619);}return()=>{n+=0x6d2b79f5;let x=n;x=Math.imul(x^x>>>15,x|1);x^=x+Math.imul(x^x>>>7,x|61);return((x^x>>>14)>>>0)/4294967296;};}
function shuffled(values,random){const result=[...values];for(let i=result.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result;}
export function coinsFromCp(value){let left=integer(value,'currency value',0,1e12);const coins={};for(const k of ['pp','gp','sp','cp']){coins[k]=Math.floor(left/DENOMINATIONS[k]);left%=DENOMINATIONS[k];}return coins;}
export function itemValue(item){return Math.ceil(item.quantity*item.priceCp/(item.pricePer||1));}
export function preparationValue(value){const p=normalizePreparation(value);return p.kind==='npc'?0:p.items.reduce((n,i)=>n+itemValue(i),0)+Object.entries(p.coins).reduce((n,[k,v])=>n+v*DENOMINATIONS[k],0);}
export function money(cp){return (cp/100).toLocaleString('en',{maximumFractionDigits:2})+' gp';}
function eligible(items,{level,rarity='common',kind='general'}){
  if(!rarities.includes(rarity)||!SHOP_KINDS.includes(kind))throw Error('Choose a valid rarity and item theme.');
  return items.filter(item=>item.level<=level&&rarities.indexOf(item.rarity)>=0&&rarities.indexOf(item.rarity)<=rarities.indexOf(rarity)&&!item.traits.includes('artifact')&&!item.traits.includes('cursed')&&(
    kind==='general'||kind==='blacksmith'&&['weapon','armor','shield','ammo'].includes(item.type)||kind==='alchemical'&&item.traits.includes('alchemical')||kind==='magic'&&item.traits.some(t=>['magical','arcane','occult','primal','divine'].includes(t))||kind==='temple'&&(item.traits.some(t=>['divine','healing','holy','vitality'].includes(t))||/healing|religious|holy water/i.test(item.name))));
}
function line(item){return {uuid:item.uuid,name:item.name,quantity:item.pricePer||1,priceCp:item.priceCp,pricePer:item.pricePer||1};}
export function generateLoot(options,catalog){
  const level=integer(options.level,'party level',1,20),size=integer(options.partySize,'party size',1,12),share=integer(options.share,'treasure share',1,100),count=integer(options.count,'item count',0,100);
  const budget=catalog.budgets[level];if(!budget)throw Error('Treasure budget unavailable.');
  const targetCp=options.budgetCp===undefined?Math.floor(budget.totalCp*size/4*share/100):integer(options.budgetCp,'loot budget',0,1e12);
  const random=randomSource(options.seed),pool=shuffled(eligible(catalog.items,{...options,level:Math.min(20,level+1)}).filter(i=>i.level>=Math.max(0,level-1)),random);
  let left=targetCp;const items=[];
  for(const item of pool){if(items.length>=count)break;const row=line(item),value=itemValue(row);if(value<=left){items.push(row);left-=value;}}
  return normalizePreparation({id:'generated-loot',kind:'loot',name:options.name||'Recovered treasure',level,items,coins:coinsFromCp(left),targetCp,
    description:`Treasure for level ${level}: ${share}% of a level's value budget, proportionally scaled to ${size} characters. This is a value estimate, not the complete item-slot allocation for a level. Item theme: ${options.kind||'general'}. Remaining value is currency.`});
}
export function generateShop(options,catalog){
  const level=integer(options.level,'settlement level',0,20),count=integer(options.count,'stock lines',1,100);
  const pool=shuffled(eligible(catalog.items,{...options,level}),randomSource(options.seed));
  return normalizePreparation({id:'generated-shop',kind:'shop',name:options.name||'The Wayfarer’s Counter',level,items:pool.slice(0,count).map(line),coins:coinsFromCp(options.fundsCp??10000),
    description:`${options.kind||'general'} merchant in a level-${level} settlement. Stock is restricted to the selected rarity and settlement level. Prices are listed purchase prices from PF2e 8.5; items are not sold automatically.`});
}
const first=['Adelheid','Borin','Cassia','Dara','Edric','Farah','Garran','Iona','Jorin','Mira','Neris','Oren','Petra','Ren','Sera','Tavian'];
const last=['Ashfield','Bell','Calder','Dunwick','Ember','Fen','Grey','Hale','Ironwood','Kestrel','Marsh','Reed','Stone','Vale','Wren'];
const wants=['to pay a family debt','to recover a stolen keepsake','to earn a place in a respected guild','to protect someone who depends on them','to leave a dangerous employer','to prove a neglected warning was right','to find a missing relative','to buy a small home'];
const boundaries=['will not abandon a wounded companion','will not expose someone who trusted them','will not accept payment for work they cannot do','will not steal from people who are hungry','will not break a promise made in public','will not harm a child','will not let another person take the blame for their mistake'];
const quirks=['checks every doorway before sitting','keeps a notebook of small debts','speaks softly even when angry','polishes a worn token while thinking','remembers faces better than names','repairs things while talking','asks direct questions and waits for an answer','laughs when a plan becomes complicated'];
const roleWords={guard:/guard|soldier|watch|officer|warrior|sentry/i,merchant:/merchant|trader|broker|shop|innkeeper|barkeep/i,scholar:/scholar|sage|mage|librarian|scribe|teacher/i,healer:/healer|priest|physician|cleric|acolyte/i,criminal:/thief|bandit|assassin|burglar|smuggler|scoundrel/i,laborer:/laborer|farmer|miner|servant|commoner|porter/i};
export function generateNPC(options,catalog){
  const level=integer(options.level,'NPC level',-1,20);if(!NPC_ROLES.includes(options.role))throw Error('Choose an NPC role.');
  const random=randomSource(options.seed),pick=values=>values[Math.floor(random()*values.length)];
  let pool=catalog.creatures.filter(c=>c.level===level&&c.traits?.includes('humanoid'));
  if(!pool.length)pool=catalog.creatures.filter(c=>c.traits?.includes('humanoid')).flatMap(c=>['elite','weak'].flatMap(adjustment=>{
    try{return adjustedCreatureLevel(c.level,adjustment)===level?[{...c,adjustment}]:[];}catch(_){return [];}
  }));
  const matching=options.role==='any'?pool:pool.filter(c=>roleWords[options.role].test(c.name));
  if(!pool.length)throw Error('No humanoid profile exists at this level. Choose another level.');
  const candidates=matching.length?matching:pool,nativeNPCs=candidates.filter(c=>/npc-core|npc-gallery/.test(c.source.uuid));
  const base=pick(nativeNPCs.length?nativeNPCs:candidates),name=options.name?.trim()||pick(first)+' '+pick(last);
  return normalizePreparation({id:'generated-npc',kind:'npc',name,level,source:base.source,baseName:(base.adjustment?base.adjustment+' ':'')+base.name,...(base.adjustment?{baseLevel:base.level,adjustment:base.adjustment}:{}),
    description:`Role: ${options.role==='any'?'traveller':options.role}. Wants ${pick(wants)}. ${name} ${pick(boundaries)}. Manner: ${pick(quirks)}. Combat profile: ${base.name} (${base.book}). ${matching.length?'':'No role-specific profile matched; this humanoid profile has the requested level.'} Generated preparation; not established campaign canon.`});
}
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function preparationHTML(value){const p=normalizePreparation(value);return `<h1>${escape(p.name)}</h1><p>${escape(p.description)}</p>`+(p.kind==='npc'?`<p>Level ${p.level} · Native profile: ${escape(p.baseName)}</p>`:`<table><thead><tr><th>Item</th><th>Quantity</th><th>Listed price</th></tr></thead><tbody>${p.items.map(i=>`<tr><td>${escape(i.name)}</td><td>${i.quantity}</td><td>${money(i.priceCp)}${i.pricePer>1?' per '+i.pricePer:''}</td></tr>`).join('')}</tbody></table><p>Currency: ${Object.entries(p.coins).filter(([,n])=>n).map(([k,n])=>n+' '+k).join(', ')||'none'}. Total value: ${money(preparationValue(p))}.</p>`);}
