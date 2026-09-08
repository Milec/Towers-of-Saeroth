/* Deterministic shortest-time routing on the saved transport / land-cell mesh. */
window.AtlasRouter=class AtlasRouter{
 constructor(network){this.net=network;this.adj=Array.from({length:network.nodes.length},()=>[]);network.edges.forEach((e,i)=>{this.adj[e[0]].push([e[1],i]);this.adj[e[1]].push([e[0],i]);});}
 distance(a,b){const p=this.net.nodes[a],q=this.net.nodes[b];return Math.hypot(p[0]-q[0],p[1]-q[1])*this.net.kmPerUnit;}
 find(start,end,{mode='walk',sail=true,offroad=true,teleport=false}={}){
  if(!this.adj[start]||!this.adj[end])return null;
  const speed={walk:24,ride:40,caravan:20}[mode]||24,n=this.adj.length;
  const d=new Float64Array(n).fill(Infinity),prev=new Int32Array(n).fill(-1),pe=new Int32Array(n).fill(-1),heap=[];
  const push=(x)=>{let i=heap.length;heap.push(x);while(i){let p=(i-1)>>1;if(heap[p][0]<=x[0])break;heap[i]=heap[p];i=p;}heap[i]=x;};
  const pop=()=>{const x=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length&&heap[c+1][0]<heap[c][0])c++;if(heap[c][0]>=last[0])break;heap[i]=heap[c];i=c;}heap[i]=last;}return x;};
  d[start]=0;push([0,start]);
  while(heap.length){const [cost,u]=pop();if(cost!==d[u])continue;if(u===end)break;
   for(const [v,ei] of this.adj[u]){const e=this.net.edges[ei],kind=e[2],water=kind==='searoutes'||kind==='port';if(water&&!sail||kind==='overland'&&!offroad||kind==='teleport'&&!teleport)continue;
    const km=this.distance(u,v),days=kind==='teleport'?(this.net.teleportHoursPerLeg||1)/24:km/(water?100:speed)*(kind==='overland'?2.5:kind==='trails'?1.3:1);
    const nd=cost+days;if(nd<d[v]){d[v]=nd;prev[v]=u;pe[v]=ei;push([nd,v]);}
   }
  }
  if(!Number.isFinite(d[end]))return null;
  const cells=[end],edges=[];let v=end;while(v!==start){edges.push(this.net.edges[pe[v]]);v=prev[v];cells.push(v);}cells.reverse();edges.reverse();
  let km=0,seaKm=0,offroadKm=0,teleportLegs=0;edges.forEach((e,i)=>{if(e[2]==='teleport'){teleportLegs++;return;}const x=this.distance(cells[i],cells[i+1]);km+=x;if(['searoutes','port'].includes(e[2]))seaKm+=x;if(e[2]==='overland')offroadKm+=x;});
  return {cells,edges,days:d[end],km,seaKm,offroadKm,teleportLegs,points:cells.map(c=>this.net.nodes[c].slice(0,2))};
 }
};
