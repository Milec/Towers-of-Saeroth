import { createHash } from "node:crypto";
import { sceneStats } from "./caravan-scene-version.mjs";

const scope = "saeroth-pf2e-content", level = "defaultLevel0000";
// All coordinates traced against the generated 1254px square images, not prompts.
function make(slug, name, setup) {
  const id = key => createHash("sha256").update(`${slug}:${key}`).digest("hex").slice(0,16);
  const px = n => Math.round(n * 3200 / 1254);
  const asset = `assets/maps/${slug}.png`;
  const scene = {
    _stats: sceneStats(), _id:id("scene"), name, active:false, navigation:false,
    width:3200,height:3200,padding:0,initial:{x:1600,y:1600,scale:.3},initialLevel:level,
    thumb:`modules/${scope}/${asset}`,
    grid:{type:1,size:100,distance:5,units:"ft",alpha:.15,color:"#b8b0a0",style:"solidLines",thickness:1},
    tokenVision:true,environment:{darknessLevel:0,darknessLock:true,cycle:false,
      globalLight:{enabled:true,bright:false,darkness:{min:0,max:.25}}},
    levels:[{_id:level,name:"Ground",elevation:{bottom:null,top:null},
      background:{src:`modules/${scope}/${asset}`,color:"#252820"},
      textures:{fit:"fill",scaleX:1,scaleY:1,anchorX:.5,anchorY:.5,offsetX:0,offsetY:0,rotation:0}}],
    walls:[],lights:[],tokens:[],notes:[],sounds:[],drawings:[],regions:[],tiles:[],
    ownership:{default:0},flags:{[scope]:{session:3,setup,
      source:"campaign/sessions/Session 3 - The Mountain Road.md",
      limitations:"No automated falls, landslides, terrain costs, combat or tower transition. NPC positions are staging instructions, not preplaced actors. GM notes remain in the companion prep note."}}
  };
  const wall=(label,a,b,{door=false,open=false,opaque=true}={})=>scene.walls.push({
    _id:id(`wall:${scene.walls.length}`),c:[...a,...b].map(px),levels:[level],
    move:20,sight:opaque?20:0,light:opaque?20:0,sound:0,dir:0,door:door?1:0,ds:open?1:0,
    flags:{[scope]:{label}}});
  const line=(label,points,options)=>points.slice(1).forEach((p,i)=>wall(label,points[i],p,options));
  const light=(name,x,y)=>scene.lights.push({_id:id(name),name,x:px(x),y:px(y),elevation:3,
    levels:[level],rotation:0,walls:true,vision:false,hidden:false,
    config:{bright:15,dim:30,angle:360,color:"#ffbf72",alpha:.25,luminosity:.5,
      attenuation:.5,darkness:{min:.25,max:1},animation:{type:"torch",speed:2,intensity:2}}});
  return {scene,asset,slug,wall,line,light};
}

export function buildSessionThreeScenes(){
  const m=make("session-3-mountain-crossing","Session 3 — Broken Mountain Crossing",
    "160ft square. Party enters west. Optional 3 Wolves (level 1 each, 90 XP for six level-2 PCs) staged west at image coordinates 170,340; 220,740; 90,870. Do not attack while the party is split over the ravine. Broken span is about 10ft; GM resolves jumps/ropes/falls. Transparent movement walls guard cliff edges; move tokens deliberately across only after adjudication. Landslide at 230,150 is a travel obstacle, not an automatic damaging trap.");
  m.line("West cliff edge",[[425,0],[450,200],[467,370],[485,515]],{opaque:false});
  m.line("West cliff edge",[[480,588],[439,780],[400,1000],[460,1254]],{opaque:false});
  m.line("East cliff edge",[[800,0],[804,230],[789,410],[760,514]],{opaque:false});
  m.line("East cliff edge",[[756,588],[787,790],[840,1000],[814,1254]],{opaque:false});
  for(const [a,b] of [[[335,510],[580,531]],[[335,579],[580,591]],[[668,529],[850,510]],[[668,585],[850,578]]])m.wall("Bridge railing",a,b,{opaque:false});
  m.wall("Broken west deck edge — GM adjudicates crossing",[580,531],[580,591],{opaque:false});
  m.wall("Broken east deck edge — GM adjudicates crossing",[668,529],[668,585],{opaque:false});
  // Optional placed lanterns for a dusk crossing; hidden until the GM lights them.
  m.light("West approach lantern (optional)",334,487);m.scene.lights.at(-1).hidden=true;
  m.light("East approach lantern (optional)",851,488);m.scene.lights.at(-1).hidden=true;

  const w=make("session-3-waystation","Session 3 — Mountain Toll Waystation",
    "Toll keeper begins in west office (390,425 image px); Wenzel Grauth rests in east shelter (970,490). Toll boom is a movement-only door. Social scene first: identify papers, offer work or payment. Wenzel is the established ambush necromancer, not a Lichdom official. He runs if confronted; he knows the intermediary, not Cassian. No combat staged automatically.");
  w.line("Tollhouse exterior",[[353,688],[114,688],[114,299],[475,299],[475,688],[389,688]]);
  w.wall("Tollhouse entrance",[353,688],[389,688],{door:true});
  w.wall("Bunk room partition",[278,299],[278,447]);
  w.wall("Bunk room door",[278,447],[278,501],{door:true});
  w.wall("Bunk room partition foot",[278,501],[278,512]);
  w.wall("Kitchen partition",[114,512],[325,512]);
  w.wall("Office door",[325,512],[367,512],{door:true});
  w.wall("Kitchen partition",[367,512],[475,512]);
  w.line("East shelter exterior",[[895,566],[895,415],[1094,415],[1094,619],[895,619],[895,604]]);
  w.wall("East shelter door",[895,566],[895,604],{door:true});
  w.wall("Toll boom",[535,568],[808,568],{door:true,opaque:false});
  w.line("Northwest low wall",[[20,300],[115,213],[280,147],[466,112]],{opaque:false});
  w.line("Northeast low wall",[[837,110],[967,63],[1150,18]],{opaque:false});
  w.light("Tollhouse hearth",196,563);w.light("Office lantern",422,431);
  w.light("Wenzel lamp",928,456);w.light("Rest yard fire",974,782);

  const e=make("session-3-expedition","Session 3 — Expedition Search Camp",
    "The expedition is SEARCHING for the tower; it has not found it. Party enters south; leader receives them in southeast command pavilion (985,800 image px). Sparse southwest stores show the supply problem. Northern trail leads to survey country, not a known tower. Missing food and climbing gear are a proposed recovery hook involving orc bandits, not established past events. No forced combat or NPC blame.");
  e.line("Command pavilion canvas",[[908,889],[817,889],[817,683],[1067,683],[1067,889],[977,889]]);
  e.wall("Command pavilion flap",[908,889],[977,889],{door:true,open:true});
  // Tents are solid scenery, not unprepared playable interiors.
  const tents=[[[185,155],[254,130],[287,211],[217,237]],[[344,121],[414,101],[440,185],[369,207]],[[841,100],[911,122],[886,207],[816,187]],[[980,150],[1056,176],[1026,251],[958,232]],[[176,927],[250,949],[223,1030],[151,1007]],[[354,960],[430,968],[421,1055],[344,1046]],[[822,991],[893,986],[899,1073],[826,1078]],[[990,977],[1057,960],[1081,1035],[1014,1055]]];
  tents.forEach((p,i)=>e.line(`Tent ${i+1} exterior`,[...p,p[0]]));
  // Crates are low cover rather than opaque buildings; no obsolete enclosure wall.
  for(const p of [[[168,660],[225,649],[242,719],[183,735]],[[309,735],[391,735],[400,799],[316,799]],[[220,812],[280,812],[286,881],[222,881]]])e.line("Supply crates",[...p,p[0]],{opaque:false});
  e.light("Central fire ring",626,570);e.scene.lights.at(-1).hidden=true;
  e.light("Cooking hearth",286,351);e.light("Command lantern",1047,799);e.light("Supply lantern",241,706);
  return [m,w,e].map(({scene,asset,slug})=>({scene,asset,slug}));
}
