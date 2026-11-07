/* Four task views replace the old continuous list of unrelated controls. */
(() => {
  'use strict';
  const aside=document.querySelector('aside'), main=document.querySelector('main');
  const node=id=>document.getElementById(id);
  const titles={places:['Places','Find a destination or read the selected place.'],travel:['Travel','Plan the road ahead or track a hexcrawl.'],map:['Layers','Choose what the map shows.'],saved:['Saved','Return to places and views you have kept.']};
  const originalChildren=[...aside.children];
  const nav=document.createElement('div');nav.className='atlas-panel-nav';
  nav.innerHTML='<div class="atlas-panel-tabs" role="tablist" aria-label="Atlas views">'+Object.entries(titles).map(([key,[label]])=>`<button type="button" role="tab" id="atlasTab-${key}" data-atlas-panel="${key}" aria-controls="atlasPanel-${key}" aria-selected="false" tabindex="-1">${label}</button>`).join('')+'</div><button type="button" id="atlasReturnMap" aria-label="Back to map" title="Back to map"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2zM9 3v16M15 5v16"/></svg></button>';
  document.querySelector('.atlas-workbench-heading').after(nav);
  const panels={};
  for(const [key,[title,description]] of Object.entries(titles)){
    const panel=document.createElement('section');panel.className='atlas-task-panel';panel.id='atlasPanel-'+key;
    panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby','atlasTab-'+key);panel.hidden=true;
    const intro=document.createElement('div');intro.className='atlas-panel-intro';
    intro.innerHTML=`<h2>${title==='Layers'?'Map appearance':title}</h2><p>${description}</p>`;
    panel.append(intro);panels[key]=panel;aside.append(panel);
  }
  const move=(element,where)=>{if(element)panels[where].append(element);};
  move(document.querySelector('.search'),'places');
  move(node('info'),'places');
  move(node('customPOIPanel'),'places');
  move(document.querySelector('.catalogue'),'places');
  move(node('journey'),'travel');
  move(node('hexcrawl'),'travel');
  move(node('travelView'),'travel');
  move(document.querySelector('.atlas-presets'),'map');
  move(document.querySelector('.atlas-sepia'),'map');
  move(node('mapOptions'),'map');
  for(const child of originalChildren)if(child.parentElement===aside&&child.classList.contains('atlas-controls'))move(child,'map');
  move(document.querySelector('.legend'),'map');
  const downloads=document.createElement('details');downloads.className='atlas-downloads';
  downloads.innerHTML='<summary>Map downloads & edition details</summary>';
  const footer=aside.querySelector('footer');if(footer)downloads.append(footer);panels.map.append(downloads);
  move(node('atlasLibrary'),'saved');
  move(node('poiSync'),'saved');
  node('atlasLibrary').open=true;
  node('mapOptions').open=true;
  // These stay in the DOM for existing integrations, but are superseded by the
  // four persistent views. There is no duplicate toolbar for readers to learn.
  document.querySelectorAll('.atlas-shortcuts,.atlas-jumps').forEach(el=>el.hidden=true);
  const placesActions=document.createElement('div');placesActions.className='atlas-places-actions';
  placesActions.innerHTML='<button type="button" id="atlasNewPin">+ Add map pin</button><button type="button" id="atlasShowSelected">Selected place</button>';
  document.querySelector('.search').after(placesActions);
  const settingsLink=document.createElement('button');settingsLink.type='button';settingsLink.className='atlas-publish-settings';settingsLink.textContent='Publish map notes';
  node('customPOIPanel').append(settingsLink);
  const status=document.createElement('p');status.id='atlasPanelStatus';status.setAttribute('role','status');status.className='atlas-panel-status';status.hidden=true;nav.after(status);
  // Contextual shortcuts reuse the selected place's real controls. The map
  // keeps its own compact action disclosure instead of another permanent bar.
  const selectionCard=node('atlasSelectionCard');
  const selectionActions=document.createElement('details');selectionActions.id='atlasSelectionActions';selectionActions.className='atlas-selection-actions';selectionActions.hidden=true;
  selectionActions.innerHTML='<summary>Actions</summary><div class="atlas-selection-menu"><button type="button" data-place-action="routeEnd">Travel here</button><button type="button" data-place-action="partyHere">Mark party here</button><button type="button" data-place-action="atlasGenerateBattlemap">Generate battle map</button></div>';
  const selectionFeedback=document.createElement('p');selectionFeedback.id='atlasSelectionFeedback';selectionFeedback.setAttribute('role','status');selectionFeedback.setAttribute('aria-live','polite');
  selectionCard.append(selectionActions,selectionFeedback);
  const selectionKey=()=>selected?selected.type+'-'+selected.id:'';
  let actionKey='';
  function refreshSelectionActions(){
    const key=selectionKey(),valid=!!key&&!!node('info').querySelector('.atlas-place-toolbar');
    if(key!==actionKey||!valid){selectionActions.open=false;selectionFeedback.textContent='';}
    actionKey=key;
    let count=0;
    for(const button of selectionActions.querySelectorAll('[data-place-action]')){
      const action=button.dataset.placeAction;
      const supported=valid&&(action==='atlasGenerateBattlemap'
        ?!!window.SaerothBattlemaps?.contextFor(selected.type,Number(selected.id))
        :!!node(action));
      button.hidden=!supported;if(supported)count++;
    }
    selectionActions.hidden=!count;
    node('atlasShowSelected').disabled=!valid;
    node('atlasShowSelected').title=valid?'Open the selected place':'Choose a place on the map or in search first';
    node('atlasSelectionName').title=node('atlasSelectionName').textContent;
    selectionActions.querySelector('summary').setAttribute('aria-label','Actions for '+node('atlasSelectionName').textContent);
  }
  selectionActions.addEventListener('toggle',()=>{if(selectionActions.open){selectionFeedback.textContent='';refreshSelectionActions();}});
  selectionActions.addEventListener('click',event=>{
    const button=event.target.closest('[data-place-action]');if(!button)return;
    const key=selectionKey(),action=button.dataset.placeAction;
    if(key!==actionKey||!key){refreshSelectionActions();return;}
    selectionActions.open=false;
    const trigger=selectionActions.querySelector('summary');
    if(action==='atlasGenerateBattlemap'){
      const context=window.SaerothBattlemaps?.contextFor(selected.type,Number(selected.id));
      if(context)window.SaerothBattlemaps.open(context,trigger);
      return;
    }
    const target=node(action);if(!target||target.disabled)return;
    target.click();
    if(action==='partyHere'){
      selectionFeedback.textContent=node('atlasPlaceFeedback')?.textContent||'Party location updated.';
      trigger.focus({preventScroll:true});
    }
  });
  selectionActions.addEventListener('keydown',event=>{
    if(event.key!=='Escape'||!selectionActions.open)return;
    event.preventDefault();event.stopPropagation();selectionActions.open=false;selectionActions.querySelector('summary').focus({preventScroll:true});
  });
  document.addEventListener('pointerdown',event=>{if(!selectionActions.contains(event.target))selectionActions.open=false;},true);
  selectionActions.addEventListener('focusout',event=>{if(event.relatedTarget&&!selectionActions.contains(event.relatedTarget))selectionActions.open=false;});
  new MutationObserver(refreshSelectionActions).observe(node('info'),{childList:true,subtree:true});
  let active='places';
  function open(name,{focus=false,section}={}){
    if(!panels[name])return;
    active=name;
    for(const [key,panel]of Object.entries(panels)){panel.hidden=key!==name;const tab=node('atlasTab-'+key);tab.setAttribute('aria-selected',String(key===name));tab.tabIndex=key===name?0:-1;}
    try{sessionStorage.setItem('saeroth-atlas-panel',name);}catch{}
    if(section){const target=typeof section==='string'?node(section):section;if(target?.tagName==='DETAILS')target.open=true;}
    if(name==='travel'&&!section&&!['journey','hexcrawl','travelView'].some(id=>node(id).open))node('journey').open=true;
    if(focus){
      if(matchMedia('(max-width:800px)').matches)panels[name].scrollIntoView({block:'start',behavior:'auto'});
      else aside.scrollTo({top:0,behavior:'auto'});
      node('atlasTab-'+name).focus({preventScroll:true});
    }
  }
  function reveal(target,{focus=false}={}){
    const element=typeof target==='string'?node(target):target;
    const panel=element?.closest('.atlas-task-panel');if(!panel)return;
    open(panel.id.replace('atlasPanel-',''),{focus,section:element});
  }
  function backToMap(){document.querySelector('.mapframe').scrollIntoView({block:'start',behavior:'auto'});node('map').focus({preventScroll:true});}
  nav.addEventListener('click',event=>{const tab=event.target.closest('[data-atlas-panel]');if(tab)open(tab.dataset.atlasPanel,{focus:true});});
  nav.addEventListener('keydown',event=>{
    if(!event.target.matches('[data-atlas-panel]')||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();const keys=Object.keys(panels),i=keys.indexOf(active),next=event.key==='Home'?0:event.key==='End'?keys.length-1:(i+(event.key==='ArrowRight'?1:-1)+keys.length)%keys.length;open(keys[next],{focus:true});
  });
  node('atlasReturnMap').onclick=backToMap;
  node('atlasNewPin').onclick=()=>{reveal('customPOIPanel');node('customPOIAdd').click();};
  node('atlasShowSelected').onclick=()=>{open('places');node('info').scrollIntoView({block:'start',behavior:'auto'});};
  settingsLink.onclick=()=>{reveal('poiSync',{focus:true});node('poiSync').scrollIntoView({block:'start',behavior:'auto'});node('poiSyncToken').focus({preventScroll:true});};
  // Reveal before existing handlers focus fields or scroll. No routing or
  // hexcrawl logic is duplicated here.
  document.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    if(['routeStart','routeEnd'].includes(button.id))reveal('journey');
    if(button.id==='customPOIEdit')reveal('customPOIPanel');
    if(button.id==='atlasSelectionDetails')open('places');
    if(button.id==='atlasFindParty'&&!partyPlace&&!node('hexEnabled').checked)reveal('travelView');
    if(button.dataset.open)reveal(button.dataset.open);
    if(button.dataset.jump){if(button.dataset.jump==='map')backToMap();else reveal(button.dataset.jump);}
  },true);
  document.addEventListener('keydown',event=>{
    if(document.querySelector('dialog[open]'))return;
    if(event.key==='/'&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!event.target.closest('input,textarea,select,[contenteditable]'))open('places',{focus:false});
  },true);
  // The point-of-interest placement flow returns from the map to its form.
  document.addEventListener('focusin',event=>{const panel=event.target.closest('.atlas-task-panel');if(panel?.hidden)reveal(event.target);});
  const originalShow=show;
  show=function(...args){open('places');const result=originalShow(...args);queueMicrotask(refreshSelectionActions);return result;};
  const messages=new MutationObserver(()=>{
    const text=node('atlasWorkspaceStatus').textContent;
    if(/could not|invalid|failed|unreadable|not valid/i.test(text)){status.textContent=text;status.hidden=false;}
    else{status.hidden=true;status.textContent='';}
  });messages.observe(node('atlasWorkspaceStatus'),{childList:true,subtree:true,characterData:true});
  let start='places';try{if(!location.hash)start=sessionStorage.getItem('saeroth-atlas-panel')||start;}catch{}
  open(start);
  refreshSelectionActions();
  document.documentElement.classList.add('atlas-panel-layout');
  window.AtlasPanels={open,reveal,backToMap,get active(){return active;}};
})();
