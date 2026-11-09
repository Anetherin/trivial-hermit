# Tavern-lite (trivial-hermit)

A lightweight roleplay chat for Perchance: Gemini (your own API key) writes the story, Perchance's free
text-to-image plugin draws it. The code lives here and is served by GitHub Pages; Perchance only holds a tiny shim.

## Perchance setup
1. GitHub repo **Settings → Pages**: deploy from branch `main`, folder `/ (root)`.
2. Perchance **lists panel**: paste `perchance/lists.txt`.
3. Perchance **HTML panel**: paste `perchance/panel.html` (replaces the old big file). Your saved chats carry over (same storage keys).

No Pages? `node tools/build.mjs` makes `dist/tavern-lite.html`, which you can paste into the HTML panel instead.

## Files
| Path | What |
|---|---|
| `loader.js` | loads CSS, markup, data and scripts in order |
| `markup.html`, `css/style.css` | page layout and styles |
| `data/prompts.json` | default narration style, scene-prompt rules and system prompt (edit freely) |
| `js/core.js` | helpers, defaults, save/load, migrations |
| `js/gemini.js` | Gemini calls |
| `js/prompt.js` | character lookup, colors, system prompt, tag rules |
| `js/tags.js` | reading `<npc>`/`<scene>` tags out of replies |
| `js/images.js` | image prompts and the text-to-image plugin |
| `js/chat.js` | replies, swipes, memory compaction, character generator |
| `js/render.js` | drawing the chat and dossiers |
| `js/lantern.js` | import characters from Hollowmere Nights |
| `js/main.js` | buttons and startup |

## Importing Hollowmere Nights guests
Setup → Characters → *Import from Hollowmere Nights* → **Load**. It reads `data/guests.json` from
`https://anetherin.github.io/penchant-lantern/` (or a guests.json / characters.json file you pick), lists the
ladies by pack, and turns the ones you tick into dossiers: appearance from her design, body and signature outfit,
personality from personality/traits/unique trait, history from backstory and bonds. Importing her again refreshes
the dossier (a locked one gets a suggested update instead).

## Tests
`node tools/smoke.mjs` (Playwright, Gemini and the game's data mocked).
