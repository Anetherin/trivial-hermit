/* Builds one self-contained file (dist/tavern-lite.html) from the split sources: the old single-file shape.
   Usage: node tools/build.mjs
   Fallback for Perchance: paste the result straight into the HTML panel (no GitHub Pages needed). */
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const loader = read('loader.js');
const files = [...loader.matchAll(/^\s*'(js\/[^']+\.js)',?$/gm)].map(m => m[1]);
const dataNames = [...loader.match(/var DATA_FILES = \[([^\]]*)\]/)[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
const data = Object.fromEntries(dataNames.map(n => [n, JSON.parse(read(`data/${n}.json`))]));
/* The whole app runs inside one IIFE, as the original single file did. */
const js = files.map(f => `/* ---- ${f} ---- */\n` + read(f)).join('\n');
const html = `<style>
${read('css/style.css')}</style>

${read('markup.html')}
<script>
window.TH_DATA = ${JSON.stringify(data)};
window.TH_PLUGINS = { t2i: (typeof t2i !== 'undefined') ? t2i : null };
(() => {
${js}
})();
</script>
`;
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/tavern-lite.html'), html);
console.log(`dist/tavern-lite.html: ${files.length} scripts, ${(html.length / 1024).toFixed(1)} KB`);
