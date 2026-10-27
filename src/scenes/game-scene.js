import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import { ButtonGrid } from '../game/grid.js';
import { History } from '../game/history.js';
import { createTutorial } from '../game/tutorial.js';
import { drawHighlights } from '../game/tutorial-highlights.js';
import { marksUpTo, untilMet } from '../../shared/tutorial.js';
import { ConfirmDialog, createIconButton, createTextButton, drawCircularArrow } from '../ui/widgets.js';
import { TutorialPanel } from '../ui/tutorial-panel.js';
import { UI_CONFIG } from '../config.js';

const IDLE_DRAG = () => ({ active: false, state: null, changes: null });
const NEXT_WIDTH = 140;

/**
 * One level being played: the grid, the heads-up display (back, title, undo, redo, reset) and the input rules.
 *
 * Cell states: 0 = empty, 1 = bomb, 2 = pressed (no bomb).
 *  - mouse / pen: left click toggles bomb, right click toggles pressed, and dragging paints the same state.
 *  - touch (phones, tablets): there is no right click, so every tap cycles empty -> bomb -> pressed -> empty;
 *    dragging paints the state the first cell moved to.
 * Cells linked by a chain (clue 4) always change together.
 *
 * A level may carry a tutorial (shared/tutorial.js): while a "say" step is shown the board is locked and a tap anywhere
 * continues; "play" steps unlock it. The text box has back / next / skip, and the highlight is drawn over the board.
 */
export class GameScene extends Container {
  /**
   * callbacks: { onExit(), onWin(session), onChange(snapshot), nextLabel(session), onNext(session) }
   *  - onChange fires after every change worth saving
   *  - nextLabel returns the text of the button shown once the level is cleared (null = no button); onNext is called when it is tapped
   */
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
    this.tutorial = null;            // the running tutorial, if any
    this.levelHasTutorial = false;
    this.pendingTutorialMarks = false;

    this.eventMode = 'static';
    this.grid = new ButtonGrid();
    this.highlights = new Graphics();
    this.highlights.eventMode = 'none';
    this.catcher = new Container();  // covers the board during locked tutorial steps: a tap anywhere continues
    this.catcher.eventMode = 'static';
    this.catcher.visible = false;
    this.catcher.on('pointertap', () => this.tutorialNext());
    this.panel = new TutorialPanel({ onBack: () => this.tutorialBack(), onNext: () => this.tutorialNext(), onSkip: () => this.tutorialSkip() });
    this.hud = new Container();
    this.dialog = new ConfirmDialog();
    this.addChild(this.grid, this.highlights, this.catcher, this.hud, this.panel, this.dialog);

    this.backBtn = createTextButton({ label: '← Menu', width: 96, color: UI_CONFIG.navColor, hoverColor: UI_CONFIG.navHoverColor, onTap: () => this.requestExit() });
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
    this.nextBtn = createTextButton({ label: 'Next ▶', width: NEXT_WIDTH, color: 0x16a085, hoverColor: 0x1abc9c, onTap: () => this.callbacks.onNext?.(this.session) });
    this.nextBtn.visible = false;
    this.hud.addChild(this.backBtn, this.undoBtn, this.redoBtn, this.resetBtn, this.titleText, this.winText, this.nextBtn);

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
    this.levelHasTutorial = !!levelData.tutorial;
    this.tutorial = null;
    if (this.levelHasTutorial && !this.hasWon && !saved?.tutorial?.finished) {
      this.tutorial = createTutorial(levelData, saved?.tutorial?.step ?? 0);
      this.pendingTutorialMarks = !!this.tutorial && !saved;   // the first step's example marks are applied once the cells exist
    }
    window.addEventListener('keydown', this.onKeyDown);
    this.updateButtons();
  }

  /** Everything needed to resume this level later (see saved-game.js). */
  snapshot() {
    return {
      v: 1, session: this.session, title: this.title, levelData: this.levelData, cellStates: this.cellStates,
      undoStack: this.history.undoStack.slice(-200), redoStack: this.history.redoStack.slice(-200), hasWon: this.hasWon,
      tutorial: this.levelHasTutorial ? (this.tutorial && !this.tutorial.finished ? { step: this.tutorial.index } : { finished: true }) : null,
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

    // difficulty + level / seed: on its own row, or between the buttons on a short wide screen; shrunk if there is not enough room
    this.titleText.scale.set(1);
    const titleW = this.titleText.width;
    if (this.compactHud()) {
      const left = this.backBtn.x + 96 + margin, room = this.undoBtn.x - margin - left;
      const k = Math.min(1, room / Math.max(1, titleW));
      this.titleText.scale.set(k);
      this.titleText.position.set(Math.floor(left + (room - titleW * k) / 2), Math.floor(margin + (buttonSize - this.titleText.height) / 2));
    } else {
      const k = Math.min(1, (w - 2 * margin) / Math.max(1, titleW));
      this.titleText.scale.set(k);
      this.titleText.position.set(Math.floor((w - titleW * k) / 2), margin + buttonSize + 10);
    }

    this.layoutWinRow();

    this.dialog.resize(w, h);
    this.panel.resize(w, h, this.panelHeight());
    if (this.levelData) this.buildGrid();
  }

  /** Bottom strip once the level is cleared: the banner and, next to it, the "Next" button. */
  layoutWinRow() {
    const { w, h } = this.size, { margin, bottomHeight, buttonSize } = UI_CONFIG;
    const label = this.hasWon ? this.callbacks.nextLabel?.(this.session) ?? null : null;
    this.nextBtn.visible = !!label;
    if (label) this.nextBtn.setLabel(label);
    const room = w - 2 * margin - (label ? NEXT_WIDTH + margin : 0);
    this.winText.scale.set(1);
    const winW = this.winText.width;
    const k = Math.min(1, room / Math.max(1, winW));
    this.winText.scale.set(k);
    this.winText.position.set(Math.floor(margin + (room - winW * k) / 2), Math.floor(h - bottomHeight + (bottomHeight - this.winText.height) / 2));
    this.nextBtn.position.set(w - margin - NEXT_WIDTH, Math.floor(h - bottomHeight + (bottomHeight - buttonSize) / 2));
  }

  /** A phone on its side: too little height for two header rows. */
  compactHud() { return this.size.h < 480 && this.size.w >= 520; }

  hudHeight() { return this.compactHud() ? UI_CONFIG.hudHeightCompact : UI_CONFIG.hudHeight; }

  /** Height of the tutorial text box (it takes the place of the "level cleared" strip while a tutorial runs): sized for the longest text. */
  panelHeight() {
    if (!this.tutorial) return 0;
    const key = `${this.tutorial.steps.length}:${this.size.w}x${this.size.h}`;
    if (this.panelKey !== key) { this.panelKey = key; this.panelPx = this.panel.heightFor(this.tutorial.steps.map((s) => s.text), this.size.w, this.size.h); }
    return this.panelPx;
  }

  tutorialActive() { return !!this.tutorial && !this.tutorial.finished; }

  /** True while a locked tutorial step is on: the board must not react. */
  get locked() { return this.tutorialActive() && this.tutorial.blocking; }

  buildGrid() {
    const { w, h } = this.size;
    const bottom = this.tutorialActive() ? this.panelHeight() : UI_CONFIG.bottomHeight;
    const region = { x: 0, y: this.hudHeight(), width: w, height: Math.max(1, h - this.hudHeight() - bottom) };
    const { height: rows, width: cols } = this.levelData.grid;
    this.grid.rebuild(region, rows, cols, this.levelData, (cell, event) => this.onCellDown(cell, event));
    this.grid.cells.forEach((cell) => { if (this.cellStates[cell.index]) cell.setState(this.cellStates[cell.index]); });
    if (this.pendingTutorialMarks) { this.pendingTutorialMarks = false; this.applyMarks(marksUpTo(this.tutorial.steps, this.tutorial.index)); }
    this.refreshTutorialUi();
  }

  // ------------------------------------------------------------------ tutorial

  /** Shows / hides the text box, the highlight and the "tap to continue" layer to match the current step. */
  refreshTutorialUi() {
    const t = this.tutorial, { w, h } = this.size;
    if (!this.tutorialActive()) {
      this.panel.hide();
      this.catcher.visible = false;
      this.highlights.clear();
      return;
    }
    const panelH = this.panelHeight();
    this.catcher.hitArea = new Rectangle(0, this.hudHeight(), w, Math.max(1, h - this.hudHeight() - panelH));
    this.catcher.visible = t.blocking;
    this.panel.resize(w, h, panelH);
    this.panel.show({ text: t.step.text, index: t.index, count: t.count, canGoBack: t.canGoBack, showNext: t.hasNextButton, last: t.index === t.count - 1 });
    drawHighlights(this.highlights, t.step.highlight, this.grid.layoutInfo, this.levelData);
  }

  /** Sets cells to the given [{ r, c, state }] without recording undo history (chains move together). */
  applyMarks(marks) {
    for (const { r, c, state, all } of marks) {
      if (all) { for (const cell of this.grid.cells) this.setCellState(cell, state); continue; }
      const cell = this.grid.cells2D[r]?.[c];
      if (cell) this.applyToCell(cell, state);
    }
  }

  /** Shows the step the tutorial has just moved to (applying its example marks when moving forward). */
  enterTutorialStep(forward = true) {
    const t = this.tutorial;
    if (forward) this.applyMarks(marksUpTo([t.step], 0));
    this.refreshTutorialUi();
    this.updateButtons();
    this.changed();
  }

  advanceTutorial() {
    if (this.tutorial.next()) this.enterTutorialStep(true);
    else this.finishTutorial();
  }

  tutorialNext() {
    if (!this.tutorialActive() || this.dialog.visible || !this.tutorial.hasNextButton) return;
    this.advanceTutorial();
  }

  /** One step back: the board returns to how the tutorial itself left it before that step (the player's own moves are dropped). */
  tutorialBack() {
    if (!this.tutorialActive() || this.dialog.visible || !this.tutorial.back()) return;
    this.endGesture();
    for (const cell of this.grid.cells) this.setCellState(cell, 0);
    this.applyMarks(marksUpTo(this.tutorial.steps, this.tutorial.index));
    this.history.clear();
    this.enterTutorialStep(false);
  }

  tutorialSkip() {
    if (this.tutorialActive() && !this.dialog.visible) this.finishTutorial();
  }

  finishTutorial() {
    this.tutorial.finished = true;
    this.layout(this.size.w, this.size.h);   // the board grows back into the space the text box used
    this.updateButtons();
    this.changed();
  }

  /** A "play" step with an { bombs, safe } condition ends as soon as the board matches it. */
  checkTutorialProgress() {
    if (this.tutorialActive() && untilMet(this.tutorial.step, this.cellStates, this.levelData.grid.width)) this.advanceTutorial();
  }

  // ------------------------------------------------------------------ input

  onCellDown(cell, event) {
    if (this.hasWon || this.dialog.visible || this.locked) return;
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
    this.checkTutorialProgress();
    this.updateButtons();
    if (changes.length) this.changed();
  }

  handleKey(e) {
    if (e.key === 'Escape' && this.dialog.visible) { this.dialog.cancel(); return; }
    if (this.tutorialActive() && !this.dialog.visible && !e.ctrlKey && !e.metaKey) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') { e.preventDefault(); this.tutorialNext(); return; }
      if (e.key === 'ArrowLeft') { e.preventDefault(); this.tutorialBack(); return; }
    }
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
    this.layoutWinRow();
    if (this.tutorialActive()) this.finishTutorial();   // solving the level ends the tutorial
  }

  undo() {
    if (this.hasWon || this.dialog.visible || this.locked) return;
    const changes = this.history.undo();
    if (!changes) return;
    for (const c of changes) this.setCellState(this.grid.cells[c.index], c.from);
    this.updateButtons();
    this.changed();
    this.checkTutorialProgress();
  }

  redo() {
    if (this.hasWon || this.dialog.visible || this.locked) return;
    const changes = this.history.redo();
    if (!changes) return;
    for (const c of changes) this.setCellState(this.grid.cells[c.index], c.to);
    this.updateButtons();
    this.changed();
    this.checkTutorialProgress();
  }

  /**
   * Marks the player has placed that leaving would throw away (bomb or safe, at least one). Examples set by a tutorial are not the
   * player's, and a cleared level has nothing to lose, so neither counts.
   */
  hasPlayerMarks() { return !this.hasWon && this.history.canUndo && this.cellStates.some((state) => state !== 0); }

  /** The "← Menu" button: asks first only when there are marks to lose. */
  requestExit() {
    if (this.dialog.visible) return;
    this.endGesture();
    if (!this.hasPlayerMarks()) { this.callbacks.onExit?.(); return; }
    this.dialog.open({
      title: 'Leave this level?',
      message: 'The marks you have placed on this level will be lost.',
      confirmLabel: 'Leave',
      cancelLabel: 'Stay',
      onConfirm: () => this.callbacks.onExit?.(),
    });
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
    this.layoutWinRow();
    if (this.levelHasTutorial) {   // starting from scratch means the tutorial starts again too
      this.tutorial = createTutorial(this.levelData, 0);
      this.pendingTutorialMarks = !!this.tutorial;
      this.layout(this.size.w, this.size.h);
    }
    this.updateButtons();
    this.changed();
  }

  updateButtons() {
    this.undoBtn.setEnabled(this.history.canUndo && !this.hasWon && !this.locked);
    this.redoBtn.setEnabled(this.history.canRedo && !this.hasWon && !this.locked);
  }
}
