/* ---------- Chat & swipes ---------- */
function showSwipe(m, idx, isLast) {
  m.swipeIdx = Math.max(0, Math.min(idx, m.swipes.length - 1));
  const sw = m.swipes[m.swipeIdx];
  if (isLast && m.prevNpcs) { /* dossiers follow whichever version of the last reply is showing */
    state.npcs = clone(m.prevNpcs);
    sw.notes = (sw.updates || []).map(applyUpdate).filter(Boolean);
  }
  m.text = sw.text; m.notes = sw.notes; m.scene = sw.scene;
  if (isLast) setScene(sw.scene);
}

async function reply(asSwipe = false) {
  const last = state.messages[state.messages.length - 1];
  if (asSwipe && last?.role !== 'model') asSwipe = false;
  const history = asSwipe ? state.messages.slice(state.summarizedUpTo, -1) : state.messages.slice(state.summarizedUpTo);
  const saved = state.npcs;
  const base = asSwipe && last.prevNpcs ? clone(last.prevNpcs) : clone(state.npcs);
  busy(true);
  setStatus(`${state.narrator.name} is writing…`);
  try {
    state.npcs = clone(base);
    const raw = await gemini(systemPrompt(history), asContents(history));
    const { text, updates, scene } = parseReply(raw);
    const sw = { text: text || '(empty reply)', notes: [], scene, updates };
    if (asSwipe) {
      if (!last.swipes) { last.swipes = [swipeOf(last)]; last.swipeIdx = 0; }
      last.prevNpcs = base;
      last.swipes.push(sw);
      showSwipe(last, last.swipes.length - 1, true);
    } else {
      state.messages.forEach(m => delete m.prevNpcs);
      const m = { role: 'model', swipes: [sw], swipeIdx: 0, prevNpcs: base };
      state.messages.push(m);
      showSwipe(m, 0, true);
    }
    if (scene && state.cfg.autoImage) drawImages(state.lastScene);
    save(); render(); renderNpcs(); setStatus('');
    if (state.messages.length - state.summarizedUpTo > state.cfg.compactAt) {
      try { await compact(); } catch (e) { setStatus('Compaction skipped: ' + e.message); }
    }
  } catch (e) {
    state.npcs = saved;
    setStatus('⚠ ' + e.message);
  } finally {
    busy(false);
  }
}

/* ---------- Memory compaction ---------- */
async function compact(force = false) {
  const end = state.messages.length - state.cfg.keepRecent;
  if (end <= state.summarizedUpTo) { if (force) setStatus('Nothing old enough to compact yet.'); return; }
  setStatus('Compacting memory…');
  const sys = `You maintain the long-term memory of an interactive story. Rewrite the summary so it includes the new events. Keep: key plot events in order, decisions ${state.userName} made, promises, relationships and how they changed, injuries, items, locations, and unresolved threads. Drop filler. Past tense, under 450 words. Output only the summary.`;
  const input = `Current summary:\n${state.summary || '(none)'}\n\nNew events to fold in:\n${transcript(state.messages.slice(state.summarizedUpTo, end))}`;
  state.summary = await gemini(sys, ask(input), { temperature: 0.3 });
  state.summarizedUpTo = end;
  save(); render(); setStatus('Memory compacted.');
}

/* ---------- Character generator ---------- */
async function generateNpcs() {
  const count = Math.max(1, Math.min(5, Number(byId('npcCount').value) || 1));
  const idea = byId('npcIdea').value.trim();
  busy(true);
  setStatus('Creating characters…');
  try {
    const taken = state.npcs.map(n => `${n.name} ${n.color}`).join(', ') || 'none';
    const sys = `You create characters for an interactive story. Output exactly ${count} dossier tag${count > 1 ? 's' : ''} and nothing else, in this format:
${npcFormat()}
Fill every field. Appearance must be concrete and visual so an image generator can draw them. History covers their background and how they connect to the scenario. Status covers where they are now and their attitude toward ${state.userName}. Give each a color readable on a dark background. Existing characters (don't reuse these names or colors): ${taken}.`;
    const input = `Scenario:\n${state.narrator.scenario || '(none)'}\n\nStory so far:\n${state.summary || '(none)'}\n\nRecent events:\n${transcript(state.messages.slice(-6)) || '(none)'}\n\nRequest: ${idea || 'Characters who would fit naturally into the current story.'}`;
    const { updates } = parseReply(await gemini(sys, ask(input), { temperature: 1 }));
    const done = updates.map(applyUpdate).filter(Boolean);
    if (!done.length) throw new Error('No characters came back — try again.');
    byId('npcIdea').value = '';
    save(); renderNpcs(); render();
    setStatus(`Created: ${done.map(d => d.name).join(', ')}`);
  } catch (e) {
    setStatus('⚠ ' + e.message);
  } finally {
    busy(false);
  }
}
