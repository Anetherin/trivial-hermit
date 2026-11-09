/* ---------- Rendering ---------- */
function fmt(t) { return escText(t).replace(/\*([^*\n]+)\*/g, '<em>$1</em>'); }
function quoteColor(html, color) {
  const re = new RegExp(QUOTE + '[^' + QUOTE + '\\n]+' + QUOTE + '|“[^”\\n]+”', 'g');
  return html.replace(re, q => `<span style="color:${color}">${q}</span>`);
}
function renderText(m) {
  if (m.role === 'user') return quoteColor(fmt(m.text), colorFor(state.userName));
  const re = new RegExp('<say\\s+who=' + QUOTE + '([^' + QUOTE + ']*)' + QUOTE + '\\s*>([\\s\\S]*?)</say>', 'gi');
  let out = '', last = 0, mt;
  while ((mt = re.exec(m.text))) {
    out += quoteColor(fmt(m.text.slice(last, mt.index)), 'var(--dialogue)');
    out += `<span style="color:${colorFor(mt[1])}">${fmt(mt[2])}</span>`;
    last = re.lastIndex;
  }
  return out + quoteColor(fmt(m.text.slice(last)), 'var(--dialogue)');
}

function render() {
  byId('title').textContent = state.narrator.name || 'Tavern-lite';
  const log = byId('log');
  log.innerHTML = '';
  const lastIdx = state.messages.length - 1;
  state.messages.forEach((m, i) => {
    const old = i < state.summarizedUpTo;
    const who = m.role === 'user' ? state.userName : state.narrator.name;
    const d = document.createElement('div');
    d.className = `msg${old ? ' old' : ''}`;
    d.style.borderLeft = `3px solid ${colorFor(who)}`;
    let ctrls = '';
    if (m.role === 'model') {
      const n = m.swipes?.length || 1;
      if (n > 1) ctrls += `<button data-prev="${i}">‹</button><small>${(m.swipeIdx || 0) + 1}/${n}</small><button data-next="${i}">›</button>`;
      if (i === lastIdx) ctrls += `<button data-regen="${i}" title="New version">↻</button>`;
      if (m.scene) ctrls += `<button data-pic="${i}" title="Draw this moment">🎨</button>`;
    }
    let html = `<div class="who"><span style="color:${colorFor(who)}">${escText(who)}${old ? ' · in summary' : ''}</span>${ctrls}<button data-edit="${i}">✎</button><button data-del="${i}">✕</button></div><div>${renderText(m)}</div>`;
    const chips = (m.notes || []).map(x => `<span style="color:${colorFor(x.name)}">${escText(x.name)}</span> ${x.kind}`).join(' · ');
    if (chips) html += `<div class="chips">📇 ${chips}</div>`;
    d.innerHTML = html;
    log.append(d);
  });
  log.scrollTop = log.scrollHeight;
}

function renderNpcs() {
  const box = byId('npcList');
  box.innerHTML = '';
  state.npcs.forEach((n, i) => {
    const d = document.createElement('div');
    d.className = 'npc';
    d.style.borderLeftColor = n.color;
    const pending = n.pending ? `<div class="pending"><b>Suggested update</b>${Object.entries(n.pending).map(([k, v]) => `<div><i>${esc(k)}:</i> ${escText(v)}</div>`).join('')}<div class="row" style="margin-top:6px"><button data-accept class="mini">Accept</button><button data-dismiss class="mini">Dismiss</button></div></div>` : '';
    d.innerHTML = `<div class="row"><input type="color" data-f="color" value="${esc(n.color)}"><input data-f="name" value="${esc(n.name)}"><button data-rm class="mini">✕</button></div>
<div class="row" style="margin-top:6px"><label class="inline"><input type="checkbox" data-f="pinned" ${n.pinned ? 'checked' : ''}> always in prompt</label><label class="inline"><input type="checkbox" data-f="locked" ${n.locked ? 'checked' : ''}> lock</label></div>
<label>Aliases (comma-separated)</label><input data-f="aliases" value="${esc((n.aliases || []).join(', '))}">
${FIELDS.map(f => `<label>${cap(f)}</label><textarea data-f="${f}" rows="${f === 'history' ? 4 : 2}">${escText(n[f])}</textarea>`).join('')}
${pending}`;
    const onEdit = e => {
      const f = e.target.dataset.f;
      if (!f) return;
      n[f] = (f === 'locked' || f === 'pinned') ? e.target.checked
           : f === 'aliases' ? e.target.value.split(',').map(s => s.trim()).filter(Boolean)
           : e.target.value;
      if (f === 'color') d.style.borderLeftColor = n.color;
      save();
      if (f === 'color' || f === 'name') render();
    };
    d.addEventListener('input', onEdit);
    d.addEventListener('change', onEdit);
    d.querySelector('[data-rm]').onclick = () => {
      if (confirm(`Delete ${n.name}?`)) { state.npcs.splice(i, 1); save(); renderNpcs(); }
    };
    const acc = d.querySelector('[data-accept]'), dis = d.querySelector('[data-dismiss]');
    if (acc) acc.onclick = () => {
      FIELDS.forEach(f => { if (n.pending[f]) n[f] = n.pending[f]; });
      if (n.pending.aliases) n.aliases = [...new Set([...(n.aliases || []), ...n.pending.aliases.split(',').map(s => s.trim()).filter(Boolean)])];
      n.pending = null; save(); renderNpcs();
    };
    if (dis) dis.onclick = () => { n.pending = null; save(); renderNpcs(); };
    box.append(d);
  });
}

function bindFields() {
  document.querySelectorAll('[data-bind]').forEach(el => {
    const path = el.dataset.bind.split('.');
    const val = path.reduce((o, k) => o?.[k], state);
    if (el.type === 'checkbox') el.checked = !!val; else el.value = val ?? '';
    el.oninput = el.onchange = () => {
      let o = state;
      path.slice(0, -1).forEach(k => o = o[k]);
      o[path[path.length - 1]] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value;
      save(); render();
    };
  });
  byId('apiKey').value = apiKey;
  byId('imgPrompt').value = state.lastScene || '';
}

function greet() {
  if (!state.messages.length && state.narrator.greeting) {
    const text = state.narrator.greeting;
    state.messages.push({ role: 'model', text, notes: [], scene: '', swipes: [{ text, notes: [], scene: '', updates: [] }], swipeIdx: 0 });
  }
}
