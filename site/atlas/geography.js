/* Audited physical geography, access notes and crossing classifications. */
$('#journeyOffroad').closest('label').insertAdjacentHTML('afterend','<label><input id="journeyTeleport" type="checkbox"> Allow Melisor teleportation · requires access</label><p class="muted">Teleport routes use Thelemar as a planning hub and allow one hour per transfer. Circle locations, permission and waiting times are not established by the lore.</p>');
const crossingGroup=document.createElementNS(NS,'g');crossingGroup.id='crossings';map.insertBefore(crossingGroup,$('#labels'));
$('#layerlist').insertAdjacentHTML('beforeend','<label><input type="checkbox" data-layer="crossings" checked>Bridges & fords</label>');
crossingGroup.innerHTML=(D.crossings||[]).filter(c=>c.markerId===undefined).map(c=>`<g data-type="crossing" data-id="${c.i}" transform="translate(${c.point[0]} ${c.point[1]})"><circle r="8" fill="transparent"/>${c.kind==='bridge'?'<use href="#poi-bridge" transform="scale(.45)"/>':'<use href="#poi-water" transform="scale(.28)"/>'}<title>${c.kind==='bridge'?'Bridge':'Ford'} · ${esc(D.routes.find(r=>r.i===c.routes[0])?.name)}</title></g>`).join('');
for(const b of D.burgs.filter(b=>b.previousName))records.push({type:'burg',id:b.i,name:b.previousName+' (now '+b.name+')',sub:'Former atlas name'});
const geographicShow=show;show=function(type,id,fly=true){
 if(type==='crossing'){
  const c=D.crossings.find(c=>c.i===+id);if(!c)return;selected={type,id:+id};$('#selection').innerHTML=`<circle cx="${c.point[0]}" cy="${c.point[1]}" r="12"/>`;
  $('#info').innerHTML=`<span class="eyebrow">RIVER CROSSING</span><h2>${c.kind==='bridge'?'Bridge':'Ford'}</h2><p>${esc(c.basis)}</p><p>${c.routes.map(id=>esc(D.routes.find(r=>r.i===id)?.name)).join(' · ')}</p><p class="muted">${c.kind==='ford'?'Ford passability depends on water level.':'Bridge size and load capacity are not specified.'}</p>`;if(fly)focusPoints([c.point],200);renderView();return;
 }
 geographicShow(type,id,fly);
 if(type==='burg'){
  const b=burg(id);if(b.previousName)$('#info').insertAdjacentHTML('beforeend',`<p>Previously labeled ${esc(b.previousName)} in this atlas; corrected to the capital named in the nation lore.</p>`);
  if(b.habitat)$('#info').insertAdjacentHTML('beforeend',`<p><strong>Setting:</strong> ${esc(b.habitat)}</p>`);
  if(b.accessNote)$('#info').insertAdjacentHTML('beforeend',`<p>${esc(b.accessNote)}</p>`);
 }else if(type==='nation'&&state(id)?.populationModel)$('#info').insertAdjacentHTML('beforeend',`<p>${esc(state(id).populationModel)}</p>`);
};
const geographyRender=renderSettlementNames;renderSettlementNames=function(z,unit){geographyRender(z,unit);for(const e of crossingGroup.children)e.toggleAttribute('hidden',detailMode!=='all'&&z<5&&!(selected?.type==='crossing'&&selected.id===+e.dataset.id));};
$('#symbolLegend').insertAdjacentHTML('beforeend','<p class="muted">Small bridges and fords appear at 5×. These are inferred transport infrastructure; named bridge POIs remain distinct.</p>');
renderView();
