/* Generated artwork is clipped in SVG; source PNG alpha and pixels stay intact. */
const PAINT=window.ATLAS_PAINT;let paintSerial=0;
function painted(sheet,index,width,height){
 const factor=index===12?.94:sheet==='terrain'?(index<2?.93:.85):.90;
 const size=Math.min(width,height)*factor;
 return `<image href="assets/blended-${String(index).padStart(2,'0')}.png" x="${-size/2}" y="${-height*factor*.78}" width="${size}" height="${size}"/>`;
}

Object.entries({mountain:[0,58,49],mountain2:[1,58,49],hill:[2,39,31],forest:[3,30,30],pine:[4,31,33],palm:[5,33,31],dune:[6,35,28],marsh:[7,29,25],glacier:[0,55,46]}).forEach(([k,[i,w,h]])=>window.ATLAS_ICONS.symbols[k]=painted('terrain',i,w,h));
Object.entries({village:[8,18,18],town:[9,25,25],city:[10,32,32],metropolis:[11,40,40],highforge:[12,50,50],harbor:[13,32,32]}).forEach(([k,[i,w,h]])=>window.ATLAS_ICONS.symbols[k]=painted('settlements',i,w,h));
window.installPaintedLandmarks=()=>{
 const ids={volcano:14,fortress:15,pass:16,ruin:17,mine:18,shrine:19,water:20,tower:21,inn:22,cave:23,monument:19};
 for(const [name,i] of Object.entries(ids)){const e=document.getElementById('poi-'+name);if(e)e.innerHTML=painted('landmarks',i,45,45);}
 const forest=document.getElementById('poi-forest');if(forest)forest.innerHTML=painted('terrain',3,42,42);
};
