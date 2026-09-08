/* Load only visible, high-detail regional backgrounds; overview is the fallback. */
const detailBackground=document.createElementNS(NS,'g');detailBackground.id='backgroundDetail';
detailBackground.setAttribute('pointer-events','none');detailBackground.setAttribute('aria-hidden','true');
$('#background').after(detailBackground);
const backgroundTiles=new Map();let backgroundTimer=null,backgroundStyle='';
function backgroundTileKeys(bounds){
 const [x,y,w,h]=bounds,keys=[];
 for(let row=Math.max(0,Math.floor(y/270));row<=Math.min(7,Math.floor((y+h)/270));row++)
  for(let col=Math.max(0,Math.floor(x/480));col<=Math.min(7,Math.floor((x+w)/480));col++)keys.push({col,row,d:Math.hypot(col*480+240-x-w/2,row*270+135-y-h/2)});
 return keys.sort((a,b)=>a.d-b.d).slice(0,12);
}
function updateBackgroundDetail(){
 const width=map.clientWidth||900,height=map.clientHeight||width*9/16;
 const unit=Math.max(box[2]/width,box[3]/height),z=3840/box[2];
 const style=$('[data-style][aria-pressed="true"]').dataset.style;
 if(window.ATLAS_PRINT||z<6||unit>1){detailBackground.replaceChildren();backgroundTiles.clear();return;}
 // Account for the extra visible area around a letterboxed SVG on mobile.
 const w=width*unit,h=height*unit,bounds=[box[0]+(box[2]-w)/2,box[1]+(box[3]-h)/2,w,h];
 if(style!==backgroundStyle){detailBackground.replaceChildren();backgroundTiles.clear();backgroundStyle=style;}
 const wanted=new Set();
 for(const {col,row} of backgroundTileKeys(bounds)){
  const key=`${style}-${col}-${row}`;wanted.add(key);if(backgroundTiles.has(key))continue;
  const tile=document.createElementNS(NS,'image');tile.dataset.tile=key;
  for(const [k,v] of Object.entries({x:col*480,y:row*270,width:480,height:270,preserveAspectRatio:'none'}))tile.setAttribute(k,v);
  tile.setAttribute('visibility','hidden');
  tile.addEventListener('load',()=>{if(backgroundTiles.get(key)===tile)tile.removeAttribute('visibility');});
  tile.addEventListener('error',()=>{tile.remove();if(backgroundTiles.get(key)===tile)backgroundTiles.delete(key);});
  backgroundTiles.set(key,tile);detailBackground.append(tile);
  tile.setAttribute('href',`assets/zoom-tiles/${key}.svg`);
 }
 for(const [key,tile] of backgroundTiles)if(!wanted.has(key)){tile.remove();backgroundTiles.delete(key);}
}
function scheduleBackgroundDetail(){clearTimeout(backgroundTimer);backgroundTimer=setTimeout(updateBackgroundDetail,120);}
const detailBackgroundRender=renderSettlementNames;
renderSettlementNames=function(z,unit){detailBackgroundRender(z,unit);scheduleBackgroundDetail();};
document.querySelectorAll('[data-style]').forEach(button=>button.addEventListener('click',()=>{
 detailBackground.replaceChildren();backgroundTiles.clear();scheduleBackgroundDetail();
}));
window.backgroundTileKeys=backgroundTileKeys;window.updateBackgroundDetail=updateBackgroundDetail;
renderView();
