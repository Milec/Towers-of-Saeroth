const APP=require('./app.js');
const fs=require('fs');
(async()=>{
  const b=await APP.launch();
  const p=await APP.openApp(b);
  const errs=[]; p.on('pageerror',e=>errs.push(e.message.slice(0,140)));
  const before = await p.evaluate(()=>pack.states.filter(s=>s.i&&!s.removed).map(s=>s.fullName).slice(0,3));
  console.log('before load:', before.join(', '));

  // feed the .map file through the app's own uploader
  const mapPath = process.env.MAP || '/home/user/Towers-of-Saeroth/campaign/Saeroth.map';
  await APP.loadMap(p, mapPath).catch(async e=>{
    console.log('  FAILED to load', mapPath, '-', e.message);
    throw e;
  });
  const after = await p.evaluate(()=>({
    states: pack.states.filter(s=>s.i&&!s.removed).map(s=>s.fullName),
    burgs: pack.burgs.filter(x=>x.i).length,
    cells: pack.cells.i.length,
    seed: window.seed, unit: distanceUnitInput.value,
    terrain: (()=>{
      const cl=pack.cells, acc={};
      for(let i=0;i<cl.i.length;i++){ if(cl.h[i]<20) continue; const st=cl.state[i]; if(!st) continue;
        acc[st] ??= {n:0,des:0,grs:0,jgl:0,tga:0,wet:0,mtn:0,hil:0,isl:new Set()};
        const a=acc[st], b=cl.biome[i]; a.n++;
        if(b===1||b===2)a.des++; if(b===3||b===4)a.grs++; if(b===5||b===7)a.jgl++;
        if(b===9||b===10||b===11)a.tga++; if(b===12)a.wet++;
        if(cl.h[i]>=60)a.mtn++; if(cl.h[i]>=40&&cl.h[i]<60)a.hil++; a.isl.add(cl.f[i]);
      }
      return pack.states.filter(s=>s.i&&!s.removed).map(s=>{
        const a=acc[s.i]; if(!a) return {name:s.fullName,cells:0};
        const p=v=>Math.round(100*v/a.n);
        return {name:s.fullName,cells:a.n,burgs:s.burgs||0,des:p(a.des),grs:p(a.grs),
                jgl:p(a.jgl),tga:p(a.tga),wet:p(a.wet),mtn:p(a.mtn),hil:p(a.hil),isl:a.isl.size};
      });
    })(),
    diplo: (()=>{ const byN={}; pack.states.forEach(s=>{if(s.i&&!s.removed)byN[s.fullName]=s.i;});
      const a=byN['Thesal Theocracy'], b2=byN['Vaelic Principality'];
      const c=byN['Lazarian Lichdom'], d=byN['Thurigypt'];
      return {ThesalVaelic: a&&b2? pack.states[a].diplomacy[b2]:null,
              LazarianThurigypt: c&&d? pack.states[c].diplomacy[d]:null}; })(),
    // the trade corridors ride in two places at once — the journeys on the last
    // line of the save, and the transports inside the settings blob — so a
    // corridor can come back with its legs and lose the camels that walk them
    journeys: (pack.journeys||[]).map(j=>({name:j.name, type:j.type, legs:j.segments.length,
      transports:[...new Set(j.segments.map(g=>g.transport))],
      km: Math.round(j.segments.reduce((a2,g)=>a2+(g.distance||0),0)*distanceScale)})),
    transports: (options.transports||[]).map(t=>t.name),
    provinces: (pack.provinces||[]).filter(x=>x&&x.i).length,
    armies: pack.states.reduce((a2,s)=>a2+((s.military||[]).length),0),
    routes: (pack.routes||[]).length,
  }));
  console.log('after load  states:', after.states.length);
  console.log('  ', after.states.join(', '));
  console.log('  burgs', after.burgs, 'cells', after.cells, 'seed', after.seed);
  console.log('  diplomacy spot-check:', JSON.stringify(after.diplo));
  console.log('');
  console.log('terrain after reload:');
  console.log('  nation                     cells burg  des grs jgl tga wet mtn hil isl');
  for (const t of after.terrain)
    console.log('  ' + String(t.name).padEnd(26) + String(t.cells).padStart(5) + String(t.burgs).padStart(5) +
      ' ' + ['des','grs','jgl','tga','wet','mtn','hil'].map(k=>String(t[k]).padStart(4)).join('') +
      String(t.isl).padStart(4));
  console.log('');
  console.log(`provinces ${after.provinces}, regiments ${after.armies}, route segments ${after.routes}`);
  console.log(`trade corridors after reload: ${after.journeys.length}`);
  for (const j of after.journeys)
    console.log('  ' + j.name.padEnd(24) + String(j.legs).padStart(2) + ' legs  ' +
                String(j.km).padStart(6) + ' ' + after.unit + '  ' + j.transports.join(', '));
  const missing = ['Freight wagon','Camel caravan','River barge'].filter(t=>!after.transports.includes(t));
  if (missing.length) console.log('  MISSING TRANSPORTS: ' + missing.join(', '));
  console.log('ERRORS:', errs.length?errs.slice(0,3):'none');
  await p.screenshot({path:'loaded-saeroth.png'});
  await b.close();
})();
