/* ---------- Character lookup & colors ---------- */
function findNpc(name) {
  const k = String(name || '').trim().toLowerCase();
  return state.npcs.find(n => n.name.toLowerCase() === k || (n.aliases || []).some(a => a.toLowerCase() === k));
}
function colorFor(who) {
  const k = String(who || '').trim().toLowerCase();
  if (k === state.userName.toLowerCase()) return validColor(state.userColor) || '#9fd3ff';
  if (k === state.narrator.name.toLowerCase()) return validColor(state.narrator.color) || '#ff8fa3';
  return validColor(findNpc(who)?.color) || 'var(--dialogue)';
}
function activeNpcs(msgs = state.messages) {
  const recent = msgs.slice(-8).map(m => m.text).join('\n').toLowerCase();
  return state.npcs.filter(n => n.pinned || [n.name, ...(n.aliases || [])].some(a => a && recent.includes(a.toLowerCase())));
}

/* ---------- System prompt ---------- */
function npcBlock(n) {
  const aka = n.aliases?.length ? ` (also: ${n.aliases.join(', ')})` : '';
  return `### ${n.name}${aka}\n` + FIELDS.filter(f => n[f]).map(f => `${cap(f)}: ${n[f]}`).join('\n');
}
function npcFormat() {
  const u = state.userName;
  return `<npc name="Name" aliases="comma, separated" color="#rrggbb">
appearance: concrete visual details an artist could draw: build, face, hair, eyes, clothing, distinguishing marks
personality: temperament, speech style, motives
history: background and what has happened with ${u} so far
status: where they are, condition, current attitude toward ${u}
</npc>`;
}

function tagRules() {
  const c = state.cfg, u = state.userName, rules = [];
  if (c.sayTags) {
    const roster = state.npcs.map(n => `${n.name} ${n.color}`).join(', ') || 'none yet';
    rules.push(`Wrap every line of spoken dialogue in a speaker tag: <say who="Name">"Line."</say>. Use the character's exact name (known: ${roster}). Never write dialogue for ${u}.`);
  }
  if (c.npcTags) rules.push(`After the prose, whenever a character first appears or something about them meaningfully changes, add one dossier tag per character:
${npcFormat()}
Include only the fields that are new or changed, each written in full (it replaces the old text). Never make tags for ${u}. For a new character, choose a color readable on a dark background and distinct from the known ones; never change an existing character's color.`);
  if (c.sceneTags) rules.push(`End every reply with <scene>an image prompt showing the final moment of your reply</scene>. Rules for the scene prompt:\n${c.sceneRules || DEFAULT_SCENE_RULES}`);
  if (!rules.length) return '';
  return '## Output tags (required)\n' + rules.map((r, i) => `${i + 1}. ${r}`).join('\n');
}

function systemPrompt(msgs = state.messages) {
  const npcs = activeNpcs(msgs);
  const persona = [state.userDesc, state.userLook && `Appearance: ${state.userLook}`].filter(Boolean).join('\n');
  const macros = {
    narrator: state.narrator.name,
    user: state.userName,
    userPersona: persona || '(not specified)',
    style: state.narrator.style || DEFAULT_STYLE,
    scenario: state.narrator.scenario || '(not specified)',
    summary: state.summary || '(nothing yet — the story is just starting)',
    npcs: npcs.length ? npcs.map(npcBlock).join('\n\n') : '(none in the current scene)',
    tagRules: tagRules()
  };
  macros.char = macros.narrator;
  macros.persona = macros.style;
  return state.systemTemplate.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in macros ? macros[k] : m));
}
