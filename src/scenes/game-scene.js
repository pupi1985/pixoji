import { Container, Rectangle, Text } from 'pixi.js';
import { ButtonGrid } from '../game/grid.js';
import { History } from '../game/history.js';
import { ConfirmDialog, createIconButton, createTextButton, drawCircularArrow } from '../ui/widgets.js';
import { UI_CONFIG } from '../config.js';

const IDLE_DRAG = () => ({ active: false, state: null, changes: null });

/**
 * One level being played: the grid, the heads-up display (back, title, undo, redo, reset) and the input rules.
 *
 * Cell states: 0 = empty, 1 = bomb, 2 = pressed (no bomb).
 *  - mouse / pen: left click toggles bomb, right click toggles pressed, and dragging paints the same state.
 *  - touch (phones, tablets): there is no right click, so every tap cycles empty -> bomb -> pressed -> empty;
 *    dragging paints the state the first cell moved to.
 * Cells linked by a chain (clue 4) always change together.
 */
export class GameScene extends Container {
  /** callbacks: { onExit(), onWin(session), onChange(snapshot) } - onChange fires after every change worth saving */
  constructor(callbacks) {
    super();
    this.callbacks = callbacks;
    this.levelData = null;
    this.session = null;
    this.cellStates = [];
    this.history = new History();
    this.hasWon = false;
    this.drag = IDLE_DRAG();
    this.size = { w: 0, h: 0 };

    this.eventMode = 'static';
    this.grid = new ButtonGrid();
    this.hud = new Container();
    this.dialog = new ConfirmDialog();
    this.addChild(this.grid, this.hud, this.dialog);

    this.backBtn = createTextButton({ label: '← Menu', width: 96, color: UI_CONFIG.navColor, hoverColor: UI_CONFIG.navHoverColor, onTap: () => this.callbacks.onExit?.() });
    this.undoBtn = createIconButton({
      color: UI_CONFIG.undoColor, drawIcon: (g, s) => drawCircularArrow(g, s / 2, s / 2, s * 0.26, { clockwise: false }), onTap: () => this.undo(),
    });
    this.redoBtn = createIconButton({
      color: UI_CONFIG.redoColor, drawIcon: (g, s) => drawCircularArrow(g, s / 2, s / 2, s * 0.26, { clockwise: true }), onTap: () => this.redo(),
    });
    this.resetBtn = createTextButton({ label: 'Reset', width: 72, color: UI_CONFIG.resetColor, onTap: () => this.askReset() });
    this.titleText = new Text({ text: '', style: { fontFamily: 'Arial', fontSize: 20, fontWeight: 'bold', fill: 0xffffff } });
    this.winText = new Text({
      text: '🎉 LEVEL CLEARED! 🎉',
      style: { fontFamily: 'Arial', fontSize: 34, fontWeight: 'bold', fill: 0x2ecc71, dropShadow: { color: 0x000000, blur: 4, distance: 2 } },
    });
    this.winText.visible = false;
    this.hud.addChild(this.backBtn, this.undoBtn, this.redoBtn, this.resetBtn, this.titleText, this.winText);

    this.on('pointermove', (e) => this.onPointerMove(e));
    this.on('pointerup', () => this.endGesture());
    this.on('pointerupoutside', () => this.endGesture());
    this.on('pointercancel', () => this.endGesture());

    this.onKeyDown = (e) => this.handleKey(e);
  }

  // ------------------------------------------------------------------ lifecycle

  /**
   * session: { mode: 'predefined'|'random', difficulty, levelNumber?, seed? }
   * saved (optional): a snapshot() to resume from.
   */
  start({ levelData, title, session, saved = null }) {
    this.levelData = levelData;
    this.session = session;
    this.title = title;
    this.titleText.text = title;
    this.cellStates = saved ? saved.cellStates.slice() : new Array(levelData.grid.height * levelData.grid.width).fill(0);
    this.history.clear();
    if (saved) { this.history.undoStack = saved.undoStack.slice(); this.history.redoStack = saved.redoStack.slice(); }
    this.hasWon = !!saved?.hasWon;
    this.winText.visible = this.hasWon;
    this.drag = IDLE_DRAG();
    this.dialog.close();
    window.addEventListener('keydown', this.onKeyDown);
    this.updateButtons();
  }

  /** Everything needed to resume this level later (see saved-game.js). */
  snapshot() {
    return {
      v: 1, session: this.session, title: this.title, levelData: this.levelData, cellStates: this.cellStates,
      undoStack: this.history.undoStack.slice(-200), redoStack: this.history.redoStack.slice(-200), hasWon: this.hasWon,
    };
  }

  changed() { this.callbacks.onChange?.(this.snapshot()); }

  /** Called when leaving the level. */
  stop() {
    window.removeEventListener('keydown', this.onKeyDown);
    this.dialog.close();
    this.drag = IDLE_DRAG();
  }

  layout(w, h) {
    this.endGesture();
    this.size = { w, h };
    this.hitArea = new Rectangle(0, 0, w, h);
    const { margin, buttonSize, bottomHeight } = UI_CONFIG;

    // row 1: back on the left, undo / redo / reset on the right
    this.backBtn.position.set(margin, margin);
    this.resetBtn.position.set(w - margin - 72, margin);
    this.redoBtn.position.set(this.resetBtn.x - 8 - buttonSize, margin);
    this.undoBtn.position.set(this.redoBtn.x - 8 - buttonSize, margin);

    // row 2: difficulty + level / seed, shrunk if the screen is narrow
    this.titleText.scale.set(1);
    const titleW = this.titleText.width;
    const k = Math.min(1, (w - 2 * margin) / Math.max(1, titleW));
    this.titleText.scale.set(k);
    this.titleText.position.set(Math.floor((w - titleW * k) / 2), margin + buttonSize + 10);

    // win banner below the grid
    this.winText.scale.set(1);
    const winW = this.winText.width;
    const wk = Math.min(1, (w - 2 * margin) / Math.max(1, winW));
    this.winText.scale.set(wk);
    this.winText.position.set(Math.floor((w - winW * wk) / 2), Math.floor(h - bottomHeight + (bottomHeight - this.winText.height) / 2));

    this.dialog.resize(w, h);
    if (this.levelData) this.buildGrid();
  }

  buildGrid() {
    const { w, h } = this.size;
    const region = { x: 0, y: UI_CONFIG.hudHeight, width: w, height: Math.max(1, h - UI_CONFIG.hudHeight - UI_CONFIG.bottomHeight) };
    const { height: rows, width: cols } = this.levelData.grid;
    this.grid.rebuild(region, rows, cols, this.levelData, (cell, event) => this.onCellDown(cell, event));
    this.grid.cells.forEach((cell) => { if (this.cellStates[cell.index]) cell.setState(this.cellStates[cell.index]); });
  }

  // ------------------------------------------------------------------ input

  onCellDown(cell, event) {
    if (this.hasWon || this.dialog.visible) return;
    let target;
    if (event.pointerType === 'touch') target = (cell.state + 1) % 3;                // empty -> bomb -> pressed -> empty
    else if (event.button === 0) target = cell.state === 1 ? 0 : 1;                  // left click
    else if (event.button === 2) target = cell.state === 2 ? 0 : 2;                  // right click
    else return;
    this.drag = { active: true, state: target, changes: new Map() };
    this.applyToCell(cell, target);
  }

  onPointerMove(event) {
    if (!this.drag.active || this.hasWon || !this.grid.layoutInfo) return;
    const { startX, startY, cellSize, rows, cols } = this.grid.layoutInfo;
    const p = this.grid.toLocal(event.global);
    const col = Math.floor((p.x - startX) / cellSize), row = Math.floor((p.y - startY) / cellSize);
    if (row < 0 || col < 0 || row >= rows || col >= cols) return;
    const cell = this.grid.cells2D[row][col];
    if (cell && cell.state !== this.drag.state) this.applyToCell(cell, this.drag.state);
  }

  endGesture() {
    if (!this.drag.active) return;
    const changes = [...this.drag.changes.values()].filter((c) => c.from !== c.to);
    this.drag = IDLE_DRAG();
    this.history.push(changes);
    this.checkVictory();
    this.updateButtons();
    if (changes.length) this.changed();
  }

  handleKey(e) {
    if (e.key === 'Escape' && this.dialog.visible) { this.dialog.cancel(); return; }
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'z') { e.preventDefault(); if (e.shiftKey) this.redo(); else this.undo(); }
    else if (k === 'y') { e.preventDefault(); this.redo(); }
  }

  // ------------------------------------------------------------------ state

  /** Sets a cell (and every cell linked to it by a chain) to a state, recording the change for undo. */
  applyToCell(cell, state) {
    const targets = cell.chainId === null ? [cell] : this.grid.cells.filter((c) => c.chainId === cell.chainId);
    for (const c of targets) this.setCellState(c, state);
  }

  setCellState(cell, state) {
    const from = this.cellStates[cell.index];
    if (from === state) return;
    cell.setState(state);
    this.cellStates[cell.index] = state;
    const changes = this.drag.changes;
    if (!changes) return;
    const entry = changes.get(cell.index);
    if (entry) entry.to = state; else changes.set(cell.index, { index: cell.index, from, to: state });
  }

  checkVictory() {
    const cells = this.grid.cells;
    if (this.hasWon || !cells.length || !cells.some((c) => c.state === 1)) return;
    if (!cells.every((c) => (c.hasBomb ? c.state === 1 : c.state !== 1))) return;
    this.hasWon = true;
    this.winText.visible = true;
    this.callbacks.onWin?.(this.session);
  }

  undo() {
    if (this.hasWon || this.dialog.visible) return;
    const changes = this.history.undo();
    if (!changes) return;
    for (const c of changes) this.setCellState(this.grid.cells[c.index], c.from);
    this.updateButtons();
    this.changed();
  }

  redo() {
    if (this.hasWon || this.dialog.visible) return;
    const changes = this.history.redo();
    if (!changes) return;
    for (const c of changes) this.setCellState(this.grid.cells[c.index], c.to);
    this.updateButtons();
    this.changed();
  }

  askReset() {
    if (this.dialog.visible) return;
    this.endGesture();
    this.dialog.open({
      title: 'Reset level?',
      message: 'Every mark you have placed will be cleared and the undo history will be lost. You can play this level again from scratch.',
      confirmLabel: 'Reset',
      cancelLabel: 'Cancel',
      onConfirm: () => this.resetLevel(),
    });
  }

  resetLevel() {
    for (const cell of this.grid.cells) this.setCellState(cell, 0);
    this.history.clear();
    this.hasWon = false;
    this.winText.visible = false;
    this.updateButtons();
    this.changed();
  }

  updateButtons() {
    this.undoBtn.setEnabled(this.history.canUndo && !this.hasWon);
    this.redoBtn.setEnabled(this.history.canRedo && !this.hasWon);
  }
}
