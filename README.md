# Pixoji

Logic-only minesweeper: every level has exactly one solution that can be found without guessing.
It is a static web app (no server code) that installs as a PWA and runs offline.

## Project layout

```
index.html, vite.config.js, package.json
levels/<difficulty>/*.json     YOUR levels (never modified by any tool); 00-tutorial.json in difficulties 1-9 teach each clue   docs/tutorials.md   how to write tutorials
public/levels/                 GENERATED from levels/ by `npm run levels` (git-ignored): <id>-<v>.json files + index.json
public/manifest.webmanifest, icons/   app name and icons (what "install" uses)
.github/workflows/deploy.yml   builds and publishes to GitHub Pages on every push to main
pwa/sw.template.js             the service worker (the build turns it into dist/sw.js)
shared/                        pure logic used by the game, the web worker and the tools
  presets.json                 difficulty presets (clue weights, bombs, depth ...)   generator.js, solver-core.js, ...
  level-index.js               format of the generated index.json      tutorial.js   format + validation of level tutorials
  fulfilled.js                 which clues the player's marks have settled (they are greyed out)
tools/                         command line tools (Node)
  generate-level.js            create levels                  build-levels.js     publish levels/ -> public/levels/
  level-complexity.js          complexity of every level      solver.js           explain / solve a level (+ complexity)
  show-level.js                level with coordinates         presets-file.js     check presets.json (syntax, duplicate keys, rules)
  pwa-plugin.js, presets-plugin.js   build steps (dist/sw.js; stop the build on a bad presets.json)
src/                           the game (PixiJS)
  game/catalog.js              level list + levels saved on the device     pwa/register.js   service worker + update flow
  game/tutorial*.js, ui/tutorial-panel.js   tutorials                      game/saved-game.js   resume after a reload
  progress.js                  completed levels (by level id)              scenes/, ui/, workers/   menu, game, widgets, random levels
```

## 1. Publish on GitHub Pages (once)

1. Create a GitHub repository and push this project to the `main` branch (include your `levels/` folder). Commit `package-lock.json` too (run `npm install` once to create it).
2. In the repository: **Settings -> Pages -> Build and deployment -> Source: GitHub Actions**.
3. The *Deploy to GitHub Pages* workflow runs on every push to `main`. When it finishes, the game is at `https://<user>.github.io/<repository>/`.

Nothing else is needed: no server, no database. Everything the game needs is static files.

## 2. Install it on your devices

Open the address **once, with internet**, and wait until the menu footer says `level list up to date` (the app has then saved itself).

| Device | How to install |
|---|---|
| Android (Chrome) | menu **⋮ -> Install app** (or *Add to Home screen*) |
| iPhone / iPad (Safari) | **Share -> Add to Home Screen** (must be Safari) |
| Windows / Mac / Linux (Chrome, Edge) | the install icon in the address bar, or menu -> *Install* |

You can also just use it in the browser; installing only adds an icon and a full-screen window.

## 3. Working offline

After that first visit nothing needs a connection:

| | Offline |
|---|---|
| The app itself | works (the browser keeps all app files) |
| Random levels | work (generated on your device) |
| Predefined levels **already downloaded** | work |
| Predefined levels not downloaded yet | need a connection once; the game says so |
| Your progress, ticks, saved game | stored on the device |

A predefined level is downloaded the first time you open it. To have everything ready for a trip, open
*Predefined levels* while online and tap **Download all levels** (or *Download these levels* inside one difficulty).
Levels not on the device show a small download badge.

## 4. Updating the app (new features)

1. Change the code, bump `version` in `package.json` (only used for the label in the menu footer), commit and push to `main`.
2. GitHub Actions rebuilds and publishes (about a minute).
3. Each device checks for a new version when the app starts, whenever it returns to the foreground, and hourly. The new version
   downloads in the background; the menu then shows a green **Update available - tap to restart** button. Tapping it switches to the new
   version. Your running level is saved after every move, so nothing is lost. If you never tap it, the new version takes over the next
   time the app is closed completely and opened again.

Devices that are offline simply keep working on the old version until they next have a connection. GitHub Pages can take up to ~10 minutes
to serve a new version everywhere. To see which version a device runs, read the menu footer (`v1.2.0 · date`).

## 5. Managing levels

Two folders, one direction:

```
levels/<difficulty>/*.json   your levels: names are yours, files are never touched
        |  npm run levels   (also runs automatically before `npm run dev`, `npm run build` and in the deploy workflow)
        v
public/levels/              generated and git-ignored: <id>-<v>.json per level + index.json
```

Workflow:

```
npm run generate -- --level 4 --count 5 --out levels/4     # make levels (files 01.json, 02.json, ... numbered after the existing ones) - or write/copy your own
npm run levels:check                                        # optional: validate everything, incl. exactly-one-solution and tutorials (CI runs it too)
npm run levels:complexity                                   # how complex each level really is (see below)
git add levels && git commit -m "new levels" && git push    # the workflow generates public/levels and publishes
```

- **Sorted by complexity.** When the generator makes several levels in one run it renames them in order of complexity, easiest first (the
  level files that were already in the folder are not touched). Add `--resort` to renumber *every* `NN.json` of the folder by complexity;
  files with any other name (`00-tutorial.json`, your own names) are never renamed.
- **Order** inside a difficulty = natural order of the source file names (`2.json` before `10.json`; the generator names files `01.json`, `02.json`, ...; or call them `01-intro.json`, ...).
- **Add / remove / rename / reorder**: just do it in `levels/`. Nothing else to update; the index is regenerated every time.
- **Identity.** Each level has an **id** (a hash of its puzzle) and a **version** `v` (a hash of its whole file). Completed ticks are kept by
  id, so reordering, renaming files, adding levels or fixing a tutorial never resets progress; changing the puzzle itself gives a new
  level that starts as not completed. A changed file gets a new published name, so devices always fetch the new version.
- **Tutorials** are written inside the level file: see `docs/tutorials.md`. Levels with one show a **?** in the list. The project ships
  one tutorial level for every clue type as `levels/<difficulty>/00-tutorial.json` (difficulty 1 neighbor, 2 row/column count, 3 isolated,
  4 surrounded, 5 chain, 6 area, 7 multiplier, 8 longest-run, 9 groups): the first level of the difficulty that introduces the clue.
- **Moving on.** The **Next** button never shows the menu in between: if the next level is on the device the game goes straight to it; if it has
  to be downloaded or generated you see the "downloading" / "generating" screen directly.
- **The menu** shows, on each difficulty tile, the icon of the clue that difficulty adds for the first time (worked out from
  `shared/presets.json`, so it follows your edits). After a level is cleared a **Next** button moves on to the next level, or to the first
  level of the next difficulty that has levels; after a random level it generates another one; after the very last level it offers the menu.
- **On devices**: the list is fetched at every start (fresh when online, the saved copy when offline). New levels appear in the list with
  a download badge; changed levels are downloaded again; levels no longer in the list are deleted from the device on the next online start.

### Complexity

How hard a level really is can differ from the difficulty it sits in, so every level can be measured. The **complexity** is the sum of the
cost of every deduction the human-style solver needs: a direct deduction costs 1 plus the number of known cells it has to combine; an
assumption ("suppose X is a bomb ...") costs ten times more for every level of nesting. The scale is arbitrary: compare levels with
each other. It is printed when you generate a level (`complexity=201`), by `npm run solve -- levels/4/01.json` (with the longest chain of
dependent deductions), and for all levels at once:

```
npm run levels:complexity                 # every level in levels/: size, clues, rating (assumption depth), steps, chain, complexity
npm run levels:complexity -- --difficulty 6
```

In the table, **rating** is the deepest "what if" reasoning the level needs (0 = every cell follows directly from the clues; 1 = at least one
"suppose X is a bomb ... contradiction" step; 2 = an assumption inside an assumption), **steps** the number of deductions, and **chain** the
longest run of deductions that each depend on the previous one (low = many independent places to start, high = a fixed order of solving;
it is shown for comparison and is not part of the score). The report prints this legend under the table.

The table also shows each level against the median of its difficulty (tutorials are left out of the median) and flags levels whose
assumption depth is outside the `depth` range of their difficulty in `shared/presets.json`: good candidates to recreate.

## 6. Random levels and seeds

A random level shows its seed in the title. Within one version of the app a seed always gives the same level (here, in the CLI and in a
link such as `https://.../?difficulty=4&seed=123456789`). After you change the generator or `presets.json` the same seed can give a
different level; that is why predefined levels are stored as files.

## 7. Testing the installable version locally

`npm run dev` is for development: it does not register the service worker. To test the real thing:

```
npm run build
npm run preview          # http://localhost:4173
```

Open it in Chrome, DevTools -> Application -> Service Workers, tick **Offline**, and reload: the game must still start. Check that
`levels/index.json` and a downloaded level still load. (A phone on the same network cannot install from `http://<ip>:4173` because installing
needs HTTPS; use the GitHub Pages address on the phone.)

## Troubleshooting: "Cannot find module ..." / missing files

`npm run dev` and `npm run build` first run `npm run check`, which lists every project file that is missing (the list is `requiredFiles` in
`package.json`). Each release adds new files, so after updating from a zip make sure the new ones were copied too. To see everything that
differs between your folder and a release zip:

```
unzip -q pixoji.zip -d /tmp/pbg
diff -rq /tmp/pbg/pixoji . --exclude=node_modules --exclude=dist --exclude=.git --exclude=public
# "Only in /tmp/pbg/...: x.js" = a file you are missing;   "Files ... differ" = an updated file
# your own levels/ and shared/presets.json are expected to differ: keep them
```

To copy every release file except your own levels and presets: `rsync -a --exclude levels --exclude shared/presets.json --exclude node_modules /tmp/pbg/pixoji/ ./`

## Caveats

- Installing and the service worker need **HTTPS**; GitHub Pages provides it.
- Browsers may delete a site's stored data when the device is very low on storage or if the site is not used for a long time (iOS
  Safari is the strictest when the app is not installed to the Home Screen). The game asks the browser to keep its data, but if levels or
  progress ever disappear, the app simply downloads the levels again when you are online.
- Progress lives on each device separately (phone and computer do not sync).

## Controls

- Mouse: left click = bomb, right click = pressed (no bomb), drag to paint.
- Touch: every tap cycles empty -> bomb -> pressed -> empty; drag to paint.
- Undo / redo buttons (Ctrl+Z, Ctrl+Y / Ctrl+Shift+Z), Reset asks for confirmation.
- **Settled clues fade.** When your marks settle a clue - every cell it depends on is marked (bomb or safe) and the marks give exactly the
  number shown - the clue is drawn faded but readable; it returns to normal as soon as a mark changes and it no longer holds, or when
  you undo. This covers cell clues (neighbor: its 3x3 block; isolated and surrounded: that block plus the cells next to it; area: its
  area must be closed in by cells of the other state) and the clues of rows and columns. Chain and multiplier cells have no number and never
  fade. When a level is cleared, the cells you had not pressed are pressed for you (every cell is marked then), so every clue shows as
  settled and the board stays that way.
- **← Menu** leaves the level at once if you have not marked anything (or have undone everything, or the level is cleared); if you have
  marked at least one cell, bomb or safe, it asks first, because those marks would be lost. Marks that a tutorial places as examples do not count.

## Presets (shared/presets.json)

One file feeds the game and the CLI tools. It is checked every time it is read (also by `npm run dev` / `npm run build`, which stop with a
readable error): JSON syntax, the preset rules and **duplicate keys** (JSON would silently keep only the last of two equal keys, e.g. a
level block copied and never renumbered). `npm run presets:check` runs just that check. Per difficulty: `size`, `bombs`, `cellCluesDensity`, `cellClues`, `lineCluesDensity`,
`lineClues`, `depth`, optional `chainClueMaxSize`, `areaClueMaxSize`, `redundant`, `about`. `bombs`, `cellCluesDensity` and
`lineCluesDensity` are fraction ranges `[min, max]`; `depth` is the range of nested assumptions a level must need (0 = direct deduction
only). `cellClues` (neighbor, isolated, surrounded, chain, multiplier, area) and `lineClues` (count, longest-run, groups) use ranged
weights `[min, max]`: each generated level draws a value in each range and the values become percentages. The `generation` block holds the
deterministic work budgets. See `node tools/generate-level.js --help` for every option.
