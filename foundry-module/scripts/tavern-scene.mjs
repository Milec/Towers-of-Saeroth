import { createHash } from "node:crypto";
import { sceneStats } from "./caravan-scene-version.mjs";

export function buildTavernScene() {
  const moduleId = "saeroth-pf2e-content";
  const slug = "large-tavern";
  const id = key => createHash("sha256").update(`${slug}:${key}`).digest("hex").slice(0, 16);
  // Trace coordinates are measured on the unchanged 1536 x 1024 source art.
  // 36 x 24 five-foot squares: 180 x 120 feet including the exterior margin.
  const px = n => Math.round(n * 3600 / 1536);
  const ground = id("ground");
  const cellar = id("cellar");
  const upstairs = id("upstairs");
  const assets = ["assets/maps/large-tavern-ground-upstairs.png", "assets/maps/large-tavern-cellar.png", "assets/maps/large-tavern-upstairs.png"];
  const scene = {
    _stats: sceneStats(), _id: id("scene"), name: "Large Roadside Tavern — Three Floors",
    active: false, navigation: false, navOrder: 0,
    width: 3600, height: 2400, padding: 0, shiftX: 0, shiftY: 0,
    initial: { x: 1800, y: 1200, scale: .3 }, initialLevel: ground,
    thumb: `modules/${moduleId}/${assets[0]}`,
    grid: { type: 1, size: 100, distance: 5, units: "ft", alpha: .12,
      color: "#c9b99d", style: "solidLines", thickness: 1 },
    tokenVision: true, fog: { exploration: true },
    environment: { darknessLevel: .7, darknessLock: true, cycle: false,
      globalLight: { enabled: false, bright: false, darkness: { min: 0, max: 1 } } },
    levels: [
      { _id: ground, name: "Ground floor — taproom", elevation: { bottom: 0, top: 10 }, sort: 100000 },
      { _id: cellar, name: "Cellar", elevation: { bottom: -10, top: 0 }, sort: 0 },
      { _id: upstairs, name: "Upstairs — eight guest bedrooms", elevation: { bottom: 10, top: 20 }, sort: 200000 },
    ].map((level, i) => ({ ...level,
      background: { src: `modules/${moduleId}/${assets[i]}`, color: "#221d17" },
      textures: { fit: "fill", scaleX: 1, scaleY: 1, anchorX: .5, anchorY: .5,
        offsetX: 0, offsetY: 0, rotation: 0 },
    })),
    walls: [], lights: [], tokens: [], notes: [], sounds: [], drawings: [], regions: [], tiles: [],
    ownership: { default: 0 }, flags: { [moduleId]: {
      setup: "180 x 120ft, 36 x 24 five-foot squares. Three native v14 levels: ground 0ft, cellar -10ft, bedrooms 10ft. 8 ground-floor doors, 5 cellar doors and 8 bedroom doors. West wine-room door starts locked. Solid walls block sight/light/sound; low furniture blocks movement only. Guest stairs rise north from the taproom; upstairs exit north and follow the east-side landing into the corridor. Switch token level/elevation manually at stairs (see README for landing coordinates). No teleport automation, roof tiles, actors or audio. Furniture and open door leaves are painted background art; door controls determine actual passage. Import with installed local map assets."
    } },
  };
  function wall(level, label, a, b, { door = 0, state = 0, opaque = true } = {}) {
    scene.walls.push({ _id: id(`${level}:${label}`), c: [...a, ...b].map(px), levels: [level],
      move: 20, sight: opaque ? 20 : 0, light: opaque ? 20 : 0, sound: opaque ? 20 : 0,
      dir: 0, door, ds: state, flags: { [moduleId]: { label } } });
  }
  function rect(level, label, x1, y1, x2, y2, opaque = true) {
    const points = [[x1,y1],[x2,y1],[x2,y2],[x1,y2]];
    points.forEach((p,i) => wall(level, `${label} ${i}`, p, points[(i+1)%4], { opaque }));
  }
  function divided(level, label, vertical, fixed, start, end, openings) {
    const point = n => vertical ? [fixed,n] : [n,fixed];
    let at = start;
    openings.forEach(([lo,hi,name,state = 0],i) => {
      wall(level, `${label} segment ${i}`, point(at), point(lo));
      wall(level, name, point(lo), point(hi), { door: 1, state });
      at = hi;
    });
    wall(level, `${label} end`, point(at), point(end));
  }
  // Ground exterior. Door art is open; closed Foundry doors still block entry.
  wall(ground, "North exterior", [103,63], [1433,63]);
  divided(ground, "East exterior", true, 1433, 63, 817, [[177,230,"Kitchen service exit"]]);
  divided(ground, "South exterior", false, 817, 103, 1433, [[682,818,"Main double entrance"]]);
  divided(ground, "West exterior", true, 103, 63, 817, [[579,634,"West side exit"]]);
  divided(ground, "Service wing", true, 976, 63, 817,
    [[172,229,"Kitchen to taproom"],[418,478,"Pantry to taproom"],[658,718,"Private dining to taproom"]]);
  divided(ground, "Kitchen pantry partition", false, 320, 976, 1433, [[1078,1132,"Kitchen to pantry"]]);
  divided(ground, "Pantry dining partition", false, 555, 976, 1433, [[1080,1135,"Pantry to private dining"]]);
  // The stage and loose chairs are walkable; table/bar tops need climbing over.
  for (const [name,x1,y1,x2,y2] of [
    ["Northeast table",648,335,791,402],
    ["Southwest table",396,524,547,592], ["Southeast table",648,523,791,592],
    ["Private table",1074,677,1287,745], ["Kitchen workbench",1097,178,1212,237],
    ["Bar counter",493,159,879,206], ["Bar return",475,80,499,173],
  ]) rect(ground,name,x1,y1,x2,y2,false);
  // Solid masonry at the hearth/oven; lights sit on their room-facing edges.
  rect(ground,"Taproom hearth masonry",122,345,182,551);
  rect(ground,"Kitchen oven masonry",1279,83,1395,182);
  for (const [name,x,y,r] of [["Round northwest",295,358,29],["Round northeast",884,365,29],
    ["Round southwest",334,691,28],["Round southeast",845,696,29]]) {
    const points = Array.from({length:8},(_,i)=>[x+Math.cos(i*Math.PI/4)*r,y+Math.sin(i*Math.PI/4)*r]);
    points.forEach((p,i)=>wall(ground,`${name} ${i}`,p,points[(i+1)%8],{opaque:false}));
  }
  // Cellar has no exterior exits: only its internal stair connects the floors.
  rect(cellar,"Cellar foundation",103,63,1433,817);
  divided(cellar,"Cellar service wing",true,977,63,817,
    [[174,230,"Secure wine room",2],[430,480,"Cellar stair landing"],[660,718,"Cool storeroom"]]);
  divided(cellar,"Wine landing partition",false,320,977,1433,[[1080,1132,"Wine room to landing"]]);
  divided(cellar,"Landing storeroom partition",false,557,977,1433,[[1080,1133,"Landing to storeroom"]]);
  rect(cellar,"West support pillar",402,434,439,475);
  rect(cellar,"East support pillar",730,434,768,475);
  for (const [name,x1,y1,x2,y2] of [
    ["Northwest cask rack",375,282,555,390], ["Northeast cask rack",601,282,798,390],
    ["Southwest cask rack",378,533,559,643], ["Southeast cask rack",596,533,797,647],
  ]) rect(cellar,name,x1,y1,x2,y2,false);
  // Cellar stairs rise north; on the ground floor their opening is north.
  for (const level of [ground,cellar]) {
    wall(level,"Stair west cheek",[1290,344],[1290,506]);
    wall(level,"Stair east cheek",[1401,344],[1401,506]);
    const end = level === cellar ? 344 : 506;
    wall(level,"Stair closed end",[1290,end],[1401,end]);
  }
  // Upstairs traced independently: eight rooms and an open central corridor.
  // Shuttered windows remain opaque rather than being decorative wall gaps.
  rect(upstairs,"Upstairs exterior",103,63,1433,828);
  divided(upstairs,"Northwest bedroom corridor wall",false,350,103,370,[[239,281,"Bedroom 1 door"]]);
  wall(upstairs,"Bedroom 1 stair partition",[370,63],[370,350]);
  wall(upstairs,"Stair bedroom 2 partition",[536,63],[536,350]);
  divided(upstairs,"North bedroom corridor wall",false,350,536,1433,
    [[653,695,"Bedroom 2 door"],[939,982,"Bedroom 3 door"],[1225,1269,"Bedroom 4 door"]]);
  for(const x of [810,1100]) wall(upstairs,`North bedroom partition ${x}`,[x,63],[x,350]);
  divided(upstairs,"South bedroom corridor wall",false,564,103,1433,
    [[255,302,"Bedroom 5 door"],[607,651,"Bedroom 6 door"],[903,949,"Bedroom 7 door"],[1217,1263,"Bedroom 8 door"]]);
  for(const x of [453,779,1100]) wall(upstairs,`South bedroom partition ${x}`,[x,564],[x,828]);
  // Trace each image's rails. The ground approach is SOUTH, upstairs exit NORTH.
  // The east-side upper landing is deliberately open all the way to the corridor.
  for(const [level,left,right,top,bottom] of [[ground,377,451,174,309],[upstairs,394,475,185,314]]) {
    wall(level,"Guest stair left rail",[left,top],[left,bottom],{opaque:false});
    wall(level,"Guest stair right rail",[right,top],[right,bottom],{opaque:false});
    const end = level === ground ? top : bottom;
    wall(level,"Guest stair closed end",[left,end],[right,end],{opaque:false});
  }
  function light(level,label,x,y,bright,dim,fire=false) {
    scene.lights.push({ _id:id(`${level}:light:${label}`), name:label, x:px(x),y:px(y),
      elevation:level===ground?5:level===cellar?-5:15, levels:[level], rotation:0, walls:true, vision:false, hidden:false,
      config:{bright,dim,angle:360,color:fire?"#ff9b42":"#ffd29a",alpha:.22,luminosity:.5,
        attenuation:.5,darkness:{min:0,max:1},animation:{type:"torch",speed:fire?3:1,intensity:fire?3:1}} });
  }
  light(ground,"Taproom hearth",195,432,25,50,true);
  light(ground,"Kitchen oven",1321,197,15,30,true);
  for(const [label,x,y,bright,dim] of [
    ["Bar lantern",709,173,20,40],
    ["Northeast taproom candles",714,364,15,30],["South taproom candles",468,560,15,30],
    ["Southeast taproom candles",715,555,15,30],["Private dining candles",1190,696,15,30],
    ["Pantry lantern",999,445,10,20],["Stage lantern",146,111,10,25],
    ["Entrance lantern",754,784,10,25],["Outside entrance lantern",839,856,10,20],
  ]) light(ground,label,x,y,bright,dim);
  for(const [label,x,y] of [["North cellar lantern",671,104],["West cellar lantern",137,443],
    ["Wine west lantern",1002,201],["Wine east lantern",1407,211],
    ["Stair lantern",1407,416],["Storeroom lantern",1001,692],["South cellar lantern",861,781]]) {
    light(cellar,label,x,y,10,25);
  }
  for(const [label,x,y] of [["Bedroom 1 candle",325,124],["Bedroom 2 candle",760,121],
    ["Bedroom 3 candle",935,127],["Bedroom 4 candle",1146,125],["Bedroom 5 candle",277,635],
    ["Bedroom 6 candle",527,635],["Bedroom 7 candle",931,636],["Bedroom 8 candle",1177,638]]) {
    light(upstairs,label,x,y,10,25);
  }
  for(const [label,x,y] of [["West corridor lantern",173,412],["East corridor lantern",1366,418],
    ["Stair landing lantern",501,136],["Central corridor lantern",801,389]]) {
    light(upstairs,label,x,y,15,35);
  }
  return { slug, asset:assets[0], assets, scene };
}
