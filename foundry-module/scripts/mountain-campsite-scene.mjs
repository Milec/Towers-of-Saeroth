import { createHash } from 'node:crypto';
import { buildSessionThreeScenes } from './session-three-scenes.mjs';

export function buildMountainCampsiteScene() {
  const slug='mountain-survivors-campsite',asset=`assets/maps/${slug}.png`;
  const scene=structuredClone(buildSessionThreeScenes()[0].scene);
  const id=key=>createHash('sha256').update(`${slug}:${key}`).digest('hex').slice(0,16);
  const px=n=>Math.round(n*2400/1254);
  scene._id=id('scene');scene.name='Mountain Campsite — Three Tents';
  scene.width=2400;scene.height=2400;scene.initial={x:1200,y:1200,scale:.4};
  scene.thumb=scene.levels[0].background.src=`modules/saeroth-pf2e-content/${asset}`;
  scene.environment.darknessLevel=.65;
  scene.walls=[];scene.lights=[];
  scene.flags={'saeroth-pf2e-content':{setup:'120ft square, 5ft grid. Survivors on foot: exactly three tents, no carts, horses or cargo stores. Southwest trail entrance; northeast exit. Three cutaway tents have open door flaps and playable interiors. Night lighting from central fire. Change darkness for daytime; hide fire light if extinguished. Rocks block movement and sight; low shrubs and scree remain GM-adjudicated terrain. Bedding is decorative, not a fixed sleeping assignment. No actors or combat preplaced.'}};
  function wall(label,a,b,door=false){scene.walls.push({_id:id(`wall-${scene.walls.length}`),c:[...a,...b].map(px),levels:[scene.initialLevel],move:20,sight:20,light:20,sound:0,dir:0,door:door?1:0,ds:door?1:0,flags:{'saeroth-pf2e-content':{label}}});}
  function line(label,p){for(let i=1;i<p.length;i++)wall(label,p[i-1],p[i]);}
  // Canvas footprints traced against the cutaway art; entrance gaps remain operable.
  line('North tent canvas',[[549,370],[526,370],[526,251],[620,251],[620,370],[595,370]]);
  wall('North tent flap',[549,370],[595,370],true);
  line('Southwest tent canvas',[[465,544],[452,520],[350,577],[391,651],[497,600],[486,577]]);
  wall('Southwest tent flap',[465,544],[486,577],true);
  line('Southeast tent canvas',[[765,571],[779,539],[883,587],[848,674],[737,626],[751,600]]);
  wall('Southeast tent flap',[765,571],[751,600],true);
  const rocks=[
    [[91,304],[140,282],[191,312],[228,371],[255,430],[244,461],[185,467],[144,433],[106,380]],
    [[951,319],[994,293],[1050,282],[1080,303],[1056,351],[1005,379],[967,367]],
    [[932,393],[967,373],[995,392],[997,426],[969,451],[944,446],[923,420]],
    [[983,624],[1018,608],[1046,635],[1036,665],[1007,672],[979,653]],
    [[609,783],[642,759],[681,771],[703,806],[680,844],[635,845],[600,820]],
    [[435,822],[463,804],[495,818],[508,848],[490,872],[455,870],[435,845]],
    [[676,112],[715,99],[746,122],[739,151],[710,168],[681,151]],
    [[772,68],[819,53],[881,65],[929,102],[921,137],[869,157],[817,133],[781,107]]
  ];
  rocks.forEach((p,i)=>line(`Boulder ${i+1}`,[...p,p[0]]));
  line('Northwest outcrop',[[130,0],[137,54],[183,88],[225,126],[277,168],[350,175],[402,139],[409,85],[373,35],[352,0]]);
  line('Southeast outcrop',[[1254,735],[1193,753],[1126,775],[1073,806],[997,810],[964,856],[949,909],[895,941],[832,954],[795,993],[783,1062],[712,1098],[672,1162],[651,1254]]);
  scene.lights.push({_id:id('campfire'),name:'Campfire',x:px(610),y:px(530),elevation:1,levels:[scene.initialLevel],rotation:0,walls:true,vision:false,hidden:false,config:{bright:20,dim:40,angle:360,color:'#ffad55',alpha:.3,luminosity:.5,attenuation:.5,darkness:{min:0,max:1},animation:{type:'torch',speed:2,intensity:3}}});
  return {slug,asset,scene};
}
