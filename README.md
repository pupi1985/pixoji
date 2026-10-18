# Pixi Button Grid

Logic-only minesweeper. Mark every bomb using only the clues; every level has exactly one solution that can be deduced without guessing.

## Project layout

```
index.html, vite.config.js, package.json
public/levels/<difficulty>/level<N>.json   predefined levels (fetched by the game)
shared/                 pure logic, no DOM and no Node APIs (used by the game, the web worker and the tools)
  presets.json          THE difficulty presets (1-9): size, clue types, density, depth, maxAreaClue, ...
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
  scenes/menu-scene.js  mode -> difficulty -> level screens, "generating" screen
  scenes/game-scene.js  playing a level: input, undo/redo, reset, HUD
  game/                 grid.js, cell.js, history.js, level-source.js (fetch / generate), presets.js
  ui/widgets.js         buttons, circular-arrow icons, confirmation dialog
  workers/generator.worker.js   random level generation off the main thread
```

## Commands

- `npm run dev` / `npm run build` / `npm run preview`
- `npm run generate -- --level 3 --count 5 --out public/levels/3` (then set the count in `APP_CONFIG.predefinedLevels` in `src/config.js`)
- `npm run solve -- public/levels/3/level1.json`

## Controls

- Mouse: left click = bomb, right click = pressed (no bomb), drag to paint.
- Touch: every tap cycles empty -> bomb -> pressed -> empty; drag to paint.
- Undo / redo buttons (Ctrl+Z, Ctrl+Y / Ctrl+Shift+Z), Reset asks for confirmation.
