/* ---------- Events ---------- */
byId('tplHelp').textContent = 'Macros: {{narrator}} {{user}} {{userPersona}} {{style}} {{scenario}} {{summary}} {{npcs}} {{tagRules}}. Keep {{tagRules}} somewhere, or dialogue colors, dossier updates and scene prompts stop working.';

byId('send').onclick = () => {
  const t = byId('input').value.trim();
  if (!t) return;
  state.messages.forEach(m => delete m.prevNpcs);
  state.messages.push({ role: 'user', text: t });
  byId('input').value = '';
  save(); render(); reply();
};
byId('input').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) { e.preventDefault(); byId('send').click(); }
});
byId('regen').onclick = () => reply(true);
byId('imgBtn').onclick = () => { byId('imgBar').hidden = !byId('imgBar').hidden; };
byId('imgGen').onclick = () => drawImages(byId('imgPrompt').value);
byId('imgRewrite').onclick = rewriteScenePrompt;
byId('imgPrompt').oninput = () => { state.lastScene = byId('imgPrompt').value; save(); };
byId('compactNow').onclick = async () => { busy(true); try { await compact(true); } catch (e) { setStatus('⚠ ' + e.message); } busy(false); };
byId('genNpc').onclick = generateNpcs;
byId('resetScene').onclick = () => { state.cfg.sceneRules = DEFAULT_SCENE_RULES; save(); bindFields(); };
window.addEventListener('unhandledrejection', e => {
  const why = e.reason?.message || String(e.reason || 'unknown error');
  setStatus('⚠ Background error: ' + why + (/load failed|network/i.test(why) ? ' (a network request was cut off; if it happened while images were loading, try 1 image per generate)' : ''));
  e.preventDefault();
});

byId('log').onclick = e => {
  const ds = e.target.dataset;
  const lastIdx = state.messages.length - 1;
  if (ds.prev !== undefined || ds.next !== undefined) {
    const i = Number(ds.prev ?? ds.next), m = state.messages[i];
    showSwipe(m, (m.swipeIdx || 0) + (ds.prev !== undefined ? -1 : 1), i === lastIdx);
    save(); render(); renderNpcs();
  }
  if (ds.regen !== undefined) reply(true);
  if (ds.pic !== undefined) {
    setScene(state.messages[Number(ds.pic)].scene);
    byId('imgBar').hidden = false;
    save(); drawImages(state.lastScene);
  }
  if (ds.edit !== undefined) {
    const i = Number(ds.edit), m = state.messages[i], t = prompt('Edit message', m.text);
    if (t !== null) {
      m.text = t;
      if (m.swipes) m.swipes[m.swipeIdx || 0].text = t;
      save(); render();
    }
  }
  if (ds.del !== undefined && confirm('Delete this message (all its versions)?')) {
    const i = Number(ds.del);
    state.messages.splice(i, 1);
    if (i < state.summarizedUpTo) state.summarizedUpTo--;
    save(); render();
  }
};

byId('openSettings').onclick = () => { bindFields(); renderNpcs(); byId('sysPreview').textContent = ''; byId('drawer').classList.add('open'); };
byId('closeSettings').onclick = () => { byId('drawer').classList.remove('open'); if (!state.messages.length) { greet(); save(); } render(); };
byId('apiKey').oninput = () => { apiKey = byId('apiKey').value.trim(); try { localStorage.setItem(KEY_STORE, apiKey); } catch (e) {} };
byId('previewSys').onclick = () => { byId('sysPreview').textContent = systemPrompt(); };
byId('resetSys').onclick = () => {
  if (!confirm('Replace your system prompt with the default?')) return;
  state.systemTemplate = DEFAULT_TEMPLATE; save(); bindFields();
};

byId('listModels').onclick = async () => {
  try {
    const res = await fetch(API_BASE + '?pageSize=200', { headers: { 'x-goog-api-key': apiKey } });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || res.status);
    const names = data.models.filter(m => (m.supportedGenerationMethods || []).includes('generateContent')).map(m => m.name.replace('models/', ''));
    byId('modelList').innerHTML = names.map(n => `<button data-model="${esc(n)}">${escText(n)}</button>`).join('');
  } catch (e) { byId('modelList').textContent = '⚠ ' + e.message; }
};
byId('modelList').onclick = e => {
  const m = e.target.dataset.model;
  if (m) { state.model = m; byId('modelField').value = m; save(); }
};

byId('addNpc').onclick = () => {
  const n = Object.assign(blankNpc(), { color: nextColor(), locked: true });
  state.npcs.push(n); save(); renderNpcs();
};

byId('exportBtn').onclick = () => {
  const out = clone(state);
  out.messages.forEach(m => delete m.prevNpcs);
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${state.narrator.name || 'story'}.json`;
  a.click();
};
byId('importFile').onchange = async e => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    state = migrate(JSON.parse(await f.text()));
    save(); bindFields(); renderNpcs(); render(); setStatus('Imported.');
  } catch (err) { setStatus('⚠ Import failed: ' + err.message); }
};
byId('newChat').onclick = () => {
  if (!confirm('Start a new chat? Messages, summary and unpinned characters are cleared; setup, system prompt and pinned characters are kept.')) return;
  Object.assign(state, { messages: [], summary: '', summarizedUpTo: 0, npcs: state.npcs.filter(n => n.pinned), lastScene: '' });
  byId('scene').innerHTML = ''; byId('sceneWrap').hidden = true;
  greet(); save(); bindFields(); renderNpcs(); render();
};

/* ---------- Hollowmere Nights import ---------- */
byId('lanternLoad').onclick = async () => {
  try { await loadLantern(); byId('lanternPick').hidden = false; }
  catch (e) { setStatus('⚠ Could not load from ' + lanternBase() + ' (' + e.message + '). Check the address, or pick the file instead.'); }
};
byId('lanternFile').onchange = async e => {
  const f = e.target.files[0];
  if (!f) return;
  try { await loadLanternFile(f); byId('lanternPick').hidden = false; }
  catch (err) { setStatus('⚠ ' + err.message); }
  e.target.value = '';
};
byId('lanternFilter').oninput = renderLantern;
byId('lanternImport').onclick = () => {
  const keys = [...document.querySelectorAll('#lanternList [data-lk]:checked')].map(x => x.dataset.lk);
  importLantern(keys, byId('lanternPin').checked);
};

/* ---------- Start ---------- */
greet(); save(); bindFields(); renderNpcs(); render();
if (!apiKey) byId('openSettings').click();
