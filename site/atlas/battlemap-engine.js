/* Seeded, local tactical layouts. All model geometry is measured in 5 ft cells. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SaerothBattlemapEngine = api;
})(typeof window === 'object' ? window : null, function () {
  'use strict';
  const KINDS = ['road', 'camp', 'ruin', 'cave', 'shrine', 'inn', 'fort', 'bridge', 'tower'];
  const TERRAINS = ['forest', 'mountain', 'grassland', 'desert', 'snow', 'swamp', 'coast'];
  const PALETTES = {
    forest: { ground:'#536448', soil:'#7f7758', grass:'#6c7b50', dark:'#33452f', rock:'#898879', canopy:['#344c37','#46633e','#5a7547','#728354'], water:'#427174' },
    mountain: { ground:'#7a7b70', soil:'#a49c81', grass:'#858b65', dark:'#585d55', rock:'#a1a397', canopy:['#3e5045','#50604b','#657059','#768066'], water:'#46757c' },
    grassland: { ground:'#7b8252', soil:'#a18f66', grass:'#919561', dark:'#5d6942', rock:'#969382', canopy:['#4b6038','#657342','#7b844a','#8c925b'], water:'#477c80' },
    desert: { ground:'#b39a70', soil:'#ccaf80', grass:'#b59c60', dark:'#927956', rock:'#b29a7a', canopy:['#77734a','#8c8052','#a1915e','#b2a16f'], water:'#4e8887' },
    snow: { ground:'#cad1cf', soil:'#a4aaa7', grass:'#e0e1d8', dark:'#9ba8aa', rock:'#a2adaf', canopy:['#6f8a83','#8ca09a','#b3c2bb','#e0e6dd'], water:'#608a98' },
    swamp: { ground:'#4e5c48', soil:'#746f51', grass:'#68724e', dark:'#354535', rock:'#808573', canopy:['#344b35','#4c6140','#65734a','#7e8155'], water:'#465c56' },
    coast: { ground:'#a59f7b', soil:'#c6b58c', grass:'#8e9565', dark:'#7b8064', rock:'#a5a596', canopy:['#526849','#6a7c51','#7e8a5b','#939e6a'], water:'#3f7e87' },
  };
  const round = n => Math.round(n * 10000) / 10000;
  const pt = (x,y) => [round(x),round(y)];
  function hash(text) { let h=2166136261; for(const c of text) { h^=c.codePointAt(0); h=Math.imul(h,16777619); } return h>>>0; }
  function rng(seed) { let n=hash(seed); return () => { n+=0x6D2B79F5; let t=Math.imul(n^(n>>>15),1|n);t^=t+Math.imul(t^(t>>>7),61|t);return ((t^(t>>>14))>>>0)/4294967296; }; }
  function inside(p, polygon) { let yes=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++) { const a=polygon[i],b=polygon[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes; }return yes; }
  function distanceSegment(p,a,b) { const dx=b[0]-a[0],dy=b[1]-a[1],d=dx*dx+dy*dy,t=d?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/d)):0;return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy); }
  function rect(x,y,w,h) { return [pt(x,y),pt(x+w,y),pt(x+w,y+h),pt(x,y+h)]; }
  function ellipse(x,y,rx,ry,count=20,random) {return Array.from({length:count},(_,i)=>{const a=i/count*Math.PI*2,k=random?.()??.5;return pt(x+Math.cos(a)*rx*(.89+k*.22),y+Math.sin(a)*ry*(.89+k*.22));});}
  function generate(input={}) {
    const {kind='road',terrain='forest',size=32}=input;
    if(!KINDS.includes(kind)||!TERRAINS.includes(terrain)||![24,32,40].includes(size))throw Error('Choose a supported map type, terrain, and size.');
    if(typeof input.seed!=='string'||!input.seed.trim()||input.seed.length>80)throw Error('The map seed must contain 1–80 characters.');
    const seed=input.seed.trim(),r=rng(seed+'|'+kind+'|'+terrain+'|'+size),n=size,c=n/2;
    const range=(a,b)=>a+r()*(b-a),integer=(a,b)=>Math.floor(range(a,b+1));
    const map={version:1,algorithm:'saeroth-battlemap-v1',seed,kind,terrain,name:typeof input.name==='string'?input.name.slice(0,160):'Battle map',source:input.source?{type:String(input.source.type||'').slice(0,20),id:input.source.id}:null,cols:n,rows:n,cellSize:100,walls:[],lights:[],areas:[],paths:[],props:[],rooms:[],navigation:{entry:pt(c,n-.5),focus:pt(c,c),exit:null},floorPolygons:[],floorHoles:[],clearance:[]};
    const wall=(a,b,kind='wall',material='stone')=>{if(Math.hypot(a[0]-b[0],a[1]-b[1])>.01)map.walls.push({a:pt(...a),b:pt(...b),kind,material});};
    const line=(points,width,surface='dirt')=>{const path={points:points.map(p=>pt(...p)),width,surface};map.paths.push(path);map.clearance.push(path);return path;};
    const area=(kind,polygon,extra={})=>{const value={kind,polygon,...extra};map.areas.push(value);return value;};
    const light=(x,y,bright=3,dim=6)=>map.lights.push({x:round(x),y:round(y),bright,dim,color:'#ffb76b',alpha:.45});
    const prop=(kind,x,y,extra={})=>{const value={kind,x:round(x),y:round(y),angle:0,...extra};map.props.push(value);return value;};
    const ring=(polygon,kind='terrain',material='rock')=>{for(let i=0;i<polygon.length;i++)wall(polygon[i],polygon[(i+1)%polygon.length],kind,material);};
    function fence(a,b,gaps=[],material='timber') {
      const length=Math.hypot(b[0]-a[0],b[1]-a[1]);let at=0;
      const position=t=>pt(a[0]+(b[0]-a[0])*t/length,a[1]+(b[1]-a[1])*t/length);
      for(const g of gaps.sort((x,y)=>x[0]-y[0])){wall(position(at),position(g[0]),'wall',material);wall(position(g[0]),position(g[1]),'door',material);at=g[1];}
      wall(position(at),b,'wall',material);
    }
    function room(x,y,w,h,{door='south',doorWidth=1.5,material='stone',floor='flagstone',windows=true}={}) {
      map.rooms.push({x,y,w,h,floor});map.floorPolygons.push(rect(x,y,w,h));area(floor,rect(x,y,w,h));
      const edges=[['north',[x,y],[x+w,y],w],['east',[x+w,y],[x+w,y+h],h],['south',[x,y+h],[x+w,y+h],w],['west',[x,y],[x,y+h],h]];
      for(const [side,a,b,len] of edges){
        if(side===door){const mid=len/2;fence(a,b,[[mid-doorWidth/2,mid+doorWidth/2]],material);}
        else if(windows&&len>=6){const p1=pt(a[0]+(b[0]-a[0])*.35,a[1]+(b[1]-a[1])*.35),p2=pt(a[0]+(b[0]-a[0])*.5,a[1]+(b[1]-a[1])*.5);wall(a,p1,'wall',material);wall(p1,p2,'window',material);wall(p2,b,'wall',material);}
        else wall(a,b,'wall',material);
      }
      return {x,y,w,h};
    }
    function obstacle(p,radius,shape=6,kind='rock') {
      const polygon=ellipse(p[0],p[1],radius,radius*.8,shape,r);ring(polygon,'terrain',kind==='tree'?'bark':'rock');return polygon;
    }
    const keepClear=(x,y,padding=.7)=>map.clearance.some(path=>path.points.slice(1).some((b,i)=>distanceSegment([x,y],path.points[i],b)<path.width/2+padding));
    const roomClear=(x,y,padding=1)=>map.floorPolygons.some(polygon=>inside([x,y],polygon)||polygon.some((b,i)=>distanceSegment([x,y],b,polygon[(i+1)%polygon.length])<padding));
    function scatter(count,kind='tree') {
      for(let attempts=0,placed=0;attempts<count*35&&placed<count;attempts++){
        const x=range(1.6,n-1.6),y=range(1.6,n-1.6),radius=kind==='tree'?range(.8,1.5):range(.55,1.1);
        if(keepClear(x,y,radius+.5)||roomClear(x,y,radius+.5)||map.props.some(p=>Math.hypot(p.x-x,p.y-y)<(p.radius||.7)+radius+.5)||map.areas.some(a=>['water','cliff'].includes(a.kind)&&inside([x,y],a.polygon)))continue;
        const polygon=obstacle([x,y],kind==='tree'?.18:radius*.64,kind==='tree'?5:6,kind);
        prop(kind,x,y,{radius,variant:integer(0,4),angle:range(0,Math.PI*2),polygon});placed++;
      }
    }
    function outdoorDecor(scale=1) {
      const trees={forest:22,mountain:8,grassland:7,desert:1,snow:10,swamp:18,coast:5}[terrain];
      scatter(Math.round(trees*scale*n/32),'tree');scatter(Math.round((terrain==='mountain'?21:9)*scale*n/32),'rock');
    }
    function campfire(x,y){prop('firepit',x,y,{radius:.62});light(x,y,3,7);}
    if(terrain==='mountain'&&kind!=='cave') {
      // Rock shelves border the usable space. Their painted inner lip is also
      // the movement boundary exported to Foundry, never a decorative wall.
      for(const side of ['left','right']){
        const edge=Array.from({length:12},(_,i)=>pt(side==='left'?range(1.4,3.1):n-range(1.4,3.1),i/11*n));
        const outer=side==='left'?0:n,polygon=[[outer,0],...edge,[outer,n]].map(p=>pt(...p));
        area('cliff',polygon,{edge,outer});ring(polygon,'terrain','rock');
      }
    } else if(['swamp','coast'].includes(terrain)&&!['bridge','cave'].includes(kind)) {
      for(const corner of [[2.2,2.4],[n-2.4,n-3.1],[n-2.8,2.3]])area('water',ellipse(corner[0],corner[1],range(1.1,1.9),range(.8,1.4),18,r));
    }

    if(kind==='road') {
      const bend=range(-n*.12,n*.12),points=[[c,0],[c+bend,n*.32],[c-bend*.4,n*.65],[c,n]];
      line(points,3.6);map.navigation.entry=pt(c,.5);map.navigation.exit=pt(c,n-.5);
      if(r()>.45){const x=c+bend+4.3,y=n*.3;prop('cart',x,y,{w:1.6,h:3.1,angle:.1});ring(rect(x-.7,y-1.35,1.4,2.7));prop('barrel',x+1.4,y+1.4,{radius:.45});}
      // Occasional small pull-outs, rather than a circular plaza on every road.
      if(r()>.55)area('dirt',ellipse(c+bend+2.5,n*.32,2.7,2,22,r));outdoorDecor(1.2);
    } else if(kind==='camp') {
      line([[c,n],[c,c+3],[c,c]],3.2);area('dirt',ellipse(c,c,n*.28,n*.26,24,r));
      const count=n===24?integer(3,4):n===32?integer(4,5):integer(5,6);
      for(let i=0;i<count;i++){
        const angle=Math.PI*.9+i/(count-1)*Math.PI*1.2+range(-.1,.1),x=c+Math.cos(angle)*n*range(.21,.25),y=c+Math.sin(angle)*n*range(.19,.23);
        prop('tent',x,y,{w:3.5,h:3.2,angle:0,color:i%2?'#97754d':'#c0aa76'});
        // Canvas sidewalls leave a two-cell opening facing the fire.
        wall([x-1.7,y-1.5],[x+1.7,y-1.5],'wall','canvas');wall([x-1.7,y-1.5],[x-1.7,y+1.5],'wall','canvas');wall([x+1.7,y-1.5],[x+1.7,y+1.5],'wall','canvas');
        map.floorPolygons.push(rect(x-2,y-1.7,4,3.6));line([[c,c],[x,y+2],[x,y]],1.6);
      }
      campfire(c,c);map.navigation.focus=pt(c,c+1.3);
      prop('crate',c+3,c+2,{w:1.2,h:1.2});prop('crate',c+4.3,c+2.5,{w:.9,h:.9,angle:.1});prop('barrel',c+4.4,c+1.5,{radius:.5});prop('log',c-1.8,c+2,{w:2,h:.45,angle:-.3});prop('log',c+1.6,c-1.5,{w:2.2,h:.45,angle:.75});prop('stump',c-3,c+2.4,{radius:.4});outdoorDecor();
    } else if(kind==='inn') {
      const w=n*range(.56,.66),h=n*range(.56,.65),x=c-w/2,y=n*range(.13,.17);
      room(x,y,w,h,{doorWidth:2,material:'timber',floor:'boards'});
      const bedroomCount=n===24?3:integer(3,4),bedroomWidth=w/bedroomCount,partitionY=y+h*range(.31,.38);
      // Three small sleeping rooms share the taproom. Each door opens south.
      for(let i=0;i<bedroomCount;i++){
        const rx=x+i*bedroomWidth;if(i>0)wall([rx,y],[rx,partitionY],'wall','timber');
        fence([rx,partitionY],[rx+bedroomWidth,partitionY],[[bedroomWidth/2-.6,bedroomWidth/2+.6]],'timber');
        prop('bed',rx+1.25,y+1.6,{w:1.4,h:2.2,color:i%2?'#657b77':'#866b63'});prop('chest',rx+bedroomWidth-1,y+.8,{w:1.1,h:.65});
        if(bedroomWidth>5.4)prop('bed',rx+bedroomWidth-1.3,y+2.4,{w:1.4,h:2.2,color:i%2?'#657b77':'#866b63'});
        prop('rug',rx+bedroomWidth*.53,partitionY-1.2,{w:1.5,h:1.3,color:'#89866c'});
      }
      prop('rug',c,y+h*.67,{w:w*.34,h:h*.36,color:'#874d3d'});
      for(const tx of [x+2.2,x+w-3.5])for(const ty of [partitionY+2,y+h-2.3]){prop('table',tx,ty,{w:1.7,h:1.15});prop('stool',tx-.9,ty);prop('stool',tx+.9,ty);}
      prop('hearth',x+.65,partitionY+1,{w:.85,h:1.5});light(x+1.2,partitionY+1,3,6);
      // The bar sits against a side wall, leaving the central arrival aisle clear.
      prop('bar',x+w-1.5,y+h*.58,{w:1.1,h:h*.28});prop('barrel',x+w-1.2,y+h-1,{radius:.45});prop('barrel',x+w-2.3,y+h-1,{radius:.45});
      line([[c,n],[c,y+h],[c,y+h*.63]],3.5);map.navigation.focus=pt(c,y+h*.62);outdoorDecor(.45);
    } else if(kind==='fort') {
      const w=n*range(.61,.69),h=n*range(.61,.69),x=c-w/2,y=n*range(.13,.17);
      room(x,y,w,h,{doorWidth:3,material:'palisade',floor:'dirt',windows:false});
      const barrack=room(x+1.2,y+1.3,w*.43,h*.3,{doorWidth:1.5,floor:'boards',material:'timber',windows:false});
      for(let i=0;i<3;i++)prop('bed',barrack.x+1.4+i*(barrack.w-2.8)/2,barrack.y+1.6,{w:1.3,h:2.3,color:'#6d7164'});
      prop('table',x+w-3,y+3,{w:2.5,h:1.6});prop('crate',x+w-2,y+h-2,{w:1.3,h:1.3});prop('crate',x+w-3.5,y+h-1.8,{w:1.1,h:1.1});
      for(const [tx,ty]of [[x+.8,y+.8],[x+w-.8,y+.8],[x+.8,y+h-.8],[x+w-.8,y+h-.8]]){prop('platform',tx,ty,{w:2,h:2});light(tx,ty,2,5);}
      line([[c,n],[c,y+h],[c,c]],3.2);map.navigation.focus=pt(c,c+2);campfire(c+3,c+1);outdoorDecor(.6);
    } else if(kind==='shrine'||kind==='tower') {
      const w=kind==='tower'?n*range(.36,.44):n*range(.43,.51),h=kind==='tower'?n*range(.36,.44):n*range(.4,.49),x=c-w/2,y=n*range(.19,.24);
      room(x,y,w,h,{doorWidth:2,windows:kind==='tower',material:'stone',floor:'flagstone'});
      line([[c,n],[c,y+h],[c,y+h*.6]],3.4,'cobbles');map.navigation.focus=pt(c,y+h*.62);
      if(kind==='shrine'){
        prop('dais',c,y+2.2,{w:3.5,h:2.1});prop('altar',c,y+1.7,{w:2.2,h:1});
        for(const sx of [x+1.3,x+w-1.3])for(const sy of [y+2.2,y+h-2]){prop('column',sx,sy,{radius:.5});obstacle([sx,sy],.44);}
        prop('rug',c,y+h*.66,{w:2.1,h:h*.48,color:'#657c81'});light(x+1.2,y+h-1.2,2,5);light(x+w-1.2,y+h-1.2,2,5);
      }else{
        prop('stairs',x+1.2,y+1.2,{w:2.4,h:3.2});prop('table',x+w-2,y+2,{w:1.8,h:1.3});prop('bed',x+w-1.3,y+h-2.4,{w:1.5,h:2.4,color:'#777760'});light(x+1,y+h-1,2,5);
      }
      area('gravel',ellipse(c,y+h/2,w*.75,h*.7,24,r));outdoorDecor(.8);
    } else if(kind==='ruin') {
      const w=n*range(.54,.66),h=n*range(.52,.63),x=c-w/2,y=n*range(.15,.2);area('flagstone',rect(x,y,w,h));map.floorPolygons.push(rect(x,y,w,h));
      // Interrupted masonry gives several tactical approaches, with a clear main entry.
      wall([x,y],[x+w*.4,y]);wall([x+w*.56,y],[x+w,y]);wall([x,y],[x,y+h*.7]);wall([x+w,y],[x+w,y+h*.45]);wall([x+w,y+h*.62],[x+w,y+h]);
      wall([x,y+h],[c-1.5,y+h]);wall([c+1.5,y+h],[x+w,y+h]);
      wall([x+w*.3,y],[x+w*.3,y+h*.42]);wall([x+w*.3,y+h*.42],[x+w*.56,y+h*.42]);
      for(const [px,py]of [[x+2,y+2],[x+w-2,y+2],[x+2,y+h-2],[x+w-2,y+h-2]]){prop('column',px,py,{radius:.5,broken:true});obstacle([px,py],.45);}
      line([[c,n],[c,y+h],[c,y+h*.7],[c+w*.22,y+h*.35]],3.2);map.navigation.focus=pt(c,y+h*.65);
      for(let i=0;i<18;i++){const px=range(x+.5,x+w-.5),py=range(y+.5,y+h-.5);if(!keepClear(px,py,.6))prop('rubble',px,py,{radius:range(.3,.75),angle:range(0,6.28)});}
      prop('altar',x+w-2.7,y+1.6,{w:2,h:1});outdoorDecor(.9);
    } else if(kind==='bridge') {
      const y=c+range(-2,2),riverWidth=n*range(.2,.28);
      area('water',[[0,y-riverWidth*.48],[n*.28,y-riverWidth*.64],[n*.62,y-riverWidth*.45],[n,y-riverWidth*.55],[n,y+riverWidth*.5],[n*.66,y+riverWidth*.7],[n*.27,y+riverWidth*.45],[0,y+riverWidth*.58]].map(p=>pt(...p)));
      const bridgeWidth=3.4,by=y-riverWidth*.85,bh=riverWidth*1.7;area('bridge',rect(c-bridgeWidth/2,by,bridgeWidth,bh));
      wall([c-bridgeWidth/2,by],[c-bridgeWidth/2,by+bh],'terrain','timber');wall([c+bridgeWidth/2,by],[c+bridgeWidth/2,by+bh],'terrain','timber');
      line([[c,0],[c,y-riverWidth],[c,y+riverWidth],[c,n]],3.2);map.navigation.entry=pt(c,.5);map.navigation.exit=pt(c,n-.5);map.navigation.focus=pt(c,y);
      prop('lantern',c-2.3,by-.5);prop('lantern',c+2.3,by+bh+.5);light(c-2.3,by-.5,2,5);light(c+2.3,by+bh+.5,2,5);outdoorDecor(.9);
    } else if(kind==='cave') {
      const step=.5,q=n/step,mask=Array.from({length:q},()=>new Uint8Array(q));
      const chambers=[{x:c,y:n*.34,rx:n*.21,ry:n*.19},{x:n*.28,y:n*.57,rx:n*.15,ry:n*.14},{x:n*.73,y:n*.56,rx:n*.15,ry:n*.16},{x:c,y:n*.77,rx:n*.13,ry:n*.15}];
      for(const chamber of chambers){chamber.x+=range(-1,1);chamber.y+=range(-1,1);chamber.rx*=range(.9,1.1);}
      const corridors=[[[c,n],[c,n*.77],3.4],[[c,n*.77],[chambers[1].x,chambers[1].y],3.1],[[c,n*.77],[chambers[2].x,chambers[2].y],3],[[chambers[1].x,chambers[1].y],[chambers[0].x,chambers[0].y],3],[[chambers[2].x,chambers[2].y],[chambers[0].x,chambers[0].y],3.2]];
      for(let gy=0;gy<q;gy++)for(let gx=0;gx<q;gx++){const p=[(gx+.5)*step,(gy+.5)*step];mask[gy][gx]=chambers.some(a=>((p[0]-a.x)/a.rx)**2+((p[1]-a.y)/a.ry)**2<1)||corridors.some(([a,b,width])=>distanceSegment(p,a,b)<width/2)?1:0;}
      const edges=new Map(),key=p=>p.join(',');
      const edge=(a,b)=>edges.set(key(a),b);
      for(let y=0;y<q;y++)for(let x=0;x<q;x++)if(mask[y][x]){
        if(!mask[y-1]?.[x])edge([x,y],[x+1,y]);if(!mask[y]?.[x+1])edge([x+1,y],[x+1,y+1]);if(!mask[y+1]?.[x])edge([x+1,y+1],[x,y+1]);if(!mask[y]?.[x-1])edge([x,y+1],[x,y]);
      }
      while(edges.size){const first=[...edges.keys()][0],start=first.split(',').map(Number),loop=[start];let p=start,safety=0;
        do{const next=edges.get(key(p));if(!next)break;edges.delete(key(p));p=next;loop.push(p);}while(key(p)!==first&&safety++<q*q*4);
        if(loop.length<4)continue;loop.pop();const simple=loop.filter((p,i)=>{const a=loop[(i+loop.length-1)%loop.length],b=loop[(i+1)%loop.length];return(a[0]-p[0])*(b[1]-p[1])!==(a[1]-p[1])*(b[0]-p[0]);});
        const smooth=[];for(let i=0;i<simple.length;i++){const a=simple[i],b=simple[(i+1)%simple.length];smooth.push(pt((a[0]*.8+b[0]*.2)*step,(a[1]*.8+b[1]*.2)*step),pt((a[0]*.2+b[0]*.8)*step,(a[1]*.2+b[1]*.8)*step));}
        const signed=smooth.reduce((sum,p,i)=>{const b=smooth[(i+1)%smooth.length];return sum+p[0]*b[1]-b[0]*p[1];},0);
        if(signed<0){map.floorHoles.push(smooth);area('caverock',smooth);}else{map.floorPolygons.push(smooth);area('cavefloor',smooth);}
        for(let i=0;i<smooth.length;i++){const a=smooth[i],b=smooth[(i+1)%smooth.length];if(a[1]>n-.01&&b[1]>n-.01)continue;wall(a,b,'wall','cave');}
      }
      for(const[a,b,width]of corridors)map.clearance.push({points:[a,b],width});
      map.navigation.focus=pt(chambers[0].x,chambers[0].y);map.navigation.entry=pt(c,n-.5);
      for(let i=0;i<38;i++){const x=range(2,n-2),y=range(2,n-2);if(!map.floorPolygons.some(p=>inside([x,y],p))||map.floorHoles.some(p=>inside([x,y],p))||keepClear(x,y,1)||map.props.some(p=>Math.hypot(p.x-x,p.y-y)<2))continue;const radius=range(.45,.8);prop('stalagmite',x,y,{radius,polygon:obstacle([x,y],radius*.6)});}
      prop('crystal',chambers[1].x-1.8,chambers[1].y-1.1,{radius:.6});prop('pool',chambers[2].x+1,chambers[2].y,{radius:1.5});
    }

    // Small ground patches avoid a uniform computer-generated carpet. Their
    // shape is model data, so a preview and an exported image agree exactly.
    map.patches=Array.from({length:Math.round(n*n/14)},()=>({x:range(0,n),y:range(0,n),rx:range(.4,2.8),ry:range(.3,1.4),angle:range(0,6.28),tone:r(),opacity:range(.06,.2)}));
    map.props.forEach(p=>{p.artSeed=Math.floor(r()*0xffffffff);});
    map.statistics={walls:map.walls.length,doors:map.walls.filter(w=>w.kind==='door').length,lights:map.lights.length};
    return map;
  }

  function render(canvas,map,options={}) {
    if(!canvas||typeof canvas.getContext!=='function')throw Error('A canvas is required to render the map.');
    if(map?.version!==1||![24,32,40].includes(map.cols)||map.rows!==map.cols)throw Error('This battle map version or size is not supported.');
    const scale=options.pixelsPerCell??100;if(!Number.isFinite(scale)||scale<8||scale>150)throw Error('Use 8–150 pixels per cell.');
    canvas.width=Math.round(map.cols*scale);canvas.height=Math.round(map.rows*scale);
    const ctx=canvas.getContext('2d');if(!ctx)throw Error('This browser could not create the map canvas.');
    const p=PALETTES[map.terrain],r=rng(map.seed+'|art|'+map.kind+'|'+map.terrain),n=map.cols;
    ctx.setTransform(scale,0,0,scale,0,0);ctx.lineCap='round';ctx.lineJoin='round';ctx.fillStyle=map.kind==='cave'?'#565650':p.ground;ctx.fillRect(0,0,n,n);
    const polygon=(points,fill,stroke,width=.05)=>{ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke();}};
    const circle=(x,y,radius,fill,stroke,width=.05)=>{ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke();}};
    const stroke=(points,color,width)=>{ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();};
    function caveRim(points,color,width) {
      // The floor fill closes at the image boundary, but the entrance wall
      // does not. Start after that missing edge so one continuous stroke
      // follows exactly the cave walls exported to Foundry.
      const gap=points.findIndex((a,i)=>a[1]>n-.01&&points[(i+1)%points.length][1]>n-.01);
      const start=gap<0?0:(gap+1)%points.length;ctx.beginPath();ctx.moveTo(...points[start]);
      for(let j=0;j<points.length;j++){
        const i=(start+j)%points.length,a=points[i],b=points[(i+1)%points.length];
        if(a[1]>n-.01&&b[1]>n-.01)ctx.moveTo(...b);else ctx.lineTo(...b);
      }
      if(gap<0)ctx.closePath();ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();
    }
    function grain(count,colors,alpha=.16){ctx.save();ctx.globalAlpha=alpha;for(let i=0;i<count;i++){ctx.fillStyle=colors[i%colors.length];const x=r()*n,y=r()*n,s=.015+r()*.055;ctx.fillRect(x,y,s,s*.7);}ctx.restore();}
    for(const patch of map.patches){ctx.save();ctx.translate(patch.x,patch.y);ctx.rotate(patch.angle);ctx.scale(patch.rx,patch.ry);ctx.globalAlpha=patch.opacity*1.8;const color=patch.tone>.5?p.grass:p.dark,gradient=ctx.createRadialGradient(0,0,0,0,0,1);gradient.addColorStop(0,color);gradient.addColorStop(1,color+'00');ctx.fillStyle=gradient;ctx.fillRect(-1,-1,2,2);ctx.restore();}
    grain(n*n*16,['#000000','#ffffff',p.soil],.11);
    function texturedGround(points,color,soft=true) {
      if(soft){for(const [width,alpha]of [[.8,.07],[.5,.13],[.25,.22]]){ctx.save();ctx.globalAlpha=alpha;polygon(points,color,color,width);ctx.restore();}}
      ctx.save();ctx.globalAlpha=.9;polygon(points,color);ctx.restore();
      ctx.save();polygon(points);ctx.clip();
      const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),x0=Math.min(...xs),y0=Math.min(...ys),w=Math.max(...xs)-x0,h=Math.max(...ys)-y0;
      for(let i=0;i<w*h*23;i++){
        const x=x0+r()*w,y=y0+r()*h,s=.015+r()*.08;ctx.globalAlpha=.05+r()*.16;ctx.fillStyle=i%3?'#e9dab5':'#3a3b2b';ctx.fillRect(x,y,s,s*.6);
        if(i%29===0){ctx.globalAlpha=.09;stroke([[x,y],[x+.18+r()*.24,y-.03]],'#3b3c2e',.025);}
      }
      ctx.restore();
      if(soft)for(let i=0;i<points.length;i++){
        const a=points[i],b=points[(i+1)%points.length],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
        for(let t=0;t<length;t+=.15){const x=a[0]+(b[0]-a[0])*t/length+(r()-.5)*.5,y=a[1]+(b[1]-a[1])*t/length+(r()-.5)*.5;ctx.save();ctx.globalAlpha=.3+r()*.25;circle(x,y,.03+r()*.08,r()>.5?p.ground:color);ctx.restore();}
      }
    }
    // Paths precede structures and rivers; bridges are painted after the water.
    for(const road of map.paths){
      const left=[],right=[],ruts=[[],[]];
      for(let i=0;i<road.points.length-1;i++){
        const a=road.points[i],b=road.points[i+1],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);if(!len)continue;
        const samples=Math.ceil(len/.4);for(let j=0;j<=samples;j++){
          const t=j/samples,x=a[0]+dx*t,y=a[1]+dy*t,offset=road.width/2+(r()-.5)*.28;
          left.push([x-dy/len*offset,y+dx/len*offset]);right.push([x+dy/len*offset,y-dx/len*offset]);
          for(let k=0;k<2;k++){const side=k?1:-1;ruts[k].push([x+dy/len*road.width*.24*side,y-dx/len*road.width*.24*side]);}
        }
      }
      texturedGround([...left,...right.reverse()],p.soil);
      if(road.surface==='cobbles'){for(let i=0;i<road.points.length-1;i++){const a=road.points[i],b=road.points[i+1],len=Math.hypot(b[0]-a[0],b[1]-a[1]);for(let t=0;t<len;t+=.55){const x=a[0]+(b[0]-a[0])*t/len,y=a[1]+(b[1]-a[1])*t/len;circle(x,y,.2,'#aca78d','#77745f',.025);}}}
      else for(const rut of ruts){stroke(rut,'#4c493126',.18);stroke(rut,'#ded2a918',.045);}
    }
    const areaOrder=['cliff','gravel','dirt','water','bridge','flagstone','boards','cavefloor','caverock'];
    for(const kind of areaOrder)for(const a of map.areas.filter(a=>a.kind===kind)){
      if(kind==='cliff'){
        polygon(a.polygon,'#6e7369','#3e4c42',.16);ctx.save();polygon(a.polygon);ctx.clip();
        for(let band=0;band<5;band++){
          const t=band/5,edge=a.edge.map(([x,y])=>[x+(a.outer-x)*t,y]);
          stroke(edge,['#424e44','#626d5c','#91917c','#b4af93','#c2baa0'][band],.6-band*.06);
        }
        for(let i=0;i<a.edge.length-1;i++){
          const aa=a.edge[i],bb=a.edge[i+1];stroke([[a.outer,(aa[1]+bb[1])/2],[(aa[0]+bb[0])/2,(aa[1]+bb[1])/2]],'#343e333b',.05);
        }
        grain(n*n*5,['#ded8b4','#313d34'],.17);ctx.restore();
        stroke(a.edge,'#2b382d66',.13);stroke(a.edge.map(([x,y])=>[x+(a.outer-x)*.07,y]),'#c9c2a29c',.06);
      }else if(kind==='water'){
        polygon(a.polygon,p.water,'#c3b78d',.36);ctx.save();polygon(a.polygon);ctx.clip();
        for(let i=0;i<n*10;i++){const x=r()*n,y=r()*n;stroke([[x,y],[x+.3+r()*.5,y-.035]],i%3?'#ffffff16':'#102c3b16',.035);}ctx.restore();
      }else if(kind==='boards'||kind==='bridge'){
        polygon(a.polygon,'#9c855d','#574b38',.1);ctx.save();polygon(a.polygon);ctx.clip();
        const xs=a.polygon.map(v=>v[0]),ys=a.polygon.map(v=>v[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
        for(let y=minY;y<maxY;y+=.42){ctx.fillStyle=['#907b58','#a18c66','#9c8660'][Math.floor(r()*3)];ctx.fillRect(minX,y,maxX-minX,.39);stroke([[minX,y],[maxX,y]],'#3e362a80',.025);for(let x=minX+.4;x<maxX;x+=2.3){stroke([[x,y+.04],[x,y+.35]],'#4d41348a',.025);circle(x+.09,y+.08,.025,'#34352a');}}
        ctx.restore();
      }else if(kind==='flagstone'){
        polygon(a.polygon,'#777970','#4a4e43',.14);ctx.save();polygon(a.polygon);ctx.clip();
        const xs=a.polygon.map(v=>v[0]),ys=a.polygon.map(v=>v[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
        for(let y=Math.floor(minY);y<maxY;y+=.95)for(let x=Math.floor(minX)-1;x<maxX;x+=1.25){const xx=x+(Math.floor(y)%2)*.6;ctx.fillStyle=['#a3a291','#9a9d90','#b0ad98','#909688'][Math.floor(r()*4)];ctx.fillRect(xx+.035,y+.035,1.17,.87);stroke([[xx+.08,y+.82],[xx+1.12,y+.82]],'#ffffff18',.035);if(r()>.7)stroke([[xx+.4,y+.04],[xx+.55,y+.35],[xx+.44,y+.56]],'#575a4c55',.025);}
        ctx.restore();
      }else if(kind==='cavefloor'||kind==='caverock'){
        const rock=kind==='caverock';polygon(a.polygon,rock?'#565b50':'#96907b');ctx.save();polygon(a.polygon);ctx.clip();grain(n*n*20,rock?['#888d74','#354334']:['#d6c6a6','#595d50','#b5a990'],.19);ctx.restore();
        caveRim(a.polygon,'#343e34',.6);caveRim(a.polygon,'#777e68',.28);caveRim(a.polygon,'#b3b09666',.065);
      }else{texturedGround(a.polygon,kind==='gravel'?'#999481':p.soil);}
    }
    // Ground litter and fine blades add scale without hiding tactical cover.
    if(map.kind!=='cave')for(let i=0;i<n*n*1.7;i++){const x=r()*n,y=r()*n;if(map.areas.some(a=>inside([x,y],a.polygon))||map.paths.some(a=>a.points.slice(1).some((b,j)=>distanceSegment([x,y],a.points[j],b)<a.width/2)))continue;const s=.05+r()*.13;stroke([[x-s/2,y],[x,y-s],[x+s/3,y]],i%3===0?p.grass+'77':p.dark+'55',.022);}
    function drawProp(a){
      const random=rng(String(a.artSeed));ctx.save();ctx.translate(a.x,a.y);ctx.rotate(a.angle||0);const w=a.w||1,h=a.h||1;
      const box=(x,y,w,h,color,border='#453d30',thickness=.04)=>{ctx.fillStyle=color;ctx.fillRect(x,y,w,h);if(border){ctx.strokeStyle=border;ctx.lineWidth=thickness;ctx.strokeRect(x,y,w,h);}};
      if(['rock','stalagmite'].includes(a.kind)){
        const radius=a.radius;const poly=ellipse(0,0,radius,radius*.8,7,random);ctx.save();ctx.translate(.16,.18);polygon(poly,'#1d281b60');ctx.restore();polygon(poly,p.rock,'#41483e',.06);polygon([poly[0],poly[1],poly[2],[0,-radius*.05]],'#ffffff25');polygon([poly[3],poly[4],poly[5],[0,radius*.1]],'#303d352f');stroke([poly[1],[.06,-.05],poly[4]],'#535b4944',.04);
      }else if(a.kind==='tree'){
        const radius=a.radius;circle(.2,.25,radius*1.05,'#15281738');
        for(let layer=0;layer<3;layer++){const rad=radius*(1-layer*.23),count=9-layer;for(let i=0;i<count;i++){const angle=i/count*Math.PI*2+layer*.8,x=Math.cos(angle)*rad*.47,y=Math.sin(angle)*rad*.47,size=rad*(.46+random()*.14);const gradient=ctx.createRadialGradient(x-size*.3,y-size*.3,0,x,y,size);gradient.addColorStop(0,p.canopy[layer+1]);gradient.addColorStop(.7,p.canopy[layer]);gradient.addColorStop(1,p.canopy[Math.max(0,layer-1)]);circle(x,y,size,gradient);}circle(-rad*.12,-rad*.12,rad*.35,p.canopy[layer+1]+'aa');}
        for(let i=0;i<80;i++){const x=(random()-.5)*radius*1.5,y=(random()-.5)*radius*1.5;if(x*x+y*y>radius*radius*.61)continue;circle(x,y,.025+random()*.045,random()>.5?'#d5dda03c':'#213d2a2e');}
      }else if(a.kind==='tent'){
        box(-w/2+.12,-h/2+.15,w,h,'#1e2a2155',null);box(-w/2,-h/2,w,h,'#847051');
        box(-w/2+.25,-h/2+.25,w-.5,h-.5,'#9c8964',null);
        for(const x of [-.85,.85]){box(x-.45,-.9,.9,1.9,'#655d48','#443c30');box(x-.41,-.52,.82,1.45,'#99886a',null);box(x-.35,-.84,.7,.35,'#c4b897',null);}
        polygon([[-w/2,-h/2],[-w/2+.6,-h/2],[0,h/2+.1],[-w/2,h/2]],a.color,'#5e513b',.05);polygon([[w/2,-h/2],[w/2-.6,-h/2],[0,h/2+.1],[w/2,h/2]],'#a58c61','#5e513b',.05);stroke([[-w/2,-h/2],[w/2,-h/2]],'#d6c398',.1);circle(0,h/2+.15,.06,'#413d2c');
      }else if(a.kind==='firepit'){
        circle(0,0,.68,'#3c3830');for(let i=0;i<10;i++){const angle=i/10*Math.PI*2;circle(Math.cos(angle)*.57,Math.sin(angle)*.57,.14,['#7a7c6f','#92937e','#666e60'][i%3],'#414738',.035);}stroke([[-.3,-.15],[.3,.15]],'#3b2419',.12);stroke([[.25,-.2],[-.25,.22]],'#3b2419',.12);circle(0,0,.23,'#d15d28');circle(-.06,-.03,.13,'#f1bc64');
      }else if(a.kind==='barrel'){
        const radius=a.radius||.45;circle(.09,.12,radius,'#26301e55');circle(0,0,radius,'#a08758','#4e4431',.065);ctx.save();ctx.beginPath();ctx.arc(0,0,radius-.05,0,6.29);ctx.clip();for(let x=-radius;x<radius;x+=.16)stroke([[x,-radius],[x,radius]],'#564a3677',.035);ctx.restore();circle(0,0,radius*.8,null,'#584b36',.035);circle(.1,-.1,.055,'#53472f');
      }else if(a.kind==='crate'||a.kind==='chest'){
        box(-w/2+.07,-h/2+.08,w,h,'#29302055',null);box(-w/2,-h/2,w,h,'#977a4d','#483c29',.07);for(let x=-w/2+.2;x<w/2;x+=.3)stroke([[x,-h/2],[x,h/2]],'#5d4d3470',.03);if(a.kind==='crate'){stroke([[-w/2+.1,-h/2+.1],[w/2-.1,h/2-.1]],'#c1a773',.11);stroke([[-w/2+.1,h/2-.1],[w/2-.1,-h/2+.1]],'#c1a773',.11);}else{box(-w/2,-h/2+.1,w,.12,'#544c3e',null);box(-w/2,h/2-.22,w,.12,'#544c3e',null);box(-.08,-.12,.16,.24,'#b6a56a');}
      }else if(a.kind==='rug'){
        box(-w/2,-h/2,w,h,a.color,'#4b4439',.04);ctx.strokeStyle='#cfb280';ctx.lineWidth=.06;ctx.strokeRect(-w/2+.16,-h/2+.16,w-.32,h-.32);polygon([[0,-h*.28],[w*.25,0],[0,h*.28],[-w*.25,0]],null,'#c9b48588',.06);for(let x=-w/2;x<w/2;x+=.13){stroke([[x,-h/2],[x,-h/2-.11]],'#b8a57e',.035);stroke([[x,h/2],[x,h/2+.11]],'#b8a57e',.035);}
        ctx.strokeStyle='#cfb28066';ctx.lineWidth=.035;ctx.strokeRect(-w/2+.27,-h/2+.27,w-.54,h-.54);for(let y=-h*.3;y<=h*.3;y+=.55)for(let x=-w*.3;x<=w*.3;x+=.55)polygon([[x,y-.1],[x+.1,y],[x,y+.1],[x-.1,y]],null,'#ceb48166',.025);
      }else if(a.kind==='bed'){
        box(-w/2+.1,-h/2+.12,w,h,'#292d2055',null);box(-w/2,-h/2,w,h,'#725335','#382f27',.08);box(-w/2+.12,-h/2+.14,w-.24,h-.3,'#d2c4a1',null);box(-w/2+.12,-h/2+.65,w-.24,h-.8,a.color||'#667975',null);box(-w/2+.2,-h/2+.2,w-.4,.38,'#e2d8bd','#a99e80',.03);stroke([[-w/2+.22,0],[w/2-.22,.05]],'#ffffff22',.04);stroke([[-w/2+.1,h/2-.2],[w/2-.1,h/2-.2]],'#49392d',.1);
      }else if(a.kind==='table'||a.kind==='bar'){
        box(-w/2+.1,-h/2+.12,w,h,'#2a2d2155',null);box(-w/2,-h/2,w,h,'#9d8052','#56422c',.06);for(let y=-h/2+.22;y<h/2;y+=.3)stroke([[-w/2+.06,y],[w/2-.06,y]],'#59492d66',.025);
        if(a.kind==='table'){circle(-w*.22,-h*.12,.19,'#b8b09b','#726d5d',.025);circle(w*.2,h*.12,.16,'#bab4a1','#726d5d',.025);circle(w*.25,-h*.25,.075,'#563c24','#bca57a',.025);}
      }else if(a.kind==='stool'){circle(.05,.1,.31,'#26301e55');circle(0,0,.3,'#907146','#4c3d29',.055);stroke([[-.2,0],[.2,0]],'#bd9b63',.03);
      }else if(a.kind==='hearth'||a.kind==='altar'||a.kind==='dais'){
        box(-w/2+.12,-h/2+.12,w,h,'#242e2155',null);box(-w/2,-h/2,w,h,a.kind==='dais'?'#8c8c7c':'#b2ad96','#545b4e',.07);ctx.strokeStyle='#ded7bd88';ctx.lineWidth=.045;ctx.strokeRect(-w/2+.12,-h/2+.12,w-.24,h-.24);if(a.kind==='altar'){circle(-w*.3,0,.1,'#d9c18b');circle(w*.3,0,.1,'#d9c18b');box(-.2,-.16,.4,.32,'#72564a');}if(a.kind==='hearth'){box(-w*.32,-h*.15,w*.64,h*.4,'#413c31',null);circle(0,0,.17,'#d1843c');}
      }else if(a.kind==='column'){
        circle(.1,.14,a.radius+.08,'#222c2355');circle(0,0,a.radius,'#9b9e8b','#4c5649',.07);circle(-.035,-.035,a.radius*.72,'#bdbeab','#696e5c',.04);if(a.broken)stroke([[-.25,-.2],[.1,-.05],[-.06,.28]],'#555b49',.07);
      }else if(a.kind==='stairs'){
        box(-w/2,-h/2,w,h,'#696a60','#424c40',.08);for(let y=-h/2;y<h/2;y+=.38){box(-w/2+.08,y,w-.16,.33,'#999c89','#656c5d',.025);stroke([[-w/2+.08,y+.02],[w/2-.08,y+.02]],'#d0ceba',.04);}
      }else if(a.kind==='platform'){
        box(-w/2,-h/2,w,h,'#8f7955','#514934',.08);for(let y=-h/2;y<h/2;y+=.3)stroke([[-w/2,y],[w/2,y]],'#4f4936',.03);
      }else if(a.kind==='cart'){
        for(const y of [-h*.3,h*.3])for(const x of [-w*.61,w*.61]){box(x-.13,y-.35,.26,.7,'#524331','#2e3025',.04);}
        box(-w/2,-h/2,w,h,'#9d8154','#4c3e2d',.12);for(let y=-h/2+.2;y<h/2;y+=.35)stroke([[-w/2+.1,y],[w/2-.1,y]],'#5b4831',.035);box(-.5,-1,1,.8,'#817256');box(-.5,.1,1,1,'#b1a281');stroke([[-.45,h/2],[-.45,h/2+1]],'#7e6643',.1);stroke([[.45,h/2],[.45,h/2+1]],'#7e6643',.1);
      }else if(a.kind==='log'){box(-w/2,-h/2,w,h,'#6b583a','#42422f',.06);stroke([[-w/2+.1,-h*.1],[w/2-.1,-h*.1]],'#a68c5c',.05);
      }else if(a.kind==='stump'){circle(.08,.1,a.radius,'#27352244');circle(0,0,a.radius,'#b29b6a','#69583a',.07);circle(0,0,a.radius*.7,null,'#7c6847',.03);circle(-.03,.02,a.radius*.4,null,'#8a7550',.025);
      }else if(a.kind==='rubble'){for(let i=0;i<7;i++){const x=(random()-.5)*a.radius*2,y=(random()-.5)*a.radius*2,s=.1+random()*.2;polygon(ellipse(x,y,s,s*.7,5,random),p.rock,'#4a554855',.025);}
      }else if(a.kind==='lantern'){circle(0,0,.23,'#3f4536');circle(0,0,.13,'#d9b467');circle(-.025,-.025,.065,'#f2d6a0');
      }else if(a.kind==='crystal'){for(let i=0;i<6;i++){const x=(random()-.5)*.7,y=(random()-.5)*.7;polygon([[x-.13,y+.22],[x-.18,y-.2],[x,y-.45],[x+.18,y-.15],[x+.13,y+.22]],i%2?'#8daaaa':'#aec9bd','#49696b',.04);stroke([[x,y-.4],[x+.03,y+.1]],'#d8e9d7',.04);}
      }else if(a.kind==='pool'){polygon(ellipse(0,0,a.radius,a.radius*.65,15,random),'#426e72','#727a69',.13);polygon(ellipse(-.1,-.08,a.radius*.7,a.radius*.4,12,random),'#52838555');}
      ctx.restore();
    }
    // Rugs and low features belong under furniture; trees cast canopy shadows last.
    const low=new Set(['rug','dais','pool','platform']);
    for(const prop of map.props.filter(a=>low.has(a.kind)))drawProp(prop);
    for(const prop of map.props.filter(a=>!low.has(a.kind)&&a.kind!=='tree'))drawProp(prop);
    for(const wall of map.walls){
      if(wall.material==='cave')continue; // Continuous cave rims were painted from their exact polygons above.
      if(wall.kind==='terrain'){
        if(wall.material==='timber'){
          stroke([wall.a,wall.b],'#433c2f',.13);stroke([wall.a,wall.b],'#b19a6b',.07);
          const dx=wall.b[0]-wall.a[0],dy=wall.b[1]-wall.a[1],length=Math.hypot(dx,dy);
          for(let t=0;t<=length;t+=.9)circle(wall.a[0]+dx*t/length,wall.a[1]+dy*t/length,.1,'#927b52','#4c4432',.025);
        }
        continue;
      }
      const cave=wall.material==='cave',timber=['timber','palisade','canvas'].includes(wall.material),width=cave?.42:wall.material==='palisade'?.25:wall.material==='canvas'?.08:.22;
      if(wall.kind==='door'){
        stroke([wall.a,wall.b],'#332c2380',.22);stroke([wall.a,wall.b],'#a4834f',.13);circle(wall.a[0],wall.a[1],.07,'#413b2f');
      }else if(wall.kind==='window'){
        stroke([wall.a,wall.b],'#4c5e58',.16);stroke([wall.a,wall.b],'#a3beb6',.07);for(const t of [.15,.5,.85]){const x=wall.a[0]+(wall.b[0]-wall.a[0])*t,y=wall.a[1]+(wall.b[1]-wall.a[1])*t,dx=wall.b[0]-wall.a[0],dy=wall.b[1]-wall.a[1],len=Math.hypot(dx,dy);stroke([[x-dy/len*.12,y+dx/len*.12],[x+dy/len*.12,y-dx/len*.12]],'#4b4d3c',.055);}
      }else{
        stroke([wall.a.map((v,i)=>v+(i?.12:.1)),wall.b.map((v,i)=>v+(i?.12:.1))],'#1e2d2455',width+.16);stroke([wall.a,wall.b],cave?'#555c51':timber?'#625138':'#565e50',width+.08);stroke([wall.a,wall.b],cave?'#777a68':timber?'#9c8256':'#b3b19a',width);
        const dx=wall.b[0]-wall.a[0],dy=wall.b[1]-wall.a[1],len=Math.hypot(dx,dy);for(let t=.35;t<len;t+=timber?.45:.6){const x=wall.a[0]+dx*t/len,y=wall.a[1]+dy*t/len;stroke([[x-dy/len*width*.5,y+dx/len*width*.5],[x+dy/len*width*.5,y-dx/len*width*.5]],timber?'#544832':'#626c5a',.035);}
      }
    }
    for(const prop of map.props.filter(a=>a.kind==='tree'))drawProp(prop);
    if(options.grid){ctx.save();ctx.strokeStyle='#f3eed260';ctx.lineWidth=1/scale;for(let i=0;i<=n;i++){stroke([[i,0],[i,n]],'#f3eed260',1/scale);stroke([[0,i],[n,i]],'#f3eed260',1/scale);}ctx.restore();}
    ctx.setTransform(1,0,0,1,0,0);return canvas;
  }
  return Object.freeze({generate,render,kinds:Object.freeze(KINDS),terrains:Object.freeze(TERRAINS),version:1});
});
