/* Modeled district seats: transfer residents from rural estimates, preserving totals. */
(() => {
  for (const b of window.ATLAS_ADDITIONS.burgs) {
    if (window.ATLAS.burgs.some(old => old.i === b.i)) throw new Error('Duplicate district seat');
    window.ATLAS.burgs.push(b);
    const province = window.ATLAS.provinces.find(p => p?.i === b.province);
    const state = window.ATLAS.states.find(s => s?.i === b.state);
    province.burgs.push(b.i);
    state.burgs += 1;
    for (const territory of [province, state]) {
      territory.rural -= b.population;
      territory.urban += b.population;
    }
  }
})();
