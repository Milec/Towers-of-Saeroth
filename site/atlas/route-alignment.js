/* Orient existing artwork along mapped land routes. Source records stay intact. */
function closestRoadPoint(point,routeIds){
 let best=null;
 for(const route of D.routes){
  if(!['roads','trails'].includes(route.group)||routeIds&&!routeIds.includes(route.i))continue;
  for(let i=1;i<route.points.length;i++){
   const a=route.points[i-1],b=route.points[i],dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy;
   if(length<1e-8)continue;
   const t=Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/length));
   const x=a[0]+dx*t,y=a[1]+dy*t,distance=Math.hypot(x-point[0],y-point[1]);
   if(!best||distance<best.distance-1e-6||Math.abs(distance-best.distance)<1e-6&&route.group==='roads'&&best.group!=='roads')best={x,y,distance,angle:Math.atan2(dy,dx)*180/Math.PI,route:route.i,group:route.group};
  }
 }
 return best;
}
function alignRoadArtwork(e,point,kind,routeIds){
 const road=closestRoadPoint(point,routeIds);if(!road)return;
 const art=e.querySelector('.poi-art'),use=art?.querySelector('use');if(!use)return;
 // Native bridge deck rises ~22 degrees to the right; replacement pass trail runs horizontally.
 // Centers are measured in symbol coordinates, including image letterboxing.
 const axis=kind==='bridge'?-22:0,center=kind==='bridge'?[0,-6.4]:[0,-9.55];
 let rotation=((road.angle-axis+90)%180+180)%180-90;
 const align=document.createElementNS(NS,'g');align.classList.add('road-oriented-art');
 align.setAttribute('transform',`rotate(${rotation})`);
 const scale=Number(/scale\(([^ )]+)/.exec(use.getAttribute('transform')||'')?.[1]||1);
 const centered=document.createElementNS(NS,'g');centered.setAttribute('transform',`translate(${-center[0]*scale} ${-center[1]*scale})`);
 centered.append(use);align.append(centered);art.append(align);
 e.setAttribute('transform',`translate(${road.x} ${road.y})`);
 e.dataset.roadAngle=road.angle;e.dataset.artRotation=rotation;e.dataset.artAxis=axis;
 e.dataset.alignedRoute=road.route;e.dataset.anchorX=road.x;e.dataset.anchorY=road.y;
 return [road.x,road.y];
}
for(const m of D.markers){
 if(!/mountain-pass|bridges/.test(m.type))continue;
 const crossing=D.crossings.find(c=>c.markerId===m.i);
 m.symbolPoint=alignRoadArtwork($('#pois [data-id="'+m.i+'"]'),[m.x,m.y],m.type==='mountain-pass'?'pass':'bridge',crossing?.routes);
}
for(const c of D.crossings||[]){
 if(c.kind!=='bridge'||c.markerId!==undefined)continue;
 const e=$('#crossings [data-id="'+c.i+'"]');if(e)alignRoadArtwork(e,c.point,'bridge',c.routes);
}
const alignedShow=show;
show=function(type,id,fly=true){
 alignedShow(type,id,fly);
 if(type==='poi'){
  const point=D.markers.find(m=>m.i===+id)?.symbolPoint;
  if(point)$('#selection').innerHTML=`<circle cx="${point[0]}" cy="${point[1]}" r="12"/>`;
 }
};
window.closestRoadPoint=closestRoadPoint;
renderView();
