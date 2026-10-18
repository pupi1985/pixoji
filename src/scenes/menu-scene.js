import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import { APP_CONFIG, GRID_CONFIG, UI_CONFIG } from '../config.js';
import { PRESETS, DIFFICULTIES } from '../game/presets.js';
import { isLevelCompleted } from '../progress.js';
import { createTextButton } from '../ui/widgets.js';

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
function makeTile({ width, height, label, caption, labelSize = 26, enabled = true, onTap }) {
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

  tile.hitArea = new Rectangle(0, 0, width, height);
  if (enabled) {
    tile.eventMode = 'static';
    tile.cursor = 'pointer';
    tile.on('pointerover', (e) => { if (e.pointerType === 'mouse') paint(GRID_CONFIG.cell.darkTopLeft); });
    tile.on('pointerout', () => paint(GRID_CONFIG.cell.darkFace));
    tile.on('pointertap', () => onTap?.());
  } else {
    tile.alpha = 0.4;
  }
  return tile;
}

/** Small green tick used on completed levels. */
function makeTick(x, y) {
  const tick = new Graphics();
  tick.circle(x, y, 13).fill({ color: 0x2ecc71 }).stroke({ color: 0xffffff, width: 2 });
  tick.moveTo(x - 6, y).lineTo(x - 1.5, y + 5).lineTo(x + 6.5, y - 5).stroke({ color: 0xffffff, width: 3, cap: 'round', join: 'round' });
  return tick;
}

/**
 * Menu flow: mode (predefined / random) -> difficulty -> (predefined only) level. The 'loading' view is shown while
 * a random level is being generated and 'message' reports errors.
 */
export class MenuScene extends Container {
  /** callbacks: { onPlayPredefined(difficulty, number), onPlayRandom(difficulty), onCancelGeneration() } */
  constructor(callbacks) {
    super();
    this.callbacks = callbacks;
    this.view = 'mode';
    this.mode = null;          // 'predefined' | 'random'
    this.difficulty = null;
    this.loadingText = '';
    this.loadingLabel = null;
    this.message = '';
    this.size = { w: 800, h: 600 };
  }

  layout(w, h) {
    this.size = { w, h };
    this.render();
  }

  /** Redraws the current view (e.g. after coming back from a level, so new ticks appear). */
  refresh() { this.render(); }

  go(view) { this.view = view; this.render(); }

  showLoading(difficulty) {
    this.difficulty = difficulty;
    this.loadingText = 'Generating a level…';
    this.go('loading');
  }

  /** The generated level is about to be played: coming back to the menu must show the difficulty list again. */
  finishLoading() { this.view = 'difficulty'; }

  setLoadingText(text) {
    this.loadingText = text;
    if (this.loadingLabel) this.loadingLabel.text = text;
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
    this.loadingLabel = null;
    const { w, h } = this.size;
    if (this.view === 'mode') this.drawMode(w, h);
    else if (this.view === 'difficulty') this.drawDifficulties(w, h);
    else if (this.view === 'levels') this.drawLevels(w, h);
    else if (this.view === 'loading') this.drawLoading(w, h);
    else this.drawMessage(w, h);
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

  drawMode(w, h) {
    const cw = Math.min(320, w - 40), ch = 96;
    const titleH = 40, blockH = titleH + 24 + 2 * ch + gap;
    const top = Math.max(20, Math.floor((h - blockH) / 2));
    this.addTitle('SELECT MODE', w, top, 32);
    const options = [
      { label: 'PREDEFINED LEVELS', caption: 'Play the levels stored in the game', mode: 'predefined' },
      { label: 'RANDOM LEVEL', caption: 'A new level is generated for you', mode: 'random' },
    ];
    options.forEach((o, i) => {
      const tile = makeTile({ width: cw, height: ch, label: o.label, caption: o.caption, labelSize: 21, onTap: () => { this.mode = o.mode; this.go('difficulty'); } });
      tile.position.set(Math.floor((w - cw) / 2), top + titleH + 24 + i * (ch + gap));
      this.addChild(tile);
    });
  }

  /** Square tile size and column count that fit `count` tiles on screen. */
  tileLayout(count, w, h, maxCols = 5) {
    const cols = Math.max(1, Math.min(count, maxCols, Math.floor((w - 32 + gap) / (64 + gap))));
    const rows = Math.ceil(count / cols);
    const byW = Math.floor((w - 32 - (cols - 1) * gap) / cols);
    const byH = Math.floor((h - 170 - (rows - 1) * gap) / rows);
    const size = Math.max(52, Math.min(88, byW, byH));
    return { cols, rows, size };
  }

  placeTiles(tiles, { cols, rows, size }, w, h, titleBottom) {
    const totalW = cols * size + (cols - 1) * gap, totalH = rows * size + (rows - 1) * gap;
    const startX = Math.floor((w - totalW) / 2);
    const startY = Math.max(titleBottom + 24, Math.floor((h + titleBottom - totalH) / 2));
    tiles.forEach((tile, i) => {
      tile.position.set(startX + (i % cols) * (size + gap), startY + Math.floor(i / cols) * (size + gap));
      this.addChild(tile);
    });
  }

  drawDifficulties(w, h) {
    this.addBackButton();
    const title = this.addTitle(this.mode === 'predefined' ? 'PREDEFINED · DIFFICULTY' : 'RANDOM · DIFFICULTY', w, 66, 26);
    const layout = this.tileLayout(DIFFICULTIES.length, w, h, 5);
    const tiles = DIFFICULTIES.map((d) => {
      const [pw, ph] = PRESETS.levels[d].size;
      const count = APP_CONFIG.predefinedLevels[d] ?? 0;
      let caption = `${pw}×${ph}`, enabled = true;
      if (this.mode === 'predefined') {
        if (count === 0) { caption = 'no levels'; enabled = false; }
        else {
          let done = 0;
          for (let n = 1; n <= count; n++) if (isLevelCompleted(d, n)) done++;
          caption = `${done}/${count} done`;
        }
      }
      return makeTile({
        width: layout.size, height: layout.size, label: `${d}`, caption, enabled,
        onTap: () => {
          this.difficulty = d;
          if (this.mode === 'predefined') this.go('levels');
          else this.callbacks.onPlayRandom?.(d);
        },
      });
    });
    this.placeTiles(tiles, layout, w, h, title.y + title.height);
  }

  drawLevels(w, h) {
    this.addBackButton();
    const title = this.addTitle(`DIFFICULTY ${this.difficulty} · LEVELS`, w, 66, 26);
    const count = APP_CONFIG.predefinedLevels[this.difficulty] ?? 0;
    const layout = this.tileLayout(count, w, h, 5);
    const tiles = [];
    for (let n = 1; n <= count; n++) {
      const tile = makeTile({
        width: layout.size, height: layout.size, label: `${n}`, labelSize: 24,
        onTap: () => this.callbacks.onPlayPredefined?.(this.difficulty, n),
      });
      // completed levels get a tick; they can still be replayed any time
      if (isLevelCompleted(this.difficulty, n)) tile.addChild(makeTick(layout.size - 16, 16));
      tiles.push(tile);
    }
    this.placeTiles(tiles, layout, w, h, title.y + title.height);
  }

  drawLoading(w, h) {
    const top = Math.floor(h / 2) - 90;
    this.addTitle('GENERATING LEVEL', w, top, 28);
    this.addTitle(`Difficulty ${this.difficulty}`, w, top + 44, 20);
    this.loadingLabel = makeText(this.loadingText, { size: 16, bold: false, fill: 0xd0d2d9 });
    this.loadingLabel.position.set(w / 2, top + 84);
    const note = makeText('Higher difficulties can take a while.', { size: 14, bold: false, fill: 0x9a9db0, wrapWidth: w - 40 });
    note.position.set(w / 2, top + 112);
    this.addChild(this.loadingLabel, note);
    const cancel = createTextButton({
      label: 'Cancel', width: 140, color: UI_CONFIG.resetColor,
      onTap: () => { this.callbacks.onCancelGeneration?.(); this.go('difficulty'); },
    });
    cancel.position.set(Math.floor((w - 140) / 2), top + 160);
    this.addChild(cancel);
  }

  drawMessage(w, h) {
    this.addBackButton();
    const text = makeText(this.message, { size: 18, bold: false, wrapWidth: Math.min(420, w - 40) });
    text.position.set(w / 2, Math.floor(h / 2) - 40);
    this.addChild(text);
  }
}
