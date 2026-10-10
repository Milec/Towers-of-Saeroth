import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildSessionThreeScenes} from './session-three-scenes.mjs';
const entries=buildSessionThreeScenes();
assert.equal(entries.length,3);
for(const {scene,asset,slug} of entries){
  assert.equal(scene.active,false);assert.equal(scene.navigation,false);
  assert.equal(scene.tokens.length,0);assert.equal(scene.width/scene.grid.size,32);
  assert.equal(scene.levels[0].background.src,`modules/saeroth-pf2e-content/${asset}`);
  const png=await readFile(new URL(`../${asset}`,import.meta.url));
  assert.equal(png.subarray(1,4).toString(),'PNG');
  assert.equal(png.readUInt32BE(16),1254);assert.equal(png.readUInt32BE(20),1254);
  const ids=[scene._id,...['levels','walls','lights'].flatMap(k=>scene[k].map(x=>x._id))];
  assert.equal(new Set(ids).size,ids.length);
  for(const w of scene.walls){assert.equal(w.c.length,4);assert(w.c.every(n=>Number.isInteger(n)&&n>=0&&n<=3200));assert.deepEqual(w.levels,[scene.initialLevel]);assert.notDeepEqual(w.c.slice(0,2),w.c.slice(2));}
  for(const l of scene.lights){assert(l.x>=0&&l.x<=3200&&l.y>=0&&l.y<=3200);assert.deepEqual(l.levels,[scene.initialLevel]);}
  const saved=JSON.parse(await readFile(new URL(`../content/scenes/${slug}.json`,import.meta.url),'utf8'));
  assert.deepEqual(saved,scene);
}
assert.equal(entries[1].scene.walls.filter(w=>w.door).length,5);
assert(entries[0].scene.walls.every(w=>w.sight===0));
assert(!entries[2].scene.walls.some(w=>/tower/i.test(w.flags['saeroth-pf2e-content'].label)));
assert.match(entries[2].scene.flags['saeroth-pf2e-content'].setup,/has not found it/);
console.log('Session 3: assets, saved scenes, geometry, doors, level references and search-camp continuity passed.');
