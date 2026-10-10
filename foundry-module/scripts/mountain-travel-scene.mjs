import { createHash } from 'node:crypto';
import { buildSessionThreeScenes } from './session-three-scenes.mjs';

export function buildMountainTravelScene() {
  const slug = 'mountain-travel', asset = `assets/maps/${slug}.png`;
  const scene = structuredClone(buildSessionThreeScenes()[0].scene);
  const id = key => createHash('sha256').update(`${slug}:${key}`).digest('hex').slice(0,16);
  const px = n => Math.round(n * 3200 / 1254);
  scene._id = id('scene');
  scene.name = 'Mountain Travel — Alpine Road';
  scene.thumb = scene.levels[0].background.src = `modules/saeroth-pf2e-content/${asset}`;
  scene.walls = []; scene.lights = [];
  scene.flags = {'saeroth-pf2e-content':{
    setup:'Reusable 160ft square mountain encounter map. Main road enters west and exits northeast; footpaths branch north and southwest. Large boulders block movement, sight and light. Northern shelf blocks ordinary movement only: GM adjudicates climbing. Small stones, shrubs and scree are manual terrain/cover, not invisible walls. Daylight default; two optional hidden lanterns may be revealed at night. No creatures or combat preselected.',
    source:'Generated mountain travel artwork; wall vertices traced at native 1254px resolution.'
  }};
  function line(label, points, opaque=true) {
    for(let i=1;i<points.length;i++) scene.walls.push({_id:id(`wall-${scene.walls.length}`),c:[...points[i-1],...points[i]].map(px),levels:[scene.initialLevel],move:20,sight:opaque?20:0,light:opaque?20:0,sound:0,dir:0,door:0,ds:0,flags:{'saeroth-pf2e-content':{label}}});
  }
  // Trace substantial rock footprints only; keep the road and trail junction clear.
  const rocks = [
    [[363,246],[406,235],[441,278],[463,331],[430,365],[383,350],[356,307]],
    [[726,377],[791,350],[825,374],[805,421],[753,455],[717,432]],
    [[819,336],[872,314],[925,334],[945,366],[893,404],[837,390]],
    [[374,708],[419,681],[452,706],[472,750],[444,791],[403,789],[365,759]],
    [[778,819],[812,782],[856,770],[883,803],[882,847],[824,875],[787,857]],
    [[196,717],[237,686],[266,709],[283,749],[253,773],[213,755]],
    [[157,504],[197,490],[232,515],[260,552],[222,581],[181,566]],
    [[0,533],[35,502],[76,493],[102,520],[82,557],[31,574],[0,563]],
    [[1000,617],[1040,606],[1096,631],[1114,670],[1080,695],[1032,679]]
  ];
  rocks.forEach((p,i)=>line(`Boulder ${i+1}`,[...p,p[0]]));
  line('Northern rock shelf — climb manually',[[278,0],[299,57],[350,94],[414,122],[473,111],[506,140],[565,147],[613,122],[661,105],[693,57],[719,0]],false);
  for(const [i,x,y] of [[0,478,544],[1,854,508]]) scene.lights.push({_id:id(`lantern-${i}`),name:'Optional travel lantern',x:px(x),y:px(y),elevation:3,levels:[scene.initialLevel],rotation:0,walls:true,vision:false,hidden:true,config:{bright:15,dim:30,angle:360,color:'#ffbf72',alpha:.25,luminosity:.5,attenuation:.5,darkness:{min:.25,max:1},animation:{type:'torch',speed:2,intensity:2}}});
  return {slug,asset,scene};
}
