/* National population baseline, then shrink-only dominance within 30 km. */
function settlementHierarchy(items,radius=15){
 const nationalMax=new Map();
 for(const b of items)if(b.state>0)nationalMax.set(b.state,Math.max(nationalMax.get(b.state)||0,b.population));
 const sizes=items.map(b=>b.width*(nationalMax.get(b.state)>0?Math.pow(Math.max(0,b.population)/nationalMax.get(b.state),.25):1)),order=items.map((_,i)=>i).sort((a,b)=>items[b].population-items[a].population||items[a].id-items[b].id);
 for(let rank=0;rank<order.length;rank++){
  const i=order[rank],b=items[i];
  for(let j=0;j<rank;j++){
   const k=order[j],larger=items[k];
   if(larger.population<=b.population||Math.hypot(b.x-larger.x,b.y-larger.y)>radius)continue;
   sizes[i]=Math.min(sizes[i],sizes[k]*Math.pow(Math.max(b.population,0)/larger.population,.25));
  }
 }
 return sizes.map((size,i)=>size/items[i].width);
}
window.settlementHierarchy=settlementHierarchy;
const hierarchyItems=D.burgs.map(b=>{
 const e=$('#settlements [data-id="'+b.i+'"]'),use=e.querySelector('use'),symbol=document.getElementById(use.getAttribute('href').slice(1));
 const width=Number(symbol.querySelector('image')?.getAttribute('width'))||({village:18,town:25,city:32,metropolis:40}[tier(b)]);
 return {id:b.i,state:b.state,x:b.x,y:b.y,population:b.population,width:width*(b.capital?1.15:1)};
});
const hierarchyScales=settlementHierarchy(hierarchyItems);
hierarchyItems.forEach((b,i)=>{
 const factor=hierarchyScales[i],e=$('#settlements [data-id="'+b.id+'"]');
 e.dataset.populationScale=factor;e.dataset.originalWidth=b.width;e.dataset.displayWidth=b.width*factor;
 if(factor>=1)return;
 const art=document.createElementNS(NS,'g');art.setAttribute('transform','scale('+factor+')');art.classList.add('settlement-art');
 for(const use of [...e.children].filter(c=>c.tagName.toLowerCase()==='use'))art.append(use);
 e.append(art); // Transparent selection target and labels retain their normal size.
 const harbor=$('#ports [data-id="'+b.id+'"]');
 if(harbor)harbor.setAttribute('transform',`translate(${b.x} ${b.y}) scale(${factor}) translate(${-b.x} ${-b.y})`);
});
$('#symbolLegend').insertAdjacentHTML('beforeend','<p class="muted">Settlement symbols scale against their nation’s largest settlement, including isolated places. Within 30 km, smaller populations shrink further where needed. Existing icon sizes are maximums; unclaimed settlements use the nearby comparison only.</p>');

// POIs follow the displayed size of their nearest settlement, not its
// unscaled sprite. Strategic passes, volcanoes and lore landmarks keep their
// original artwork size: their importance is independent of nearby population.
function scaleLandmarkArtwork(e,x,y,major=false){
 const nearby=hierarchyItems.reduce((best,b)=>{
  const d=Math.hypot(b.x-x,b.y-y);
  return !best||d<best.distance?{b,distance:d}:best;
 },null);
 if(!nearby)return;
 const reference=+$('#settlements [data-id="'+nearby.b.id+'"]').dataset.displayWidth;
 const uses=[...e.children].filter(c=>c.tagName.toLowerCase()==='use');
 if(!uses.length)return;
 const use=uses[0],symbol=document.getElementById(use.getAttribute('href').slice(1));
 const baseWidth=+(symbol.querySelector('image')?.getAttribute('width')||40);
 const baseScale=Number(/scale\(([^ )]+)/.exec(use.getAttribute('transform')||'')?.[1]||1);
 const width=baseWidth*baseScale,target=major?width:reference*.85;
 const factor=major?1:Math.min(.85,target/width);
 const art=document.createElementNS(NS,'g');art.classList.add('poi-art');
 art.setAttribute('transform','scale('+factor+')');
 for(const u of uses)art.append(u);
 e.append(art);
 e.dataset.poiScale=factor;e.dataset.displayWidth=width*factor;
 e.dataset.landmarkImportance=major?'major':'local';
 e.dataset.referenceSettlement=nearby.b.id;e.dataset.sizeLimit=target;
}
for(const m of D.markers){
 const e=$('#pois [data-id="'+m.i+'"]');
 if(e)scaleLandmarkArtwork(e,m.x,m.y,!!m.loreSource||/volcano|mountain-pass/.test(m.type));
}
for(const c of D.crossings||[]){
 const e=$('#crossings [data-id="'+c.i+'"]');
 if(e)scaleLandmarkArtwork(e,c.point[0],c.point[1]);
}
$('#symbolLegend').insertAdjacentHTML('beforeend','<p class="muted">Strategic passes, volcanoes and lore landmarks retain their original prominent sizes. Ordinary POIs and crossings scale to nearby settlements. Tap targets and names remain unchanged.</p>');
