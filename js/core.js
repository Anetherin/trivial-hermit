const byId = id => document.getElementById(id);
const QUOTE = String.fromCharCode(34);
const API_BASE = 'https:' + '/' + '/generativelanguage.googleapis.com/v1beta/models';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const clone = x => JSON.parse(JSON.stringify(x));
const KEY_STORE = 'tl_key', STATE_STORE = 'tl_state';
const FIELDS = ['appearance', 'personality', 'history', 'status'];
const PALETTE = ['#e07a5f', '#81b29a', '#f2cc8f', '#9fb4ff', '#d291bc', '#6ec6ca', '#c3a6ff', '#f4a259', '#a3c94f', '#ffd166', '#7fd8be', '#ff9e7d'];
const cap = s => s[0].toUpperCase() + s.slice(1);

/* Default texts live in data/prompts.json (window.TH_DATA.prompts). */
const TXT = (window.TH_DATA || {}).prompts || {};
const lines = v => Array.isArray(v) ? v.join("\n") : String(v || "");
const DEFAULT_STYLE = lines(TXT.style);
const DEFAULT_SCENE_RULES = lines(TXT.sceneRules);
const DEFAULT_TEMPLATE = lines(TXT.systemTemplate);

const defaults = () => ({
  v: 3,
  model: 'gemini-flash-latest',
  userName: 'You', userColor: '#9fd3ff', userDesc: '', userLook: '',
  narrator: { name: 'Narrator', color: '#ff8fa3', style: DEFAULT_STYLE, scenario: '', greeting: '' },
  imageStyle: 'anime illustration, detailed, soft lighting',
  systemTemplate: DEFAULT_TEMPLATE,
  messages: [], summary: '', summarizedUpTo: 0,
  npcs: [], lastScene: '',
  cfg: { keepRecent: 16, compactAt: 36, sayTags: true, npcTags: true, sceneTags: true, autoImage: false, imgRes: '768x512', imgCount: '2', sceneRules: DEFAULT_SCENE_RULES, lanternUrl: 'https:' + '/' + '/anetherin.github.io/penchant-lantern/', lanternResidents: false }
});

function validColor(c) {
  c = String(c || '').trim();
  if (/^#[0-9a-f]{3}$/i.test(c)) c = '#' + [...c.slice(1)].map(x => x + x).join('');
  return /^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : '';
}
function nextColor(s = state) {
  const used = new Set([s.narrator.color, s.userColor, ...s.npcs.map(n => n.color)].map(c => String(c || '').toLowerCase()));
  return PALETTE.find(c => !used.has(c)) || PALETTE[s.npcs.length % PALETTE.length];
}
function blankNpc(name) {
  const n = { name: name || 'New character', aliases: [], color: '', pinned: false, locked: false, pending: null };
  FIELDS.forEach(f => n[f] = '');
  return n;
}
function swipeOf(m) {
  return { text: m.text || '', notes: m.notes || [], scene: m.scene || '', updates: [] };
}

function migrate(raw) {
  raw = raw || {};
  const s = Object.assign(defaults(), raw);
  if (raw.char) { /* earlier versions had a main character with a persona */
    const c = raw.char;
    s.narrator = Object.assign(defaults().narrator, { color: c.color || '#ff8fa3', scenario: c.scenario || '', greeting: c.greeting || '' });
    if (c.imageStyle) s.imageStyle = c.imageStyle;
    s.npcs = s.npcs || [];
    if (c.name && c.name !== 'Narrator') s.npcs.unshift(Object.assign(blankNpc(c.name), { personality: c.persona || '', pinned: true }));
    delete s.char;
    if (String(s.systemTemplate).includes('You voice {{char}} and every other character')) s.systemTemplate = DEFAULT_TEMPLATE;
  }
  s.narrator = Object.assign(defaults().narrator, s.narrator);
  s.cfg = Object.assign(defaults().cfg, s.cfg);
  s.npcs = (s.npcs || []).map(n => {
    const o = Object.assign(blankNpc(n.name || 'Unnamed'), { aliases: n.aliases || [], color: validColor(n.color), pinned: !!n.pinned, locked: !!n.locked, pending: n.pending || null });
    if (n.source) o.source = n.source; /* e.g. 'lantern:hinata' for characters imported from Hollowmere Nights */
    FIELDS.forEach(f => o[f] = n[f] || '');
    if (n.notes && !o.history) o.history = n.notes;
    return o;
  });
  s.npcs.forEach(n => { if (!n.color) n.color = nextColor(s); });
  s.messages = (s.messages || []).map(m => {
    if (m.role === 'model' && !m.swipes) { m.swipes = [swipeOf(m)]; m.swipeIdx = 0; }
    return m;
  });
  s.v = 3;
  return s;
}

let state;
try { state = migrate(JSON.parse(localStorage.getItem(STATE_STORE) || '{}')); } catch (e) { state = migrate({}); }
let apiKey = '';
try { apiKey = localStorage.getItem(KEY_STORE) || ''; } catch (e) {}

function save() {
  try { localStorage.setItem(STATE_STORE, JSON.stringify(state)); }
  catch (e) { setStatus('Could not save — browser storage is blocked. Use Export.'); }
}
function setStatus(t) { byId('status').textContent = t; }
function busy(b) { ['send', 'regen', 'imgGen', 'imgRewrite', 'compactNow', 'genNpc'].forEach(id => byId(id).disabled = b); }
function escText(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function esc(s) { return escText(s).split(QUOTE).join('&quot;'); }
const ask = text => [{ role: 'user', parts: [{ text }] }];
