/* ---------- Gemini ---------- */
async function gemini(system, contents, { temperature = 0.9 } = {}) {
  if (!apiKey) throw new Error('Add your Gemini API key in Setup.');
  let model = state.model.trim();
  if (model.startsWith('models/')) model = model.slice(7);
  const url = API_BASE + '/' + model + ':generateContent';
  const body = { systemInstruction: { parts: [{ text: system }] }, contents, generationConfig: { temperature } };
  for (let attempt = 0; attempt < 4; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(body)
      });
    } catch (netErr) {
      if (attempt < 1) { setStatus('Connection dropped — retrying…'); await sleep(1500); continue; }
      throw new Error(`Couldn't reach Gemini (${netErr.message}). Usually the connection dropped or the app went to the background mid-request; a content blocker or a website restriction on your API key can also cause it.`);
    }
    if (res.status === 429 || res.status === 503) {
      const wait = 2000 * 2 ** attempt;
      setStatus(`Rate limited — retrying in ${wait / 1000}s…`);
      await sleep(wait);
      continue;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`);
    const cand = data.candidates?.[0];
    const text = (cand?.content?.parts || []).filter(p => !p.thought).map(p => p.text || '').join('').trim();
    if (!text) throw new Error(`Empty reply (${data.promptFeedback?.blockReason || cand?.finishReason || 'no text'})`);
    return text;
  }
  throw new Error('Still rate limited — wait a minute and try again.');
}

function asContents(msgs) {
  const out = [];
  for (const m of msgs) {
    const role = m.role === 'user' ? 'user' : 'model';
    const last = out[out.length - 1];
    if (last && last.role === role) last.parts[0].text += '\n\n' + m.text;
    else out.push({ role, parts: [{ text: m.text }] });
  }
  if (!out.length || out[0].role !== 'user') out.unshift({ role: 'user', parts: [{ text: '(The scene begins.)' }] });
  return out;
}
const stripSay = t => t.replace(/<\/?say\b[^>]*>/gi, '');
function transcript(msgs) {
  return msgs.map(m => `${m.role === 'user' ? state.userName : 'Story'}: ${stripSay(m.text)}`).join('\n\n');
}
