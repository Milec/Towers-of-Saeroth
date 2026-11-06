import assert from 'node:assert/strict';
import {test} from 'node:test';
import {repairDocumentIds} from './foundry-document-ids.mjs';

test('repair invalid historic document IDs without churning valid children or artwork',()=>{
  const source={_id:'old_actor-id12345',name:'A legacy NPC',img:'modules/saeroth-pf2e-content/assets/actors/old_actor-id12345.png',items:['validChildAB1234','old_spell-id1234','old_entry-id1234'],__items:[
    {_id:'validChildAB1234',type:'action',system:{description:{value:'A valid action.'}}},
    {_id:'old_entry-id1234',type:'spellcastingEntry',system:{slots:{slot1:{prepared:{0:{id:'old_spell-id1234',expended:false}}}}}},
    {_id:'old_spell-id1234',type:'spell',system:{location:{value:'old_entry-id1234'}},flags:{core:{sourceId:'Actor.old_actor-id12345.Item.old_spell-id1234'}}}
  ]};
  const original=structuredClone(source),result=repairDocumentIds(source);
  assert.deepEqual(source,original);assert.notEqual(result._id,source._id);assert.match(result._id,/^[a-zA-Z0-9]{16}$/);
  assert.equal(result.__items[0]._id,source.__items[0]._id);assert.equal(result.img,source.img);
  assert.deepEqual(result.items,[result.__items[0]._id,result.__items[2]._id,result.__items[1]._id]);
  assert.equal(result.__items[2].system.location.value,result.__items[1]._id);
  assert.equal(result.__items[1].system.slots.slot1.prepared[0].id,result.__items[2]._id);
  assert.equal(result.__items[2].flags.core.sourceId,`Actor.${result._id}.Item.${result.__items[2]._id}`);
  assert.deepEqual(repairDocumentIds(result),result);assert.deepEqual(repairDocumentIds(source),result);
});

test('already valid IDs and ordinary prose survive unchanged',()=>{
  const source={_id:'validActorAB1234',items:['validChildAB1234'],__items:[{_id:'validChildAB1234',name:'Ordinary prose old_actor-id12345',system:{}}]};
  assert.deepEqual(repairDocumentIds(source),source);
});
