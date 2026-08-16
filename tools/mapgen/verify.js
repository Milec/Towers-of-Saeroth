const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs=require('fs');
(async()=>{
  const b=await chromium.launch({args:['--no-sandbox']});
  const p=await b.newPage({viewport:{width:1500,height:850}});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message.slice(0,140)));
  await p.goto('http://127.0.0.1:5199/Fantasy-Map-Generator/?seed=1&width=1200&height=700&cells=1000',
               {waitUntil:'domcontentloaded',timeout:150000});
  await p.waitForFunction(()=>window.pack&&window.pack.states&&window.pack.states.length>1,{timeout:200000});
  const before = await p.evaluate(()=>pack.states.filter(s=>s.i&&!s.removed).map(s=>s.fullName).slice(0,3));
  console.log('before load:', before.join(', '));

  // feed the .map file through the app's own uploader
  const mapPath = process.env.MAP || '/home/user/Towers-of-Saeroth/campaign/Saeroth.map';
  await p.setInputFiles('#mapToLoad', mapPath).catch(async e=>{
    console.log('  FAILED to load', mapPath, '-', e.message);
    throw e;
  });
  await p.waitForTimeout(25000);
  const after = await p.evaluate(()=>({
    states: pack.states.filter(s=>s.i&&!s.removed).map(s=>s.fullName),
    burgs: pack.burgs.filter(x=>x.i).length,
    cells: pack.cells.i.length,
    seed: window.seed,
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
  console.log('ERRORS:', errs.length?errs.slice(0,3):'none');
  await p.screenshot({path:'loaded-saeroth.png'});
  await b.close();
})();
