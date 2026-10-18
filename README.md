# Pixi Button Grid

Logic-only minesweeper. Mark every bomb using only the clues; every level has exactly one solution that can be deduced without guessing.

## Project layout

```
index.html, vite.config.js, package.json
public/levels/<difficulty>/level<N>.json   predefined levels (fetched by the game)
shared/                 pure logic, no DOM and no Node APIs (used by the game, the web worker and the tools)
  presets.json          THE difficulty presets (1-9): size, bombs, clue types and densities, depth, ...
  presets.js            validation of presets.json
  clue-types.js         clue names/codes + clue list parser
  options.js            preset -> generator options
  generator.js          level generator          solver-core.js  logical solver
  logic-core.js         clue maths and constraint model
tools/                  command line tools (Node)
  generate-level.js     node tools/generate-level.js --help
  solver.js             node tools/solver.js public/levels/1/level1.json
src/                    the game (PixiJS)
  main.js               bootstrap and wiring (menu <-> game <-> level sources)
  config.js             visual + app config (incl. how many predefined levels each difficulty has)
  progress.js           completed predefined levels (localStorage key "completedLevels")
  game/saved-game.js    resume after a page reload: current level + marks + undo history ("savedGame") and menu position ("menuState")
  scenes/menu-scene.js  mode -> difficulty -> level screens, "generating" screen
  scenes/game-scene.js  playing a level: input, undo/redo, reset, HUD
  game/                 grid.js, cell.js, history.js, level-source.js (fetch / generate), presets.js
  ui/widgets.js         buttons, circular-arrow icons, confirmation dialog
  workers/generator.worker.js   random level generation off the main thread (APP_CONFIG.generation: parallel workers, per-seed time cap)
```

## Commands

- `npm run dev` / `npm run build` / `npm run preview`
- `npm run play` builds and serves the production version on your network: use it to test on a phone (the dev server reloads the page whenever the connection drops)
- `npm run generate -- --level 3 --count 5 --out public/levels/3` (then set the count in `APP_CONFIG.predefinedLevels` in `src/config.js`)
- `npm run solve -- public/levels/3/level1.json`

## Presets (shared/presets.json)

One file feeds the game and the CLI tools. Per difficulty: `size`, `bombs`, `cellCluesDensity`, `cellClues`, `lineCluesDensity`,
`lineClues`, `depth`, optional `chainClueMaxSize`, `areaClueMaxSize`, `redundant`, `about`.

`bombs`, `cellCluesDensity`, `lineCluesDensity` are fraction ranges `[min, max]` (a value is drawn inside the range for every
generated level); `depth` is the range of nested assumptions the level must need (0 = direct deduction only).
`cellClues` (neighbor, isolated, surrounded, chain, multiplier, area) and `lineClues` (count, longest-run, groups) use **ranged
weights** `[min, max]`: a value is drawn in each range and the values become percentages (value / sum). `"area": [0, 20]` =
sometimes none, sometimes common; a type that is missing is never used. The chain and multiplier percentages decide how many of the
clue cells are chain / multiplier cells. The `generation` block holds the deterministic work budgets.

## Seeds

Generation is deterministic: a seed always gives the same level (or none), on any device, in the game and in the CLI:
`node tools/generate-level.js --level 4 --seed 123456789` reproduces "Difficulty 4, Seed 123456789". In the game open
`/?difficulty=4&seed=123456789` to replay it. Effort limits are counted in work units, never seconds, so
changing `generation` in presets.json changes which seeds give which level.

## Controls

- Mouse: left click = bomb, right click = pressed (no bomb), drag to paint.
- Touch: every tap cycles empty -> bomb -> pressed -> empty; drag to paint.
- Undo / redo buttons (Ctrl+Z, Ctrl+Y / Ctrl+Shift+Z), Reset asks for confirmation.
