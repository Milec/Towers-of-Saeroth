import {createHash} from 'node:crypto';
import {buildSessionThreeScenes} from './session-three-scenes.mjs';
export function buildHotSpringsScene(){
 const slug='mountain-hot-springs',asset=`assets/maps/${slug}.png`;
 const scene=structuredClone(buildSessionThreeScenes()[0].scene);
 const id=k=>createHash('sha256').update(`${slug}:${k}`).digest('hex').slice(0,16);
 const px=n=>Math.round(n*2800/1254);
 scene._id=id('scene');scene.name='Mountain Hot Springs';scene.width=2800;scene.height=2800;
 scene.initial={x:1400,y:1400,scale:.35};scene.thumb=scene.levels[0].background.src=`modules/saeroth-pf2e-content/${asset}`;
 scene.walls=[];scene.lights=[];
 scene.flags={'saeroth-pf2e-content':{setup:'140ft square, 5ft grid. Three natural pools with open walkable banks and southern clearing. Solid large rocks block movement/sight/light; pool edges are not walls. Water depth, slippery footing, heat and steam concealment are GM-adjudicated, not automated hazards. Daylight default. Two hidden optional bank lanterns can be revealed at night; pools do not glow. No actors, combat, doors or structures.'}};
 const rocks=[[[703,171],[736,143],[777,158],[804,198],[779,250],[744,251],[713,215]],[[651,122],[686,108],[718,123],[711,158],[666,176],[649,150]],[[392,41],[435,30],[478,47],[524,94],[533,128],[492,157],[451,139],[421,99]],[[232,357],[272,325],[313,335],[333,372],[302,422],[263,446],[231,416]],[[231,558],[269,529],[304,548],[326,589],[312,627],[271,642],[239,610]],[[146,681],[177,669],[199,700],[211,754],[191,792],[153,788],[132,750]],[[402,699],[432,677],[466,697],[488,737],[472,768],[431,779],[395,753]],[[723,751],[771,715],[832,709],[885,745],[900,782],[851,826],[805,840],[754,814]],[[348,900],[384,876],[426,883],[445,917],[434,960],[402,975],[366,956],[339,925]],[[930,945],[961,912],[1001,924],[1035,967],[1017,1012],[975,1039],[942,1014]],[[913,660],[939,646],[960,673],[963,705],[941,728],[915,711]],[[987,481],[1015,470],[1045,485],[1049,511],[1014,530],[988,510]],[[899,345],[938,325],[959,352],[942,379],[907,395],[891,374]],[[935,384],[961,373],[982,387],[984,416],[956,425],[933,409]]];
 rocks.forEach((p,i)=>p.forEach((a,j)=>scene.walls.push({_id:id(`wall-${i}-${j}`),c:[...a,...p[(j+1)%p.length]].map(px),levels:[scene.initialLevel],move:20,sight:20,light:20,sound:0,dir:0,door:0,ds:0,flags:{'saeroth-pf2e-content':{label:`Granite boulder ${i+1}`}}})));
 for(const [i,x,y] of [[0,525,888],[1,845,263]])scene.lights.push({_id:id(`lantern-${i}`),name:'Optional bank lantern',x:px(x),y:px(y),elevation:2,levels:[scene.initialLevel],rotation:0,walls:true,vision:false,hidden:true,config:{bright:15,dim:30,angle:360,color:'#ffbf72',alpha:.25,luminosity:.5,attenuation:.5,darkness:{min:.25,max:1},animation:{type:'torch',speed:2,intensity:2}}});
 return {slug,asset,scene};
}
