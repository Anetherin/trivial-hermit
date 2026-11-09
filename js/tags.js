/* ---------- Reading tags out of replies ---------- */
function attr(attrs, name) {
  const m = attrs.match(new RegExp(name + '\\s*=\\s*' + QUOTE + '([^' + QUOTE + ']*)' + QUOTE, 'i'));
  return m ? m[1].trim() : '';
}
function parseReply(raw) {
  const updates = [];
  let scene = '';
  let text = raw.replace(/<npc\b([^>]*)>([\s\S]*?)<\/npc>/gi, (_, attrs, body) => {
    const u = { name: attr(attrs, 'name'), aliases: attr(attrs, 'aliases'), color: attr(attrs, 'color'), fields: {} };
    let cur = null;
    for (const line of body.split('\n')) {
      const m = line.match(/^\s*(appearance|personality|history|status)\s*:\s*(.*)$/i);
      if (m) { cur = m[1].toLowerCase(); u.fields[cur] = m[2].trim(); }
      else if (cur && line.trim()) u.fields[cur] += ' ' + line.trim();
    }
    updates.push(u);
    return '';
  });
  text = text.replace(/<scene>([\s\S]*?)<\/scene>/gi, (_, s) => { scene = s.trim(); return ''; });
  text = text.replace(/<\/?(npc|scene)\b[^>]*>/gi, '').trim();
  return { text, updates, scene };
}

function applyUpdate(u) {
  if (!u.name) return null;
  const k = u.name.toLowerCase();
  if (k === state.userName.toLowerCase() || k === state.narrator.name.toLowerCase()) return null;
  const aliases = u.aliases ? u.aliases.split(',').map(s => s.trim()).filter(Boolean) : [];
  let n = findNpc(u.name);
  if (!n) {
    n = Object.assign(blankNpc(u.name), { aliases });
    FIELDS.forEach(f => n[f] = u.fields[f] || '');
    n.color = validColor(u.color) || nextColor();
    state.npcs.push(n);
    return { name: n.name, kind: 'added' };
  }
  if (n.locked) {
    n.pending = Object.assign(n.pending || {}, u.fields);
    if (aliases.length) n.pending.aliases = aliases.join(', ');
    return { name: n.name, kind: 'suggestion pending' };
  }
  FIELDS.forEach(f => { if (u.fields[f]) n[f] = u.fields[f]; });
  n.aliases = [...new Set([...(n.aliases || []), ...aliases])];
  return { name: n.name, kind: 'updated' };
}

/* ---------- Image prompts: fill each named character's looks in ---------- */
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function expandScene(scene) {
  let out = String(scene || '');
  const people = [{ names: [state.userName], look: state.userLook }, ...state.npcs.map(n => ({ names: [n.name, ...(n.aliases || [])], look: n.appearance }))];
  for (const p of people) {
    const look = String(p.look || '').trim().replace(/\s+/g, ' ').slice(0, 300);
    if (!look) continue;
    for (const nm of p.names.filter(Boolean)) {
      const re = new RegExp('\\b' + escapeRe(nm) + '\\b', 'i');
      if (re.test(out)) { out = out.replace(re, m => `${m} (${look})`); break; }
    }
  }
  return out;
}
function setScene(scene) {
  if (!scene) return;
  state.lastScene = expandScene(scene);
  byId('imgPrompt').value = state.lastScene;
}
