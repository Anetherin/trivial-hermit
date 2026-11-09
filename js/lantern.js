/* ---------- Import characters from Hollowmere Nights (penchant-lantern) ----------
   Reads the game's data files straight from its GitHub Pages site (or from a file you pick):
     data/guests.json      visiting crossover ladies, grouped into packs
     data/characters.json  the game's own named ladies (optional)
     data/races.json, data/body.json  only used to word the appearance text
   Each picked character becomes a dossier. Imported dossiers remember their source ('lantern:<key>'),
   so importing again updates them instead of making duplicates (locked ones get a suggested update). */

let lanternData = null;      /* { chars: {key: {...c, pack, packLabel}}, races, body } */

function lanternBase() {
  let b = String(state.cfg.lanternUrl || '').trim();
  if (!b) b = defaults().cfg.lanternUrl;
  return b.endsWith('/') ? b : b + '/';
}

async function fetchJson(url) {
  const res = await fetch(url + '?v=' + Date.now());
  if (!res.ok) throw new Error(`${url.split('/').pop()}: HTTP ${res.status}`);
  return res.json();
}

const realKeys = o => Object.keys(o || {}).filter(k => k[0] !== '_');

/* Turn guests.json / characters.json content into one flat {key: character} map. */
function lanternFlatten(guests, residents) {
  const chars = {};
  if (guests && guests.packs) {
    for (const p of realKeys(guests.packs)) {
      const P = guests.packs[p];
      for (const k of realKeys(P.characters)) chars[k] = Object.assign({}, P.characters[k], { pack: p, packLabel: P.label || p });
    }
  }
  if (residents) {
    for (const k of realKeys(residents)) {
      const c = residents[k];
      if (c && c.name && !chars[k]) chars[k] = Object.assign({}, c, { pack: '_residents', packLabel: 'Hollowmere residents' });
    }
  }
  return chars;
}

async function loadLantern() {
  const base = lanternBase();
  setStatus('Loading Hollowmere Nights characters…');
  const wantResidents = !!state.cfg.lanternResidents;
  const [guests, residents, races, body] = await Promise.all([
    fetchJson(base + 'data/guests.json'),
    wantResidents ? fetchJson(base + 'data/characters.json').catch(() => null) : null,
    fetchJson(base + 'data/races.json').catch(() => null),
    fetchJson(base + 'data/body.json').catch(() => null)
  ]);
  lanternData = { chars: lanternFlatten(guests, residents), races: races && races.races, body };
  setStatus(`Loaded ${Object.keys(lanternData.chars).length} characters.`);
  renderLantern();
}

/* A guests.json or characters.json picked from disk. */
async function loadLanternFile(file) {
  const data = JSON.parse(await file.text());
  const chars = data.packs ? lanternFlatten(data, null) : lanternFlatten(null, data);
  if (!Object.keys(chars).length) throw new Error('No characters found. Pick data/guests.json or data/characters.json.');
  lanternData = Object.assign(lanternData || { races: null, body: null }, { chars: Object.assign({}, (lanternData || {}).chars, chars) });
  setStatus(`Loaded ${Object.keys(chars).length} characters from ${file.name}.`);
  renderLantern();
}

/* ----- wording ----- */
function raceLook(c) {
  const r = (lanternData.races || {})[c.race] || {};
  const sub = c.sub && r.subs && r.subs[c.sub];
  if (sub && sub.look) return sub.look;
  if (c.race === 'beastkin') return `${c.sub || 'beast'}kin woman with ${c.sub || 'animal'} ears and a ${c.sub || 'furry'} tail`;
  return r.look || `${c.race || 'human'} woman`;
}
function bodyLook(c) {
  const b = c.body || {}, defs = lanternData.body || {};
  return ['height', 'figure', 'bust'].map(k => {
    if (!b[k] || (k === 'height' && b[k] === 'average')) return '';
    const e = defs[k] && defs[k][b[k]];
    return e ? (e.img || '') : `${b[k]} ${k === 'bust' ? 'bust' : k}`;
  }).filter(Boolean).join(', ');
}
function lanternAppearance(c) {
  const d = c.design || {};
  const outfit = realKeys(c.outfits).map(k => c.outfits[k]).find(o => o && o.prompt);
  return [
    `${c.age ? c.age + '-year-old ' : 'adult '}${raceLook(c)}`,
    d.build && `${d.build} build`,
    bodyLook(c),
    (d.hairColor || d.hairStyle) && `${d.hairColor ? d.hairColor + ' hair' : 'hair'}${d.hairStyle ? ' (' + d.hairStyle + ')' : ''}`,
    d.eyes && `${d.eyes} eyes`,
    d.skin && `${d.skin} skin`,
    d.features,
    outfit && `usually wears ${outfit.prompt}`
  ].filter(Boolean).join(', ');
}
function lanternPersonality(c) {
  const bits = [c.personality];
  if (c.traits && c.traits.length) bits.push(`Traits: ${c.traits.join(', ')}`);
  if (c.style) bits.push(`Style: ${c.style}`);
  if (c.unique && c.unique.name) bits.push(`${c.unique.name}: ${c.unique.desc || ''}`.trim());
  return bits.filter(Boolean).join('. ').replace(/\.\./g, '.');
}
function lanternHistory(c) {
  const out = [c.backstory || ''];
  const bonds = realKeys(c.bonds).map(k => {
    const b = c.bonds[k], other = lanternData.chars[k];
    const who = other ? other.name : cap(k);
    return `${who}${b.kind ? ` (${b.kind})` : ''}${b.note ? ': ' + b.note : ''}`;
  });
  if (bonds.length) out.push('Knows: ' + bonds.join('; '));
  return out.filter(Boolean).join('\n');
}

/* favColor is a word like 'lavender'; let the browser turn it into hex, and skip colors too dark to read. */
function lanternColor(word) {
  const probe = document.createElement('span');
  probe.style.color = 'rgb(1, 2, 3)';
  probe.style.color = String(word || '').replace(/\s+/g, '');
  document.body.append(probe);
  const m = getComputedStyle(probe).color.match(/\d+/g);
  probe.remove();
  if (!m || m.slice(0, 3).join() === '1,2,3') return '';
  const [r, g, b] = m.map(Number);
  if (0.2126 * r + 0.7152 * g + 0.0722 * b < 90) return '';
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

function lanternToNpc(key, c) {
  const first = String(c.name || key).split(/\s+/)[0];
  return {
    name: c.name || cap(key),
    aliases: first && first !== c.name ? [first] : [],
    color: lanternColor(c.favColor),
    appearance: lanternAppearance(c),
    personality: lanternPersonality(c),
    history: lanternHistory(c),
    status: ''
  };
}

function importLantern(keys, pinned) {
  const done = [];
  for (const key of keys) {
    const c = lanternData.chars[key];
    if (!c) continue;
    const src = 'lantern:' + key, fresh = lanternToNpc(key, c);
    let n = state.npcs.find(x => x.source === src) || findNpc(fresh.name);
    if (!n) {
      n = Object.assign(blankNpc(fresh.name), fresh, { source: src, pinned: !!pinned, color: fresh.color || nextColor() });
      state.npcs.push(n);
      done.push(`${n.name} added`);
      continue;
    }
    n.source = src;
    const fields = {};
    FIELDS.forEach(f => { if (fresh[f] && fresh[f] !== n[f]) fields[f] = fresh[f]; });
    if (!Object.keys(fields).length) { done.push(`${n.name} unchanged`); continue; }
    if (n.locked) { n.pending = Object.assign(n.pending || {}, fields); done.push(`${n.name}: suggestion pending`); }
    else { Object.assign(n, fields); n.aliases = [...new Set([...(n.aliases || []), ...fresh.aliases])]; done.push(`${n.name} updated`); }
  }
  save(); renderNpcs(); render(); renderLantern();
  setStatus(done.length ? done.join(' · ') : 'Nothing picked.');
}

function renderLantern() {
  const box = byId('lanternList');
  if (!lanternData) { box.innerHTML = ''; return; }
  const filter = byId('lanternFilter').value.trim().toLowerCase();
  const have = new Set(state.npcs.map(n => n.source).filter(Boolean));
  const wasOpen = new Set([...box.querySelectorAll('details[open]')].map(d => d.dataset.pack));
  const byPack = {};
  for (const [k, c] of Object.entries(lanternData.chars)) {
    if (filter && !`${c.name} ${c.packLabel}`.toLowerCase().includes(filter)) continue;
    (byPack[c.packLabel] = byPack[c.packLabel] || []).push([k, c]);
  }
  box.innerHTML = Object.entries(byPack).map(([label, list]) => `<details data-pack="${esc(label)}"${filter || wasOpen.has(label) ? ' open' : ''}><summary>${escText(label)} (${list.length})</summary><div class="lanternPack">${
    list.map(([k, c]) => `<label class="inline"><input type="checkbox" data-lk="${esc(k)}"> ${escText(c.name)}${have.has('lantern:' + k) ? ' <small>✓</small>' : ''}</label>`).join('')
  }</div></details>`).join('') || '<div class="hint">No matches.</div>';
}
