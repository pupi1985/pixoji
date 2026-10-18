export const GRID_CONFIG = {
  minCellSize: 22,
  maxCellSize: 48,
  preferredCellSize: 42,
  gapRatio: 0.09,
  background: 0x20212a, // Fondo de la aplicación (oscuro)
  clueBand: 1.2,        // room reserved for the line-clue badges, in cell sizes (only on the sides that have clues)
  cell: {
    face: 0xd0d2d9,
    topLeft: 0xf2f3f6,
    bottomRight: 0x747783,
    darkFace: 0x32105f,
    darkTopLeft: 0x67449a,
    darkBottomRight: 0x17072f,

    pressedFace: 0x8f8f8f,

    pressedTopLeft: 0x5a5c61,
    pressedBottomRight: 0xb4b7bf,
    hintFace: 0xd0d2d9,
    hintBorderIndicator: 0x7f8c8d
  },
  clueStyles: {
    1: { name: "Total Count",      color: 0x2ecc71 },
    2: { name: "Max Consecutive", color: 0xe67e22 },
    3: { name: "Total Segments",  color: 0x9b59b6 }
  },
  cellClueText: {
    fontFamily: 'Arial',
    fontWeight: 'bold',
    fill: 0x11161b,
    stroke: { color: 0xffffff, width: 0.5 }
  },
  cellClueTextPainted: {
    fontFamily: 'Arial',
    fontWeight: 'bold',
    fill: 0xffffff,
    stroke: { color: 0x000000, width: 1 }
  }
};

/** Heads-up display (buttons, title, win banner) and dialogs. */
export const UI_CONFIG = {
  margin: 12,
  buttonSize: 40,
  hudHeight: 100,      // space above the grid: button row + title row
  bottomHeight: 56,    // space below the grid: "level cleared" banner
  undoColor: 0xe67e22,
  redoColor: 0x16a085,
  resetColor: 0xc0392b,
  navColor: 0x32105f,
  navHoverColor: 0x67449a,
  dialog: { overlayAlpha: 0.65, panelColor: 0x2b2d3a, borderColor: 0x67449a, maxWidth: 340 }
};

export const APP_CONFIG = {
  showBombs: false,
  /**
   * Predefined levels available per difficulty (the difficulties themselves come from shared/presets.json).
   * Files live in public/levels/<difficulty>/level<N>.json, N = 1..count; create them with
   *   node tools/generate-level.js --level <difficulty> --count <n> --out public/levels/<difficulty>
   * A difficulty that is missing here (or 0) simply has no predefined levels.
   */
  predefinedLevels: { 1: 5, 2: 5, 3: 5, 4: 5 }
};
