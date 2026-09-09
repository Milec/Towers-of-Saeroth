/* Nation > province > generated district > settlement, with no changes to canon. */
(() => {
  const labelGroup=document.createElementNS(NS,'g');labelGroup.id='districtlabels';labelGroup.setAttribute('pointer-events','none');$('#labels').append(labelGroup);
  $('#layerlist').insertAdjacentHTML('beforeend','<label><input type="checkbox" data-layer="districtlabels">District names</label>');
  labelGroup.setAttribute('hidden','');
  const seats=document.createElementNS(NS,'g');seats.id='districtseats';map.insertBefore(seats,$('#labels'));
  seats.innerHTML=districts.filter(d=>!d.externalSeat).map(d=>{const b=burg(d.capital);return `<g data-type="burg" data-id="${b.i}"><circle class="district-seat" cx="${b.x}" cy="${b.y}" r="3" fill="none" stroke="#695436" stroke-width="1.2"/><title>District capital: ${esc(b.name)} · ${esc(d.name)}</title></g>`;}).join('');
  const priorRender=renderSettlementNames;
  renderSettlementNames=function(z,unit){
    priorRender(z,unit);
    const enabled=layerEnabled('subprovinces');
    seats.toggleAttribute('hidden',!enabled||!layerEnabled('settlements')||z<3);
    seats.querySelectorAll('[data-id]').forEach(e=>e.toggleAttribute('hidden',!tierPrefs[tier(burg(+e.dataset.id))].icons));
    seats.querySelectorAll('circle').forEach(c=>{c.setAttribute('r',4*unit);c.setAttribute('stroke-width',1.1*unit);});
    if(!enabled||!layerEnabled('districtlabels')||z<4){labelGroup.replaceChildren();return;}
    const occupied=[];
    labelGroup.innerHTML=districts.filter(d=>inView(d.pole[0],d.pole[1])).map(d=>{
      const [x,y]=d.pole,w=d.name.length*7*unit,h=17*unit,rect=[x-w/2,y-h,w,h];
      if(occupied.some(r=>intersects(r,rect)))return '';
      occupied.push(rect);
      return `<text data-place="subprovince-${d.i}" x="${x}" y="${y}" text-anchor="middle" font-size="${12*unit}" stroke-width="${2.8*unit}">${esc(d.name)}</text>`;
    }).join('');
  };
  function hierarchy() {
    if(!selected)return;
    const panel=document.createElement('section');panel.className='district-hierarchy';
    if(selected.type==='province'){
      const children=districts.filter(d=>d.province===selected.id);
      panel.innerHTML='<h3>Districts</h3><p class="muted">Nation → province → district → settlement</p>'+(children.length?children.map(d=>resultHTML({type:'subprovince',id:d.i,name:d.name,sub:`${d.externalSeat?'Administered from':'Capital'} ${burg(d.capital).name} · ${d.burgs.length} settlements`})).join(''):'<p class="muted">No districts available.</p>');
    }else if(selected.type==='nation'){
      const provinces=D.provinces.filter(p=>p?.i&&!p.removed&&p.state===selected.id);
      panel.innerHTML=`<details><summary>Territories · ${provinces.length} provinces</summary>${provinces.map(p=>resultHTML({type:'province',id:p.i,name:p.fullName,sub:districts.filter(d=>d.province===p.i).length+' districts'})).join('')}</details>`;
    }else if(selected.type==='burg'){
      const d=districtForBurg.get(selected.id);
      if(!d)return;
      panel.innerHTML=(burg(selected.id).modeledDistrictSeat?'<p class="muted">Modeled small settlement · 200 residents allocated from the province’s rural estimate. Working atlas name.</p>':'')+'<h3>Administrative district</h3>'+resultHTML({type:'subprovince',id:d.i,name:d.name,sub:d.capital===selected.id?'District capital':D.provinces.find(p=>p?.i===d.province)?.fullName});
    }else if(selected.type==='subprovince'){
      panel.innerHTML='<p class="muted">Hierarchy: nation → province → district → settlement. Districts are generated atlas records, not newly established campaign lore or noble titles.</p>';
    }else return;
    $('#info h2').after(panel);
  }
  const priorShow=show;show=function(...args){priorShow(...args);hierarchy();};
  hierarchy();renderView();
})();
