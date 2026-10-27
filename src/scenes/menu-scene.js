import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import { GRID_CONFIG, UI_CONFIG } from '../config.js';
import { PRESETS, DIFFICULTIES, INTRODUCED } from '../game/presets.js';
import { isLevelCompleted } from '../progress.js';
import { createTextButton } from '../ui/widgets.js';
import { createClueIcon } from '../ui/clue-icon.js';
import { APP_VERSION, BUILD_DATE } from '../version.js';

const gap = 16;

function makeText(text, { size = 16, fill = 0xffffff, bold = true, wrapWidth = 0, align = 'center' } = {}) {
  const t = new Text({
    text,
    style: { fontFamily: 'Arial', fontSize: size, fontWeight: bold ? 'bold' : 'normal', fill, align, wordWrap: wrapWidth > 0, wordWrapWidth: wrapWidth, lineHeight: size * 1.35 },
  });
  t.anchor.set(0.5, 0);
  return t;
}

/** A rounded tile with a main label and a small caption. */
function makeTile({ width, height, label, caption, labelSize = 26, enabled = true, dim = false, icons = [], onTap }) {
  const tile = new Container();
  const bg = new Graphics();
  const paint = (c) => bg.clear().roundRect(0, 0, width, height, 12).fill({ color: c });
  paint(GRID_CONFIG.cell.darkFace);
  const main = makeText(label, { size: labelSize });
  const sub = caption ? makeText(caption, { size: Math.max(11, Math.min(14, Math.floor(height * 0.17))), fill: 0xc9b8ea, bold: false }) : null;
  const blockH = main.height + (sub ? sub.height + 2 : 0);
  main.position.set(width / 2, (height - blockH) / 2);
  if (sub) sub.position.set(width / 2, main.y + main.height + 2);
  tile.addChild(bg, main);
  if (sub) tile.addChild(sub);

  // icons of the clues this difficulty adds, in the top-left corner
  if (icons.length) {
    const margin = 5, space = 3;
    const size = Math.max(18, Math.min(34, Math.round(Math.min((width - 2 * margin - (icons.length - 1) * space) / icons.length, width * 0.38))));
    icons.forEach((clue, i) => {
      const icon = createClueIcon(clue, size);
      icon.position.set(margin + i * (size + space), margin);
      tile.addChild(icon);
    });
    // on small tiles the number would sit on the icons: move it just clear of them
    const iconsRight = margin + icons.length * size + (icons.length - 1) * space;
    if (main.y < margin + size) main.x = Math.min(width - 2 - main.width / 2, Math.max(main.x, iconsRight + 3 + main.width / 2));
  }

  tile.hitArea = new Rectangle(0, 0, width, height);
  if (enabled) {
    tile.eventMode = 'static';
    tile.cursor = 'pointer';
    tile.on('pointerover', (e) => { if (e.pointerType === 'mouse') paint(GRID_CONFIG.cell.darkTopLeft); });
    tile.on('pointerout', () => paint(GRID_CONFIG.cell.darkFace));
    tile.on('pointertap', () => onTap?.());
  }
  tile.alpha = !enabled ? 0.4 : dim ? 0.6 : 1;
  return tile;
}

/** Small green tick used on completed levels. */
function makeTick(x, y) {
  const tick = new Graphics();
  tick.circle(x, y, 13).fill({ color: 0x2ecc71 }).stroke({ color: 0xffffff, width: 2 });
  tick.moveTo(x - 6, y).lineTo(x - 1.5, y + 5).lineTo(x + 6.5, y - 5).stroke({ color: 0xffffff, width: 3, cap: 'round', join: 'round' });
  return tick;
}

/** Small "?" badge: the level has a tutorial. */
function makeTutorialBadge(x, y) {
  const badge = new Container();
  badge.addChild(new Graphics().circle(x, y, 12).fill({ color: 0xe0a100 }).stroke({ color: 0xffffff, width: 1.5 }));
  const mark = new Text({ text: '?', style: { fontFamily: 'Arial', fontSize: 16, fontWeight: 'bold', fill: 0xffffff } });
  mark.anchor.set(0.5);
  mark.position.set(x, y + 0.5);
  badge.addChild(mark);
  return badge;
}

/** Small "download" badge: the level is not on this device yet. */
function makeDownloadBadge(x, y) {
  const badge = new Graphics();
  badge.circle(x, y, 11).fill({ color: 0x4a5a80 }).stroke({ color: 0xffffff, width: 1.5 });
  badge.moveTo(x, y - 5).lineTo(x, y + 4).stroke({ color: 0xffffff, width: 2.2, cap: 'round' });
  badge.moveTo(x - 4, y).lineTo(x, y + 4.5).lineTo(x + 4, y).stroke({ color: 0xffffff, width: 2.2, cap: 'round', join: 'round' });
  return badge;
}

const STATUS_TEXT = {
  loading: 'checking for new levels…',
  online: 'level list up to date',
  saved: 'offline: using the saved level list',
  none: 'no level list yet: connect once to get the predefined levels',
};

/**
 * Menu flow: mode (predefined / random) -> difficulty -> (predefined only) level. The 'busy' view is shown while a random
 * level is generated or levels are downloaded, and 'message' reports problems.
 */
export class MenuScene extends Container {
  /**
   * callbacks: { onPlayPredefined(difficulty, entry, number), onPlayRandom(difficulty), onDownload(items), onCancelGeneration(),
   *              onCancelDownload(), onApplyUpdate(), onNavigate(state) }
   * catalog: the LevelCatalog (list of predefined levels and which ones are saved on this device)
   */
  constructor(callbacks, catalog) {
    super();
    this.callbacks = callbacks;
    this.catalog = catalog;
    this.view = 'mode';
    this.mode = null;          // 'predefined' | 'random'
    this.difficulty = null;
    this.busy = null;          // { title, subtitle, text, note, onCancel }
    this.busyLabel = null;
    this.returnView = 'difficulty';
    this.message = '';
    this.applyUpdate = null;   // set when a new version of the app is ready
    this.size = { w: 800, h: 600 };
  }

  layout(w, h) {
    this.size = { w, h };
    this.render();
  }

  /** Redraws the current view (new ticks after a level, new status after the level list arrived, ...). */
  refresh() { this.render(); }

  go(view) {
    this.view = view;
    this.render();
    if (view !== 'busy' && view !== 'message') this.callbacks.onNavigate?.({ view, mode: this.mode, difficulty: this.difficulty });
  }

  /** Restores where the player was in the menus (from a previous visit); ignores anything invalid. */
  restore(state) {
    const okMode = state?.mode === 'predefined' || state?.mode === 'random';
    if (!okMode || !DIFFICULTIES.includes(state.difficulty ?? DIFFICULTIES[0])) return;
    this.mode = state.mode;
    if (state.view === 'levels' && state.mode === 'predefined' && DIFFICULTIES.includes(state.difficulty)) { this.difficulty = state.difficulty; this.view = 'levels'; }
    else if (state.view === 'difficulty' || state.view === 'levels') this.view = 'difficulty';
  }

  setUpdateAvailable(apply) {
    this.applyUpdate = apply;
    this.render();
  }

  // ------------------------------------------------------------------ busy screens

  startBusy(busy) {
    if (this.view !== 'busy') this.returnView = this.view === 'message' ? 'difficulty' : this.view;
    this.busy = busy;
    this.go('busy');
  }

  showLoading(difficulty) {
    this.mode = 'random';
    this.difficulty = difficulty;
    this.startBusy({
      title: 'GENERATING LEVEL', subtitle: `Difficulty ${difficulty}`, text: 'Generating a level…',
      note: PRESETS.levels[difficulty].depth[1] >= 2 ? 'This difficulty can take several minutes. Predefined levels start instantly.' : 'Higher difficulties can take a while.',
      onCancel: () => this.callbacks.onCancelGeneration?.(),
    });
  }

  showDownloading(total) {
    this.startBusy({
      title: 'DOWNLOADING LEVELS', subtitle: '', text: `0 / ${total}`,
      note: 'They are saved on this device, so you can play them without a connection.',
      onCancel: () => this.callbacks.onCancelDownload?.(),
    });
  }

  setBusyText(text) {
    if (this.busy) this.busy.text = text;
    if (this.busyLabel) this.busyLabel.text = text;
  }

  /** The job is over: coming back to the menu shows the screen the player started it from (drawn only if `show`). */
  endBusy({ show = false } = {}) {
    this.busy = null;
    if (this.view === 'busy') { if (show) this.go(this.returnView); else this.view = this.returnView; }
  }

  showMessage(text) {
    this.message = text;
    this.go('message');
  }

  back() {
    if (this.view === 'levels') this.go('difficulty');
    else if (this.view === 'difficulty') this.go('mode');
    else if (this.view === 'message') this.go(this.mode === 'predefined' && this.difficulty !== null ? 'levels' : 'difficulty');
  }

  // ------------------------------------------------------------------ drawing

  render() {
    // removed now, destroyed once the current event (often the tap that triggered this redraw) has finished
    const old = this.removeChildren();
    queueMicrotask(() => old.forEach((child) => child.destroy({ children: true })));
    this.busyLabel = null;
    const { w, h } = this.size;
    if (this.view === 'mode') this.drawMode(w, h);
    else if (this.view === 'difficulty') this.drawDifficulties(w, h);
    else if (this.view === 'levels') this.drawLevels(w, h);
    else if (this.view === 'busy') this.drawBusy(w, h);
    else this.drawMessage(w, h);
    if (this.view !== 'busy') this.drawFooter(w, h);
  }

  addBackButton(label = '← Back', onTap = () => this.back()) {
    const btn = createTextButton({ label, width: 96, color: UI_CONFIG.navColor, hoverColor: UI_CONFIG.navHoverColor, onTap });
    btn.position.set(UI_CONFIG.margin, UI_CONFIG.margin);
    this.addChild(btn);
  }

  addTitle(text, w, y, size = 30) {
    const title = makeText(text, { size, wrapWidth: w - 32 });
    title.position.set(w / 2, y);
    this.addChild(title);
    return title;
  }

  /** Bottom of every menu screen: the "update available" button, and the app version + state of the level list. */
  drawFooter(w, h) {
    const status = STATUS_TEXT[this.catalog.status] ?? '';
    const label = makeText(`v${APP_VERSION}${BUILD_DATE ? ` · ${BUILD_DATE}` : ''}  ·  ${status}`, { size: 12, bold: false, fill: 0x8e91a3, wrapWidth: w - 24 });
    label.position.set(w / 2, h - label.height - 8);
    this.addChild(label);
    if (this.applyUpdate) {
      const btn = createTextButton({ label: '⟳  Update available - tap to restart', width: Math.min(300, w - 24), color: 0x16a085, hoverColor: 0x1abc9c, onTap: () => { this.callbacks.onApplyUpdate?.(); this.applyUpdate?.(); } });
      btn.position.set(Math.floor((w - Math.min(300, w - 24)) / 2), label.y - 12 - UI_CONFIG.buttonSize);
      this.addChild(btn);
    }
  }

  drawMode(w, h) {
    const cw = Math.min(320, w - 40), ch = 96;
    const titleH = 40, blockH = titleH + 24 + 2 * ch + gap;
    const top = Math.max(20, Math.floor((h - blockH) / 2) - 20);
    this.addTitle('SELECT MODE', w, top, 32);
    const options = [
      { label: 'PREDEFINED LEVELS', caption: 'Hand-picked levels, saved on your device', mode: 'predefined' },
      { label: 'RANDOM LEVEL', caption: 'A new level is generated for you, works offline', mode: 'random' },
    ];
    options.forEach((o, i) => {
      const tile = makeTile({ width: cw, height: ch, label: o.label, caption: o.caption, labelSize: 21, onTap: () => { this.mode = o.mode; this.go('difficulty'); } });
      tile.position.set(Math.floor((w - cw) / 2), top + titleH + 24 + i * (ch + gap));
      this.addChild(tile);
    });
  }

  /** The column count that gives the biggest square tiles (at most 88 px, at least 52) for `count` tiles on this screen. */
  tileLayout(count, w, h, maxCols = 8) {
    let best = null;
    for (let cols = 1; cols <= Math.max(1, Math.min(count, maxCols)); cols++) {
      const rows = Math.ceil(count / cols);
      const byW = Math.floor((w - 32 - (cols - 1) * gap) / cols);
      const byH = Math.floor((h - 230 - (rows - 1) * gap) / rows);
      const size = Math.min(88, byW, byH);
      // bigger tiles win; among equal sizes prefer the squarer block
      if (!best || size > best.size || (size === best.size && Math.abs(cols - Math.sqrt(count)) < Math.abs(best.cols - Math.sqrt(count)))) best = { cols, rows, size };
    }
    return { ...best, size: Math.max(52, best.size) };
  }

  /** Places the tiles centred below the title; returns the y of the bottom edge of the block. */
  placeTiles(tiles, { cols, rows, size }, w, h, titleBottom) {
    const totalW = cols * size + (cols - 1) * gap, totalH = rows * size + (rows - 1) * gap;
    const startX = Math.floor((w - totalW) / 2);
    const startY = Math.max(titleBottom + 24, Math.floor((h + titleBottom - totalH) / 2) - 30);
    tiles.forEach((tile, i) => {
      tile.position.set(startX + (i % cols) * (size + gap), startY + Math.floor(i / cols) * (size + gap));
      this.addChild(tile);
    });
    return startY + totalH;
  }

  /** "Download ..." button under the tiles when some of `items` are not saved on this device yet and a connection exists. */
  addDownloadButton(items, label, w, y) {
    const missing = items.filter((it) => !this.catalog.isDownloaded(it.entry));
    if (!missing.length || !this.catalog.canSaveLevels || this.catalog.status !== 'online') return;
    const width = Math.min(300, w - 40);
    const btn = createTextButton({ label: `${label} (${missing.length})`, width, color: 0x4a5a80, hoverColor: 0x6178a8, fontSize: 15, onTap: () => this.callbacks.onDownload?.(missing) });
    btn.position.set(Math.floor((w - width) / 2), y + 22);
    this.addChild(btn);
  }

  drawDifficulties(w, h) {
    this.addBackButton();
    const title = this.addTitle(this.mode === 'predefined' ? 'PREDEFINED · DIFFICULTY' : 'RANDOM · DIFFICULTY', w, 66, 26);
    const layout = this.tileLayout(DIFFICULTIES.length, w, h);
    const tiles = DIFFICULTIES.map((d) => {
      const [pw, ph] = PRESETS.levels[d].size;
      let caption = `${pw}×${ph}`, enabled = true;
      if (this.mode === 'predefined') {
        const entries = this.catalog.entries(d);
        if (!entries.length) { caption = this.catalog.status === 'loading' ? '…' : 'no levels'; enabled = false; }
        else caption = `${entries.filter((e) => isLevelCompleted(e.id)).length}/${entries.length} done`;
      }
      return makeTile({
        width: layout.size, height: layout.size, label: `${d}`, caption, enabled, icons: INTRODUCED[d] ?? [],
        onTap: () => {
          this.difficulty = d;
          if (this.mode === 'predefined') this.go('levels');
          else this.callbacks.onPlayRandom?.(d);
        },
      });
    });
    const bottom = this.placeTiles(tiles, layout, w, h, title.y + title.height);
    if (this.mode === 'predefined') this.addDownloadButton(this.catalog.items(), 'Download all levels', w, bottom);
  }

  drawLevels(w, h) {
    this.addBackButton();
    const title = this.addTitle(`DIFFICULTY ${this.difficulty} · LEVELS`, w, 66, 26);
    const entries = this.catalog.entries(this.difficulty);
    const layout = this.tileLayout(entries.length, w, h);
    const offline = this.catalog.status !== 'online';
    const tiles = entries.map((entry, i) => {
      const saved = this.catalog.isDownloaded(entry);
      const tile = makeTile({
        width: layout.size, height: layout.size, label: `${i + 1}`, labelSize: 24, dim: !saved && offline,
        onTap: () => this.callbacks.onPlayPredefined?.(this.difficulty, entry, i + 1),
      });
      // completed levels get a tick, levels with a tutorial a "?", levels not saved on this device yet a download badge
      if (isLevelCompleted(entry.id)) tile.addChild(makeTick(layout.size - 16, 16));
      if (entry.tutorial) tile.addChild(makeTutorialBadge(16, 16));
      if (!saved && this.catalog.canSaveLevels) tile.addChild(makeDownloadBadge(layout.size - 15, layout.size - 15));
      return tile;
    });
    const bottom = this.placeTiles(tiles, layout, w, h, title.y + title.height);
    this.addDownloadButton(this.catalog.items(this.difficulty), 'Download these levels', w, bottom);
  }

  drawBusy(w, h) {
    const b = this.busy ?? { title: '', subtitle: '', text: '', note: '' };
    const top = Math.floor(h / 2) - 90;
    this.addTitle(b.title, w, top, 28);
    if (b.subtitle) this.addTitle(b.subtitle, w, top + 44, 20);
    this.busyLabel = makeText(b.text, { size: 16, bold: false, fill: 0xd0d2d9, wrapWidth: w - 40 });
    this.busyLabel.position.set(w / 2, top + 84);
    const note = makeText(b.note, { size: 14, bold: false, fill: 0x9a9db0, wrapWidth: Math.min(380, w - 40) });
    note.position.set(w / 2, top + 112);
    this.addChild(this.busyLabel, note);
    const cancel = createTextButton({
      label: 'Cancel', width: 140, color: UI_CONFIG.resetColor,
      onTap: () => { b.onCancel?.(); this.endBusy({ show: true }); },
    });
    cancel.position.set(Math.floor((w - 140) / 2), top + 168);
    this.addChild(cancel);
  }

  drawMessage(w, h) {
    this.addBackButton();
    const text = makeText(this.message, { size: 18, bold: false, wrapWidth: Math.min(420, w - 40) });
    text.position.set(w / 2, Math.floor(h / 2) - 60);
    this.addChild(text);
  }
}
