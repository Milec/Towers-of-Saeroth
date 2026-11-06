const assert = require('node:assert/strict');
const engine = require('../../site/atlas/battlemap-engine.js');
const inside = (p, poly) => {
  let hit=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++) {
    const a=poly[i],b=poly[j];
    if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])hit=!hit;
  }
  return hit;
};
function intersects(a,b,c,d) {
  const cross=(p,q,r)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);
  const box=(p,q,r)=>r[0]>=Math.min(p[0],q[0])-1e-7&&r[0]<=Math.max(p[0],q[0])+1e-7&&r[1]>=Math.min(p[1],q[1])-1e-7&&r[1]<=Math.max(p[1],q[1])+1e-7;
  const x=cross(a,b,c),y=cross(a,b,d),z=cross(c,d,a),w=cross(c,d,b);
  return (x*y<0&&z*w<0)||(Math.abs(x)<1e-7&&box(a,b,c))||(Math.abs(y)<1e-7&&box(a,b,d))||(Math.abs(z)<1e-7&&box(c,d,a))||(Math.abs(w)<1e-7&&box(c,d,b));
}
function navigation(map) {
  // Test physical movement through the exported wall geometry, not merely the
  // decorative path list. Doors are traversable when opened; windows are not.
  const step=.5,n=map.cols/step,centre=(x,y)=>[(x+.5)*step,(y+.5)*step],bucket=new Map();
  map.walls.filter(w=>w.kind!=='door').forEach(w=>{
    for(let x=Math.floor(Math.min(w.a[0],w.b[0]))-1;x<=Math.ceil(Math.max(w.a[0],w.b[0]))+1;x++)for(let y=Math.floor(Math.min(w.a[1],w.b[1]))-1;y<=Math.ceil(Math.max(w.a[1],w.b[1]))+1;y++){
      const k=x+','+y;if(!bucket.has(k))bucket.set(k,[]);bucket.get(k).push(w);
    }
  });
  const canStand=p=>map.kind!=='cave'||map.floorPolygons.some(poly=>inside(p,poly))&&!map.floorHoles.some(poly=>inside(p,poly));
  const toCell=p=>[Math.min(n-1,Math.floor(p[0]/step)),Math.min(n-1,Math.floor(p[1]/step))];
  const start=toCell(map.navigation.entry),queue=[start],seen=new Set([start.join(',')]);
  assert(canStand(centre(...start)),`${map.kind} entry starts inside a solid cave wall`);
  for(let head=0;head<queue.length;head++){
    const [x,y]=queue[head],a=centre(x,y);
    for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){
      const nx=x+dx,ny=y+dy,k=nx+','+ny;if(nx<0||ny<0||nx>=n||ny>=n||seen.has(k))continue;
      const b=centre(nx,ny);if(!canStand(b))continue;
      if((bucket.get(Math.floor(a[0])+','+Math.floor(a[1]))||[]).some(w=>intersects(a,b,w.a,w.b)))continue;
      seen.add(k);queue.push([nx,ny]);
    }
  }
  const reachable=p=>{const [x,y]=toCell(p);return [[x,y],[x-1,y],[x+1,y],[x,y-1],[x,y+1]].some(p=>seen.has(p.join(',')));};
  for(const [purpose,p]of [['focus',map.navigation.focus],['exit',map.navigation.exit]])if(p)assert(reachable(p),`${map.kind}/${map.terrain}/${map.cols}/${map.seed}: blocked ${purpose}`);
  for(const d of map.walls.filter(w=>w.kind==='door'))assert(reachable([(d.a[0]+d.b[0])/2,(d.a[1]+d.b[1])/2]),`${map.kind}: unreachable door`);
  for(const tent of map.props.filter(p=>p.kind==='tent'))assert(reachable([tent.x,tent.y]),`${map.kind}: tent interior sealed off`);
  assert(seen.size>map.cols*2,'A useful area must be reachable, not just one grid square.');
}
function geometry(map) {
  const valid=p=>assert(Array.isArray(p)&&p.length===2&&p.every(v=>Number.isFinite(v)&&v>=-1e-6&&v<=map.cols+1e-6),`Out of bounds point in ${map.kind}: ${p}`);
  assert.equal(map.cellSize,100);assert.equal(map.rows,map.cols);assert.equal(map.version,1);
  assert(map.walls.length<650,'Avoid excessive scene wall counts.');
  for(const w of map.walls){valid(w.a);valid(w.b);assert(['wall','door','window','terrain'].includes(w.kind));assert(Math.hypot(w.b[0]-w.a[0],w.b[1]-w.a[1])>.01);}
  for(const a of map.areas)for(const p of a.polygon)valid(p);
  for(const light of map.lights){valid([light.x,light.y]);assert(light.bright>=0&&light.dim>=light.bright&&light.dim<=20);assert(/^#[a-f0-9]{6}$/i.test(light.color));}
  valid(map.navigation.entry);valid(map.navigation.focus);if(map.navigation.exit)valid(map.navigation.exit);
  // No solid wall may overlap a declared doorway and block its interactive door.
  for(const door of map.walls.filter(w=>w.kind==='door'))for(const w of map.walls.filter(w=>w.kind!=='door')){
    const dx=door.b[0]-door.a[0],dy=door.b[1]-door.a[1],len=Math.hypot(dx,dy);
    const offset=p=>Math.abs(dx*(p[1]-door.a[1])-dy*(p[0]-door.a[0]))/len;
    if(offset(w.a)>1e-6||offset(w.b)>1e-6)continue;
    const project=p=>((p[0]-door.a[0])*dx+(p[1]-door.a[1])*dy)/(len*len),low=Math.min(project(w.a),project(w.b)),high=Math.max(project(w.a),project(w.b));
    assert(Math.min(1,high)-Math.max(0,low)<1e-6,`${map.kind}: solid geometry overlaps door`);
  }
}
let count=0,maxWalls=0;
for(const kind of engine.kinds)for(const terrain of engine.terrains)for(const size of [24,32,40])for(const seed of ['lantern-17','snow pass','月の旅']) {
  const config={kind,terrain,size,seed,name:'Atlas fixture',source:{type:'poi',id:17}},map=engine.generate(config);
  geometry(map);assert.deepEqual(map,engine.generate(config),'Same settings must reproduce the exact scene and image features.');
  maxWalls=Math.max(maxWalls,map.walls.length);count++;
  navigation(map);
}
for(const kind of engine.kinds){const a=engine.generate({kind,seed:'one'}),b=engine.generate({kind,seed:'two'});assert.notDeepEqual([a.walls,a.props,a.areas],[b.walls,b.props,b.areas],`Reroll ${kind} must change physical features.`);}
for(const input of [{seed:''},{seed:' '.repeat(4)},{seed:'a'.repeat(81)},{seed:{toString:()=>''}},{seed:'x',size:1000},{seed:'x',kind:'bad'},{seed:'x',terrain:'bad'}])assert.throws(()=>engine.generate(input));
assert.throws(()=>engine.render(null,{}));
assert.throws(()=>engine.render({getContext(){}},{version:1,cols:10000,rows:10000}));
console.log(`Battle maps: ${count} deterministic terrain/layout/size/seed combinations, bounds, door gaps, reachable objectives/tents/doors, rerolls, and invalid-input guards passed; maximum ${maxWalls} walls.`);
