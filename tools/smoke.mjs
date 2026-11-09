/* Headless smoke test for Tavern-lite. Usage: node tools/smoke.mjs  (needs global Playwright + Chromium) */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const LANTERN = '/home/claude/anetherin/penchant-lantern/data';
const require = createRequire('/opt/npm-tools/node_modules/');
const { chromium } = require('playwright');

const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`); };
const guard = async (name, fn) => { try { await fn(); } catch (e) { check(name, false, 'exception: ' + String(e.message).split('\n')[0]); } };

const REPLY = 'The tavern hums.\n<say who="Mara">"Hello."</say>\n<npc name="Mara" color="#88ccff">appearance: tall\npersonality: wry</npc>\n<scene>Mara at the bar</scene>';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/__dist.html') {
    const frag = fs.readFileSync(path.join(root, 'dist/tavern-lite.html'), 'utf8');
    res.setHeader('content-type', 'text/html');
    return res.end(`<!DOCTYPE html><html><head><meta charset=utf-8></head><body>${frag}</body></html>`);
  }
  const f = path.join(root, u === '/' ? 'index.html' : u);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end('nf'); }
  res.setHeader('content-type', MIME[path.extname(f)] || 'application/octet-stream');
  res.end(fs.readFileSync(f));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
await ctx.addInitScript(() => { try { if (!localStorage.getItem('tl_key')) localStorage.setItem('tl_key', 'fake'); } catch (e) {} });
await ctx.route('https://generativelanguage.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ candidates: [{ content: { parts: [{ text: REPLY }] } }] }) }));
await ctx.route(/^https:\/\/anetherin\.github\.io\/penchant-lantern\/data\/([\w-]+)\.json/, r => {
  const name = r.request().url().match(/data\/([\w-]+)\.json/)[1];
  const f = path.join(LANTERN, name + '.json');
  if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: 'nf' });
  r.fulfill({ status: 200, contentType: 'application/json', body: fs.readFileSync(f) });
});

const errors = [];
const watch = (page, tag) => {
  page.on('pageerror', e => errors.push(`[${tag}] pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`[${tag}] console.error: ${m.text()}`); });
  page.on('dialog', d => d.accept());
};

const page = await ctx.newPage();
watch(page, 'dev');
const st = () => page.evaluate(() => state);

await guard('1 load', async () => {
  await page.goto(base + '/index.html');
  await page.waitForSelector('#app', { timeout: 10000 });
  const has = await page.evaluate(() => ({ app: !!document.getElementById('app'), drawer: !!document.getElementById('drawer'), npc: !!document.getElementById('npcList'), prompts: !!(window.TH_DATA && window.TH_DATA.prompts), tpl: (document.querySelector('[data-bind="systemTemplate"]') || {}).value || '' }));
  check('1 index.html loads, #app/#drawer/#npcList/TH_DATA.prompts present', has.app && has.drawer && has.npc && has.prompts, JSON.stringify({ ...has, tpl: undefined }));
  check('1 system prompt textarea non-empty and has {{tagRules}}', has.tpl.length > 0 && has.tpl.includes('{{tagRules}}'), `len=${has.tpl.length}`);
});

await guard('2 chat', async () => {
  await page.fill('#input', 'Hi there');
  await page.click('#send');
  await page.waitForSelector('.msg:has-text("Hello.")', { timeout: 10000 });
  const log = await page.locator('#log').innerText();
  const leaked = /appearance: tall|wry|Mara at the bar|<npc|<scene/.test(log);
  const s = await st();
  const mara = s.npcs.find(n => n.name === 'Mara');
  check('2 reply shown with "Hello."', true);
  check('2 npc/scene tag text hidden from log', !leaked, leaked ? log : '');
  check('2 state.npcs has Mara (tall / wry)', !!mara && mara.appearance === 'tall' && mara.personality === 'wry', JSON.stringify(mara));
});

let hinata;
await guard('3 import', async () => {
  await page.click('#openSettings');
  await page.click('#lanternLoad');
  await page.waitForSelector('#lanternPick', { state: 'visible', timeout: 10000 });
  await page.waitForSelector('[data-lk]', { state: 'attached', timeout: 10000 });
  const keys = await page.$$eval('[data-lk]', els => els.map(e => e.dataset.lk));
  const packs = await page.$$eval('#lanternList details', d => d.length);
  check('3 many guests listed from several packs', keys.length > 20 && packs >= 5, `${keys.length} chars, ${packs} packs`);
  await page.evaluate(() => document.querySelectorAll('#lanternList details').forEach(d => d.open = true));
  await page.check('[data-lk="hinata"]');
  await page.check('[data-lk="sakura"]');
  await page.click('#lanternImport');
  const s = await st();
  hinata = s.npcs.find(n => n.source === 'lantern:hinata');
  check('3 sakura imported too', s.npcs.some(n => n.source === 'lantern:sakura'));
  check('3 hinata imported with source', !!hinata);
  if (hinata) {
    check('3 name Hinata Hyuga, alias Hinata', hinata.name === 'Hinata Hyuga' && hinata.aliases.includes('Hinata'), JSON.stringify(hinata.aliases));
    check('3 appearance mentions indigo + lavender kimono', /indigo/i.test(hinata.appearance) && /lavender.*kimono/i.test(hinata.appearance), hinata.appearance);
    check('3 personality contains Shy', /Shy/.test(hinata.personality));
    check('3 history has backstory + Knows: line', /Heir to a proud clan/.test(hinata.history) && /^Knows: /m.test(hinata.history));
    check('3 color is #rrggbb', /^#[0-9a-f]{6}$/i.test(hinata.color), hinata.color);
    console.log('\n--- Hinata dossier ---');
    for (const k of ['name', 'aliases', 'color', 'source', 'pinned', 'locked', 'appearance', 'personality', 'history', 'status']) console.log(`${k}: ${Array.isArray(hinata[k]) ? hinata[k].join(', ') : hinata[k]}`);
    console.log('--- end ---\n');
  }
});

await guard('4 reimport', async () => {
  const before = (await st()).npcs.length;
  await page.evaluate(() => document.querySelectorAll('#lanternList details').forEach(d => d.open = true)); /* list re-renders collapsed after import */
  await page.check('[data-lk="hinata"]');
  await page.click('#lanternImport');
  const mid = await st();
  check('4 re-import: no duplicate', mid.npcs.length === before, `${before} -> ${mid.npcs.length}`);
  check('4 only one hinata', mid.npcs.filter(n => n.name === 'Hinata Hyuga').length === 1);
  await page.evaluate(() => { const n = state.npcs.find(x => x.source === 'lantern:hinata'); n.locked = true; n.appearance = 'CHANGED BY USER'; save(); });
  await page.evaluate(() => document.querySelectorAll('#lanternList details').forEach(d => d.open = true));
  await page.check('[data-lk="hinata"]');
  await page.click('#lanternImport');
  const n = (await st()).npcs.find(x => x.source === 'lantern:hinata');
  check('4 locked: appearance unchanged, pending.appearance set', n.appearance === 'CHANGED BY USER' && !!(n.pending && n.pending.appearance) && /indigo/i.test(n.pending.appearance), JSON.stringify(n.pending && Object.keys(n.pending)));
});

await guard('5 filter', async () => {
  await page.fill('#lanternFilter', 'zelda');
  const d = await page.$$eval('#lanternList details', ds => ds.map(x => x.querySelector('summary').textContent));
  check('5 filter zelda -> one pack', d.length === 1 && /zelda/i.test(d[0]), JSON.stringify(d));
  await page.fill('#lanternFilter', '');
});

await guard('6 residents', async () => {
  await page.check('[data-bind="cfg.lanternResidents"]');
  await page.click('#lanternLoad');
  await page.waitForFunction(() => /Hollowmere residents/.test(document.getElementById('lanternList').textContent), null, { timeout: 10000 });
  check('6 "Hollowmere residents" group appears', true);
});

await guard('7 persistence', async () => {
  await page.reload();
  await page.waitForSelector('#app');
  await page.waitForFunction(() => typeof state !== 'undefined');
  const s = await st();
  const h = s.npcs.find(n => n.source === 'lantern:hinata');
  check('7 npcs persist after reload (incl. Mara, sakura)', s.npcs.some(n => n.name === 'Mara') && s.npcs.some(n => n.source === 'lantern:sakura'), s.npcs.map(n => n.name).join(', '));
  check('7 source field survives; hinata data intact', !!h && h.name === 'Hinata Hyuga' && h.locked === true);
});

await guard('9 image', async () => {
  const before = errors.length;
  // a message with a scene so the 🎨 button exists
  await page.fill('#input', 'again');
  await page.click('#send');
  await page.waitForSelector('[data-pic]', { timeout: 10000 });
  await page.click('[data-pic]');
  const s1 = await page.locator('#status').innerText();
  await page.evaluate(() => { document.getElementById('imgPrompt').value = 'a tavern'; document.getElementById('imgGen').click(); });
  const s2 = await page.locator('#status').innerText();
  check('9 image buttons: status mentions Perchance, no exception', /Perchance/i.test(s1) && /Perchance/i.test(s2) && errors.length === before, `"${s1}" / "${s2}"`);
});

await guard('8 dist', async () => {
  execFileSync('node', [path.join(root, 'tools/build.mjs')], { stdio: 'pipe' });
  const html = fs.readFileSync(path.join(root, 'dist/tavern-lite.html'), 'utf8');
  const bad = [];
  for (const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    m[1].split('\n').forEach((ln, i) => { if (ln.replace(/'\/' \+ '\//g, '').includes('//')) bad.push(`script line ${i + 1}: ${ln.trim().slice(0, 140)}`); });
  }
  check('8 dist <script> has no `//` outside the \'/\' + \'/ pattern', bad.length === 0, bad.length ? '\n    ' + bad.join('\n    ') : '');
  const p2 = await ctx.newPage();
  watch(p2, 'dist');
  const n0 = errors.length;
  await p2.goto(base + '/__dist.html');
  await p2.waitForSelector('#app', { timeout: 10000 });
  await p2.fill('#input', 'Hi dist');
  await p2.click('#send');
  await p2.waitForSelector('.msg:has-text("Hello.")', { timeout: 10000 });
  const log = await p2.locator('#log').innerText();
  check('8 dist: loads, chat works, tags hidden, no errors', !/Mara at the bar|appearance: tall/.test(log) && errors.length === n0);
});

if (errors.length) errors.forEach(e => console.log('  ' + e));
check('page/console errors collected', errors.length === 0, `${errors.length} error(s)`);

await browser.close();
server.close();
const failed = results.filter(r => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
