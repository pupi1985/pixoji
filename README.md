# Pixi Button Grid

Logic-only minesweeper: every level has exactly one solution that can be found without guessing.
It is a static web app (no server code) that installs as a PWA and runs offline.

## Project layout

```
index.html, vite.config.js, package.json
levels/<difficulty>/*.json     YOUR levels (never modified by any tool)           docs/tutorials.md   how to write tutorials
public/levels/                 GENERATED from levels/ by `npm run levels` (git-ignored): <id>-<v>.json files + index.json
public/manifest.webmanifest, icons/   app name and icons (what "install" uses)
.github/workflows/deploy.yml   builds and publishes to GitHub Pages on every push to main
pwa/sw.template.js             the service worker (the build turns it into dist/sw.js)
shared/                        pure logic used by the game, the web worker and the tools
  presets.json                 difficulty presets (clue weights, bombs, depth ...)   generator.js, solver-core.js, ...
  level-index.js               format of the generated index.json      tutorial.js   format + validation of level tutorials
tools/                         command line tools (Node)
  generate-level.js            create levels                  build-levels.js   publish levels/ -> public/levels/
  show-level.js                print a level with coordinates solver.js        explain / solve a level
  pwa-plugin.js                build step that writes dist/sw.js
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
npm run levels:check                                        # optional: validate everything, incl. exactly-one-solution (CI runs it too)
git add levels && git commit -m "new levels" && git push    # the workflow generates public/levels and publishes
```

- **Order** inside a difficulty = natural order of the source file names (`2.json` before `10.json`; the generator names files `01.json`, `02.json`, ...; or call them `01-intro.json`, ...).
- **Add / remove / rename / reorder**: just do it in `levels/`. Nothing else to update; the index is regenerated every time.
- **Identity.** Each level has an **id** (a hash of its puzzle) and a **version** `v` (a hash of its whole file). Completed ticks are kept by
  id, so reordering, renaming files, adding levels or fixing a tutorial never resets progress; changing the puzzle itself gives a new
  level that starts as not completed. A changed file gets a new published name, so devices always fetch the new version.
- **Tutorials** are written inside the level file: see `docs/tutorials.md`. Levels with one show a **?** in the list.
- **On devices**: the list is fetched at every start (fresh when online, the saved copy when offline). New levels appear in the list with
  a download badge; changed levels are downloaded again; levels no longer in the list are deleted from the device on the next online start.

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

## Presets (shared/presets.json)

One file feeds the game and the CLI tools. Per difficulty: `size`, `bombs`, `cellCluesDensity`, `cellClues`, `lineCluesDensity`,
`lineClues`, `depth`, optional `chainClueMaxSize`, `areaClueMaxSize`, `redundant`, `about`. `bombs`, `cellCluesDensity` and
`lineCluesDensity` are fraction ranges `[min, max]`; `depth` is the range of nested assumptions a level must need (0 = direct deduction
only). `cellClues` (neighbor, isolated, surrounded, chain, multiplier, area) and `lineClues` (count, longest-run, groups) use ranged
weights `[min, max]`: each generated level draws a value in each range and the values become percentages. The `generation` block holds the
deterministic work budgets. See `node tools/generate-level.js --help` for every option.
