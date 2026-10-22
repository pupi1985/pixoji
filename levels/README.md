# Source levels

Put your levels here, one folder per difficulty:

```
levels/1/01.json
levels/1/02.json
levels/2/01-first.json
```

These files are **yours**: the build never renames, edits or deletes them. `npm run levels` (also run automatically by `npm run dev`,
`npm run build` and the deploy workflow) reads them and generates `public/levels/` for the game. Play order inside a difficulty is the
natural order of the file names (`2.json` before `10.json`; the generator uses `01.json`, `02.json`, ...; or name them yourself: `01-intro.json`, `02-...`).

Create levels with `npm run generate -- --level 3 --count 5 --out levels/3` (files are named `01.json`, `02.json`, ... continuing after the ones already there), or write them by hand.
A level may carry a tutorial: see `docs/tutorials.md`.
