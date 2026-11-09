/* ---------- Images ---------- */
function drawImages(p) {
  p = String(p || '').trim();
  if (!p) { setStatus('No image prompt yet — send a message or write one.'); return; }
  const style = state.imageStyle.trim();
  const prompt = style ? `${p}, ${style}` : p;
  const count = Math.max(1, Math.min(4, Number(state.cfg.imgCount) || 2));
  const t2i = (window.TH_PLUGINS || {}).t2i || window.t2i;
  if (typeof t2i !== 'function') { setStatus('Image generation only works inside Perchance (needs the text-to-image plugin).'); return; }
  try {
    let html = '';
    for (let i = 0; i < count; i++) html += `<div class="shot">${t2i({ prompt, resolution: state.cfg.imgRes || '768x512' })}</div>`;
    byId('scene').innerHTML = html;
    byId('sceneWrap').hidden = false;
    byId('sceneWrap').open = true;
  } catch (e) { setStatus('⚠ Image plugin error: ' + e.message); }
}

async function rewriteScenePrompt() {
  busy(true);
  try {
    setStatus('Writing image prompt…');
    const present = activeNpcs().map(n => n.name).concat(state.userName).join(', ');
    const sys = `Turn the latest moment of a story into one image prompt. Characters who may be in frame: ${present}.\n${state.cfg.sceneRules || DEFAULT_SCENE_RULES}\nOutput only the prompt.`;
    const latest = state.messages.slice(-4).map(m => stripSay(m.text)).join('\n\n');
    setScene(await gemini(sys, ask(`Latest moment:\n${latest}`), { temperature: 0.5 }));
    save(); setStatus('Prompt ready — edit it or hit Generate.');
  } catch (e) {
    setStatus('⚠ ' + e.message);
  } finally {
    busy(false);
  }
}
