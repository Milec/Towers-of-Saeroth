/* Bounded suggestions avoid opening a huge native datalist on mobile. */
function installJourneyInputs(places) {
  const form = document.getElementById('journeyForm');
  const fields = ['journeyFrom', 'journeyTo', 'journeyVia'];
  const draftKey = 'saeroth-journey-draft';
  const save = () => {
    try { sessionStorage.setItem(draftKey, JSON.stringify(Object.fromEntries(fields.map(id => [id, document.getElementById(id).value])))); } catch (_) {}
  };
  try {
    const draft = JSON.parse(sessionStorage.getItem(draftKey) || '{}');
    for (const id of fields) if (typeof draft[id] === 'string') document.getElementById(id).value = draft[id];
  } catch (_) {}
  form.addEventListener('input', save);
  form.addEventListener('change', save);
  // Also preserve values set by Start here, Travel here, and Swap buttons.
  addEventListener('pagehide', save);
  for (const id of fields) {
    const input = document.getElementById(id);
    const wrapper = document.createElement('div'); wrapper.className = 'journey-picker';
    input.before(wrapper); wrapper.append(input);
    const list = document.createElement('div'); list.id = id + '-suggestions';
    list.className = 'journey-suggestions'; list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', 'Matching locations'); list.hidden = true; wrapper.append(list);
    for (const [key, value] of Object.entries({role:'combobox', 'aria-autocomplete':'list', 'aria-controls':list.id, 'aria-expanded':'false', autocomplete:'off', autocapitalize:'none', spellcheck:'false'})) input.setAttribute(key, value);
    let matches = [], active = -1;
    const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1; };
    const choose = index => {
      if (!matches[index]) return;
      input.value = matches[index].label; close(); save();
      input.dispatchEvent(new Event('change', {bubbles:true}));
    };
    const render = () => {
      const query = input.value.trim().toLocaleLowerCase(); active = -1;
      input.removeAttribute('aria-activedescendant');
      matches = query ? places.filter(p => p.label.toLocaleLowerCase().includes(query)).slice(0, 8) : [];
      list.replaceChildren();
      matches.forEach((place, index) => {
        const option = document.createElement('button'); option.type = 'button'; option.tabIndex = -1;
        option.id = list.id + '-' + index; option.setAttribute('role', 'option'); option.setAttribute('aria-selected', 'false');
        option.textContent = place.label;
        option.addEventListener('pointerdown', e => e.preventDefault());
        option.addEventListener('click', () => choose(index)); list.append(option);
      });
      list.hidden = !matches.length; input.setAttribute('aria-expanded', String(!!matches.length));
    };
    input.addEventListener('input', render); input.addEventListener('focus', render);
    input.addEventListener('blur', close);
    input.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key === 'Enter' && !list.hidden && active >= 0) { e.preventDefault(); choose(active); return; }
      if (!['ArrowDown', 'ArrowUp'].includes(e.key)) return;
      if (list.hidden) render(); if (!matches.length) return;
      e.preventDefault(); active = (active + (e.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length;
      [...list.children].forEach((option, i) => option.setAttribute('aria-selected', String(i === active)));
      input.setAttribute('aria-activedescendant', list.children[active].id);
      list.children[active].scrollIntoView({block:'nearest'});
    });
  }
}
