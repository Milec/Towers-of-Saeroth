/* Flattened territory handouts. Outside pixels are never included in the PNG. */
(() => {
  const PAPER = '#f7f0df';
  let obscured = false, exporting = false, downloadURL;
  const overlay = document.createElementNS(NS, 'path');
  overlay.id = 'handoutCover';
  overlay.setAttribute('fill', PAPER);
  overlay.setAttribute('fill-rule', 'evenodd');
  overlay.setAttribute('pointer-events', 'none');
  overlay.hidden = true;
  map.append(overlay);

  function territory() {
    if (selected?.type === 'nation') {
      const record = D.countries.find(c => c.properties.state === selected.id);
      return record && {path:record.path, name:state(selected.id).fullName};
    }
    if (selected?.type === 'province') {
      const record = D.provinces.find(p => p?.i === selected.id && !p.removed);
      return record?.path && {path:record.path, name:record.fullName || record.name};
    }
    return null;
  }

  function bounds(region) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', region.path); p.setAttribute('visibility', 'hidden'); map.append(p);
    const b = p.getBBox(); p.remove();
    if (!b.width || !b.height) throw Error('This territory has no exportable boundary.');
    const pad = Math.max(12, Math.max(b.width, b.height) * .04);
    return [b.x-pad, b.y-pad, b.width+pad*2, b.height+pad*2];
  }

  function updateCover() {
    const region = territory();
    overlay.hidden = !obscured || !region;
    overlay.style.display = overlay.hidden ? 'none' : '';
    if (region) overlay.setAttribute('d', 'M-100000,-100000H100000V100000H-100000Z ' + region.path);
    map.append(overlay); // Covers labels, journey overlays and every other map layer.
  }

  function controls() {
    updateCover();
    if (!territory()) return;
    const panel = document.createElement('section'); panel.className = 'handout-tools';
    panel.innerHTML = `<h3>Territory handout</h3>
      <p>Keep this territory visible and cover the rest with parchment.</p>
      <label><input id="handoutHide" type="checkbox" ${obscured?'checked':''}> Hide outside territory</label>
      <div class="journey-actions"><button id="handoutFit">Fit territory</button><button id="handoutExport" ${exporting?'disabled':''}>Export PNG handout</button></div>
      <p class="muted">Exports always conceal the outside, even with preview off. Current layers and settlement-name filters are included; labels are fitted inside the boundary. The PNG contains no interactive map data.</p>
      <p id="handoutStatus" role="status" aria-live="polite"></p>`;
    document.querySelector('#info h2').after(panel);
    document.getElementById('handoutHide').onchange = e => {obscured=e.target.checked;updateCover();};
    document.getElementById('handoutFit').onclick = () => {box=bounds(territory());renderView();updateCover();};
    document.getElementById('handoutExport').onclick = exportHandout;
  }

  function handoutLabels(clone, region, crop, width) {
    const group=clone.querySelector('#townlabels');
    if (!group) return;
    group.replaceChildren();
    const context=document.createElement('canvas').getContext('2d');
    const boundary=new Path2D(region.path), unit=crop[2]/width, size=23*unit;
    const occupied=[];
    context.font='23px Georgia';
    const inside=(x,y)=>context.isPointInPath(boundary,x,y,'evenodd');
    const settlements=D.burgs.filter(b=>tierPrefs[tier(b)].names && inside(b.x,b.y))
      .sort((a,b)=>(b.capital||0)-(a.capital||0)||b.population-a.population);
    for (const b of settlements) {
      const w=context.measureText(b.name).width*unit, h=size*1.2, gap=10*unit;
      const options=[[b.x+gap,b.y-gap],[b.x-w-gap,b.y-gap],[b.x-w/2,b.y-h-gap],[b.x-w/2,b.y+h+gap]];
      for (const [x,y] of options) {
        const rect=[x,y-h,w,h];
        if (![[x,y],[x+w,y],[x,y-h],[x+w,y-h],[x+w/2,y-h/2]].every(([a,c])=>inside(a,c))) continue;
        if(occupied.some(r=>x<r[0]+r[2]&&x+w>r[0]&&y-h<r[1]+r[3]&&y>r[1]))continue;
        occupied.push(rect);
        const text=document.createElementNS(NS,'text');text.textContent=b.name;
        for(const [key,value] of Object.entries({x,y,fill:'#233a36',stroke:PAPER,'stroke-width':3*unit,'paint-order':'stroke','font-family':'Georgia','font-size':size}))text.setAttribute(key,value);
        group.append(text);break;
      }
    }
  }

  const properties = ['display','visibility','opacity','fill','fill-opacity','fill-rule','stroke','stroke-width','stroke-opacity','stroke-dasharray','stroke-linecap','stroke-linejoin','paint-order','font-family','font-size','font-weight','font-style','text-anchor','dominant-baseline','vector-effect'];
  const assets = new Map();
  async function embeddedAsset(href) {
    if (href.startsWith('data:')) return href;
    const url = new URL(href, location.href);
    if (url.origin !== location.origin) throw Error('An external map image cannot be included.');
    if (!assets.has(url.href)) assets.set(url.href, (async () => {
      const response = await fetch(url);
      if (!response.ok) throw Error('A map image is unavailable. Reconnect and retry.');
      const blob = await response.blob();
      return new Promise((resolve,reject) => {const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});
    })().catch(error => {assets.delete(url.href);throw error;}));
    return assets.get(url.href);
  }
  const nextPaint = () => new Promise(resolve => setTimeout(resolve, 30));

  async function exportHandout() {
    if (exporting || !territory()) return;
    const region = territory(), crop = bounds(region), sepia = window.ATLAS_SEPIA?.enabled();
    const status = document.getElementById('handoutStatus');
    const button = document.getElementById('handoutExport');
    exporting = true; button.disabled = true;
    let svgURL;
    try {
      status.textContent = 'Preparing the selected territory…'; await nextPaint();
      // Freeze the current drawing before any asynchronous image loading.
      const clone = map.cloneNode(true);
      const sourceNodes = [map, ...map.querySelectorAll('*')];
      const cloneNodes = [clone, ...clone.querySelectorAll('*')];
      const labelBoundary=new Path2D(region.path), labelCheck=document.createElement('canvas').getContext('2d');
      const inverse=map.getScreenCTM().inverse();
      sourceNodes.forEach((node,i) => {
        const style = getComputedStyle(node);
        for (const key of properties) cloneNodes[i].style.setProperty(key,style.getPropertyValue(key));
        if(node.tagName.toLowerCase()==='text'){
          const b=node.getBBox(), transform=inverse.multiply(node.getScreenCTM());
          const fits=[[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]].every(([x,y])=>{const p=new DOMPoint(x,y).matrixTransform(transform);return labelCheck.isPointInPath(labelBoundary,p.x,p.y,'evenodd');});
          if(!fits)cloneNodes[i].remove();
        }
      });
      clone.querySelectorAll('#handoutCover,#selection,#nationlabels,#backgroundDetail,title,desc').forEach(e=>e.remove());
      // Overview art is self-contained; regional SVG tiles may refer to other assets.
      // Keep the current vector roads, relief and settlement art at full export resolution.
      const defs = document.createElementNS(NS,'defs');
      const clip = document.createElementNS(NS,'clipPath'); clip.id='handout-territory';
      clip.setAttribute('clipPathUnits','userSpaceOnUse');
      const shape=document.createElementNS(NS,'path');shape.setAttribute('d',region.path);shape.setAttribute('clip-rule','evenodd');clip.append(shape);defs.append(clip);
      const content=document.createElementNS(NS,'g');content.setAttribute('clip-path','url(#handout-territory)');
      for(const child of [...clone.children]) {if(child.tagName.toLowerCase()!=='defs')content.append(child);}
      clone.append(defs,content);
      const width=2400, mapHeight=Math.max(1,Math.round(width*crop[3]/crop[2]));
      // Bound phone memory for unusually tall territories.
      const factor=Math.min(1,3000/mapHeight), w=Math.round(width*factor), h=Math.round(mapHeight*factor);
      handoutLabels(clone,region,crop,w);
      clone.setAttribute('xmlns',NS);clone.setAttribute('viewBox',crop.join(' '));
      clone.setAttribute('width',w);clone.setAttribute('height',h);
      clone.style.width=w+'px';clone.style.height=h+'px';clone.style.background='transparent';clone.style.filter='none';
      status.textContent='Loading artwork for the handout…'; await nextPaint();
      await Promise.all([...clone.querySelectorAll('image')].map(async image => {
        const href=image.getAttribute('href')||image.getAttributeNS('http://www.w3.org/1999/xlink','href');
        if(href){const data=await embeddedAsset(href);image.removeAttributeNS('http://www.w3.org/1999/xlink','href');image.setAttribute('href',data);}
      }));
      status.textContent='Rendering PNG…'; await nextPaint();
      const serialized=new XMLSerializer().serializeToString(clone);
      svgURL=URL.createObjectURL(new Blob([serialized],{type:'image/svg+xml;charset=utf-8'}));
      const image=new Image();image.src=svgURL;await image.decode();
      const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h+96;
      const context=canvas.getContext('2d');context.fillStyle=PAPER;context.fillRect(0,0,w,h+96);
      // A second raster clip makes redaction independent of SVG/CSS rendering quirks.
      context.save();context.scale(w/crop[2],h/crop[3]);context.translate(-crop[0],-crop[1]);
      context.clip(new Path2D(region.path),'evenodd');
      const artwork=sepia ? window.ATLAS_SEPIA.raster(image,w,h) : image;
      context.drawImage(artwork,crop[0],crop[1],crop[2],crop[3]);context.restore();
      context.fillStyle='#233a36';context.font='28px Georgia';context.textAlign='center';
      context.fillText(region.name,w/2,h+42,w-40);context.font='16px system-ui';
      context.fillText('Saeroth · Territory handout',w/2,h+72);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      if(!blob)throw Error('PNG creation failed. Try again with fewer map layers.');
      if(downloadURL)URL.revokeObjectURL(downloadURL);downloadURL=URL.createObjectURL(blob);
      const link=document.createElement('a');link.href=downloadURL;link.download=region.name.replace(/[^\p{L}\p{N}-]+/gu,'-')+'-handout.png';
      link.textContent='Save PNG handout'; status.replaceChildren(link);link.click();
    } catch(error) {status.textContent=error.message||'Export failed. Please try again.';}
    finally {if(svgURL)URL.revokeObjectURL(svgURL);exporting=false;document.querySelectorAll('#handoutExport').forEach(b=>b.disabled=false);}
  }
  const previousShow=show;
  show=function(...args){previousShow(...args);controls();};
  controls();
})();
