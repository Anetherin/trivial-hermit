# Notes for Claude

- Plain JS split into classic scripts sharing globals (no modules, no bundler). Order is `FILES` in `loader.js`;
  `tools/build.mjs` reads the same list and wraps everything in one IIFE for `dist/tavern-lite.html`. Add new files there.
- Element lookup is `byId()` (not `$`). `state` is a global lexical binding.
- Default texts live in `data/prompts.json` (arrays of lines) → `window.TH_DATA.prompts`. New data file → add to `DATA_FILES`.
- Perchance's HTML-panel pre-scanner breaks on `//` in JS: use `/* */` comments and write URLs as `'https:' + '/' + '/...'`.
- The image plugin arrives as `window.TH_PLUGINS.t2i` (set by `perchance/panel.html`).
- Storage keys `tl_state` / `tl_key` must not change (existing saves). Save shape changes go in `migrate()` (js/core.js).
- `js/lantern.js` imports from penchant-lantern's `data/guests.json` (+ optional `characters.json`, `races.json`, `body.json` for wording).
  Imported dossiers carry `source: 'lantern:<key>'`.
- Content the user wants explicit goes in their own prompt templates, not in code.
- After changes: `node tools/build.mjs && node tools/smoke.mjs`.
