import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
// Build-time reuse of the same maintained generator used by the website.
const engine = require('../../site/atlas/battlemap-engine.js');
const foundry = require('../../site/atlas/battlemap-foundry.js');
export const recipe = Object.freeze({seed:'expedition-quarry-supplies-v1',kind:'ruin',terrain:'mountain',size:32,name:'Old Survey Quarry — Supply Recovery',source:{type:'custompoi',id:1793996607857}});
export function buildExpeditionRecoveryScene() {
  const model = engine.generate(recipe);
  const asset = 'assets/maps/expedition-supply-recovery.webp';
  const scene = foundry.scene(model,{backgroundPath:'modules/saeroth-pf2e-content/'+asset,time:'day'});
  scene.flags['saeroth-pf2e-content'] = {
    session:5,
    source:'campaign/quests/The Missing Survey Stores.md',
    setup:'Unplayed preparation. 160 ft square; southern road reaches an open sorting yard. Four broken pillars, a northeast stone sorting bench, and an inner L-shaped partition provide cover. The west, east, north and south wall openings remain traversable. Stage the supplies on the floor south of the northeast bench at (2250, 1150). The quest note gives actor staging and noncombat approaches. This is a proposed encounter site near the search camp, not the expedition camp or a discovered tower.',
    limitations:'No actors preplaced, no combat started, and no automated cliff falls or difficult terrain. Natural daylight is configured; no fire sources are depicted. Existing scenes remain unchanged.'
  };
  return {slug:'expedition-supply-recovery',asset,scene};
}
