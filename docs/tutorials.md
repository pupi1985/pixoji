# Writing tutorials

A tutorial is an optional `"tutorial"` list inside a level's JSON file (next to `grid`, `bombs` and `clues`). While the tutorial runs,
the game shows a text box at the bottom of the screen and can lock the board, highlight cells and show examples. A level with a tutorial
shows a **?** icon in the level list.

A complete working example is in `docs/examples/tutorial-level.json` (copy it to `levels/1/` to try it).

## Finding coordinates

Coordinates are `[row, column]`, counted from 0 at the top-left cell. Print a level with its coordinates and clue values:

```
npm run show -- levels/1/01.json            # clues and coordinates
npm run show -- levels/1/01.json --bombs    # also marks the bombs with #
```

## Steps

```json
"tutorial": [
  { "say":  "Locked step: the board cannot be touched. Tap anywhere (or press Next) to continue.",
    "highlight": [ { "cell": [0, 0] }, { "around": [0, 0] } ],
    "mark": { "safe": [[0, 0], [0, 1]] } },

  { "play": "Free step: the player can mark cells.",
    "until": { "bombs": [[3, 0]] } }
]
```

Every step has exactly one of:

| key | meaning |
|---|---|
| `say` | the **board is locked**; the text stays until the player taps / clicks anywhere on the board, or presses Next |
| `play` | the **board is unlocked**; the player can mark cells while the text is shown |

and optionally `highlight`, `mark` and (play steps only) `until`.

### `until` (play steps)

| value | the step ends when |
|---|---|
| `"next"` (default) | the player presses Next |
| `"solved"` | the level is solved (this also finishes the tutorial) |
| `{ "bombs": [[r, c], ...], "safe": [[r, c], ...] }` | those cells are marked as bombs / marked safe (pressed). Next is hidden: the step continues by itself |

### `highlight`

One item or a list of items (each may also carry a `style`, see below):

| item | draws |
|---|---|
| `{ "cell": [r, c] }`, `{ "cells": [[r, c], ...] }` | a strong outline on those cells |
| `{ "around": [r, c] }` or `{ "around": [[r, c], ...] }` | a soft tint on the 3x3 block around the cell(s): what a neighbor clue counts |
| `{ "row": r }`, `{ "rows": [r, ...] }` | a soft tint on the whole row, and a ring around its left clue |
| `{ "col": c }`, `{ "cols": [c, ...] }` | the same for a column and its top clue |
| `{ "rect": [r1, c1, r2, c2] }` | a soft tint on a block of cells |

### Highlight styles (primary and secondary)

Every highlight item can add a `"style"` that picks its color. Styles are roles, not raw colors, so the whole tutorial stays consistent:

| style | color | use it for |
|---|---|---|
| `"primary"` (the default) | gold, thicker outline | the one thing being explained, e.g. the clue |
| `"secondary"` | blue | related cells: what the clue counts, helpers |
| `"bomb"` | red | cells that are (or will be) bombs |
| `"safe"` | green | cells that are safe |

```json
"highlight": [
  { "cell": [2, 0] },                                 // primary: the clue we are talking about
  { "around": [2, 0], "style": "secondary" },         // secondary: the 3x3 block it counts
  { "cells": [[3, 0], [3, 1]], "style": "bomb" }      // red: the two bombs we deduce
]
```

Items are drawn in the order you list them, and when two items touch the same cell the later one wins. A cell that has an outline
(`cell`/`cells`) is never tinted as well. The primary outline is thicker, so it stands out even without telling colors apart. The
colors themselves are in `src/config.js` (`UI_CONFIG.tutorialColors`).

### `mark`

Sets cells when the step starts, to show an example: `"bombs"` (marked as bomb), `"safe"` (pressed), `"clear"` (back to empty).
Cells linked by a chain move together. Marks are not part of the player's undo history.

## The controls

- **Back arrow** (the `◀` button, or the Left arrow key) goes back one step. The board returns to how the tutorial itself left it before
  that step: examples from later steps disappear and the player's own moves are dropped.
- **Next / Got it** (or Right arrow, Enter, Space) continues. **Skip** ends the tutorial and unlocks the board.
- The tutorial ends after its last step, when skipped, or when the level is solved. It restarts from the beginning on **Reset**.
- The game remembers the current step if the page is reloaded, and does not show a finished tutorial again for that run.
- Undo / redo are disabled while the board is locked.

## Rules checked by `npm run levels`

The build refuses a level whose tutorial is malformed and tells you where, for example
`levels/1/level3.json: tutorial step 4.highlight[0].cell: cell [5, 0] is outside the grid (rows 0-3, columns 0-3)`.
Nothing is published until every level passes. A level's **identity** (completed tick) depends only on its puzzle, so changing the
tutorial text never resets progress; the edited level reaches devices as a new file the next time they are online.

## Writing tips

- One idea per `say` step; two or three short sentences read well on a phone.
- Explain a clue by highlighting it (`cell`, primary) together with the area it counts (`around`, secondary), then use `mark` to show the consequence.
- Finish with a `play` step ending in `"until": "solved"` so the player applies what they learned.
- Tutorials work best on levels the player solves with direct deductions (difficulty with `depth` 0).
