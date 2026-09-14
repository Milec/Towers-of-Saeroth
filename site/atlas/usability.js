/* Short paths to common tasks; preserve existing controls and map records. */
(() => {
  const aside=document.querySelector('aside'), info=document.getElementById('info');
  document.querySelector('.atlas-presets').after(info);
  const shortcuts=document.createElement('nav');shortcuts.className='atlas-shortcuts';shortcuts.setAttribute('aria-label','Quick atlas actions');
  shortcuts.innerHTML='<button type="button" data-open="journey">Plan route</button><button type="button" data-open="hexcrawl">Hexcrawl</button><button type="button" data-open="mapOptions">Map options</button>';
  info.before(shortcuts);document.querySelector('.layers').id='mapOptions';
  const go=id=>{
    const target=document.getElementById(id);if(!target)return;
    if(target.tagName==='DETAILS')target.open=true;
    target.scrollIntoView({block:'start',behavior:'auto'});
    const focus=target.querySelector('summary,input,button');focus?.focus({preventScroll:true});
  };
  shortcuts.onclick=e=>{const id=e.target.closest('button')?.dataset.open;if(id)go(id);};
  const jumps=document.querySelector('.atlas-jumps');
  const hex=document.createElement('button');hex.type='button';hex.dataset.jump='hexcrawl';hex.textContent='Hexcrawl';
  jumps.querySelector('[data-jump="info"]').before(hex);
  jumps.onclick=e=>{
    const id=e.target.closest('button')?.dataset.jump;if(!id)return;
    if(id==='map'){document.querySelector('.mapframe').scrollIntoView({block:'start',behavior:'auto'});document.getElementById('map').focus({preventScroll:true});}
    else go(id);
  };
  // Reduced visual noise on first visit; explicit shortcuts open the task.
  document.getElementById('journey').open=['journeyFrom','journeyTo','journeyVia'].some(id=>document.getElementById(id).value.trim());
  document.getElementById('travelView').open=false;
  const originalShow=show;
  show=function(...args){originalShow(...args);if(!matchMedia('(max-width:800px)').matches)aside.scrollTo({top:0,behavior:'auto'});};
  const mode=document.getElementById('hexTravelMode');
  if(mode){const source=document.getElementById('journeyMode');mode.innerHTML=source.innerHTML;mode.value=source.value;mode.onchange=()=>{source.value=mode.value;source.dispatchEvent(new Event('change',{bubbles:true}));};source.addEventListener('change',()=>{mode.value=source.value;});}
  document.getElementById('hexChoose').addEventListener('click',()=>{
    if(document.getElementById('hexChoose').textContent.startsWith('Cancel'))document.querySelector('.mapframe').scrollIntoView({block:'start',behavior:'auto'});
  });
})();
