import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { GridCell } from './cell.js';
import { GRID_CONFIG } from '../config.js';
import { addLineClueShape } from './clue-icons.js';

/** The playing board: the cells, the in-grid chain fences and the line clue badges. */
export class Board extends Container {
  constructor() {
    super();
    this.cells = [];
    this.rowBadges = [];   // the left / top line clue badges by row / column, so they can be faded when settled
    this.colBadges = [];
    this.cells2D = []; 
    this.layoutInfo = null;
    
    this.cluesContainer = new Container();
    this.cellsContainer = new Container();
    this.addChild(this.cluesContainer, this.cellsContainer);
  }

  computeLineClueValue(binaryLineArray, clueTypeArray, clueTypeCode) {
    if (!clueTypeCode || clueTypeCode === 0) return ""; 
    if (clueTypeCode === 1) {
      let score = 0;
      for (let i = 0; i < binaryLineArray.length; i++) {
        if (binaryLineArray[i] === 1) score += (clueTypeArray[i] === 5) ? 2 : 1;
      }
      return score;
    }
    if (clueTypeCode === 2) {
      let maxScore = 0, currentScore = 0;
      for (let i = 0; i < binaryLineArray.length; i++) {
        if (binaryLineArray[i] === 1) {
          currentScore += (clueTypeArray[i] === 5) ? 2 : 1;
          if (currentScore > maxScore) maxScore = currentScore;
        } else { currentScore = 0; }
      }
      return maxScore;
    }
    if (clueTypeCode === 3) {
      let segments = 0, inSegment = false;
      for (const val of binaryLineArray) {
        if (val === 1) { if (!inSegment) { segments++; inSegment = true; } }
        else inSegment = false;
      }
      return segments;
    }
    return "?";
  }

  computeCellClueValue(bombMatrix, clueMatrix, targetRow, targetCol, typeCode, rows, cols) {
    const isBomb = (r, c) => (r < 0 || r >= rows || c < 0 || c >= cols) ? 0 : bombMatrix[r][c];
    const isMultiplier = (r, c) => (r < 0 || r >= rows || c < 0 || c >= cols) ? false : (clueMatrix[r][c] === 5);

    const neighborhood = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = targetRow + dr, nc = targetCol + dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && bombMatrix[nr][nc] === 1) {
          neighborhood.push({ r: nr, c: nc });
        }
      }
    }

    if (typeCode === 1) {
      let total = 0;
      neighborhood.forEach(({ r, c }) => { total += isMultiplier(r, c) ? 2 : 1; });
      return total;
    }
    if (typeCode === 2) {
      let isolatedScore = 0;
      neighborhood.forEach(({ r, c }) => {
        if (isBomb(r-1, c)===0 && isBomb(r+1, c)===0 && isBomb(r, c-1)===0 && isBomb(r, c+1)===0) {
          isolatedScore += isMultiplier(r, c) ? 2 : 1;
        }
      });
      return isolatedScore;
    }
    if (typeCode === 3) {
      let surroundedScore = 0;
      neighborhood.forEach(({ r, c }) => {
        const t = (r - 1 < 0) ? 1 : bombMatrix[r - 1][c];
        const b = (r + 1 >= rows) ? 1 : bombMatrix[r + 1][c];
        const l = (c - 1 < 0) ? 1 : bombMatrix[r][c - 1];
        const h = (c + 1 >= cols) ? 1 : bombMatrix[r][c + 1];
        if (t === 1 && b === 1 && l === 1 && h === 1) {
          surroundedScore += isMultiplier(r, c) ? 2 : 1;
        }
      });
      return surroundedScore;
    }
    if (typeCode === 6) {
      const targetState = bombMatrix[targetRow][targetCol];
      const visited = Array.from({ length: rows }, () => Array(cols).fill(false));
      const queue = [[targetRow, targetCol]];
      visited[targetRow][targetCol] = true;
      let totalAreaWeight = 0;

      while (queue.length > 0) {
        const [qr, qc] = queue.shift();
        totalAreaWeight += (clueMatrix[qr][qc] === 5) ? 2 : 1;

        const upRow = qr - 1;
        const downRow = qr + 1;
        const leftCol = qc - 1;
        const rightCol = qc + 1;

        // Estructura lineal explícita para evitar errores de compresión de tipos de bucles
        if (upRow >= 0 && !visited[upRow][qc] && bombMatrix[upRow][qc] === targetState) { visited[upRow][qc] = true; queue.push([upRow, qc]); }
        if (downRow < rows && !visited[downRow][qc] && bombMatrix[downRow][qc] === targetState) { visited[downRow][qc] = true; queue.push([downRow, qc]); }
        if (leftCol >= 0 && !visited[qr][leftCol] && bombMatrix[qr][leftCol] === targetState) { visited[qr][leftCol] = true; queue.push([qr, leftCol]); }
        if (rightCol < cols && !visited[qr][rightCol] && bombMatrix[qr][rightCol] === targetState) { visited[qr][rightCol] = true; queue.push([qr, rightCol]); }
      }
      return totalAreaWeight;
    }
    return "";
  }

  createClueBadge(value, typeCode, targetSize, orientation = "top") {
    const badgeContainer = new Container();
    const radius = targetSize * 0.45;

    addLineClueShape(badgeContainer, typeCode, radius, orientation);

    const labelStyle = new TextStyle({
      fontFamily: 'Arial', fontSize: Math.max(11, Math.floor(targetSize * 0.42)),
      fontWeight: 'bold', fill: 0xffffff, dropShadow: { color: 0x000000, alpha: 0.8, blur: 2, distance: 1 }
    });
    const txt = new Text({ text: `${value}`, style: labelStyle });
    txt.x = -txt.width / 2;
    txt.y = (typeCode === 1 && orientation === "top") ? (-txt.height / 2) - 3 : (typeCode === 2 ? (-txt.height / 2) + 2 : -txt.height / 2);
    badgeContainer.addChild(txt); return badgeContainer;
  }

  /**
   * region: { x, y, width, height } - the area the puzzle (cells plus line-clue badges) must fit in and be centred on.
   * onCellActivate(cell, event) is called on every pointerdown over a cell.
   */
  rebuild(region, targetRows = 6, targetCols = 6, levelData = null, onCellActivate = () => {}) {
    const dispose = (container) => container.removeChildren().forEach((child) => child.destroy({ children: true }));
    dispose(this.cellsContainer); dispose(this.cluesContainer); this.cells = []; this.rowBadges = []; this.colBadges = [];
    this.cells2D = Array.from({ length: targetRows }, () => Array(targetCols).fill(null));

    const { minCellSize, maxCellSize, preferredCellSize, cell, clueBand } = GRID_CONFIG;
    const hasLineClues = (list) => Array.isArray(list) && list.some((t) => t);
    const bandCols = hasLineClues(levelData?.clues?.left) ? clueBand : 0;   // room for the left badges
    const bandRows = hasLineClues(levelData?.clues?.top) ? clueBand : 0;    // room for the top badges

    const gap = 0;
    const responsiveSize = Math.min(region.width / (targetCols + bandCols), region.height / (targetRows + bandRows));
    const cellSize = Math.max(minCellSize, Math.min(maxCellSize, preferredCellSize, Math.floor(responsiveSize)));

    // centre cells + badges as one block inside the region
    const totalW = (targetCols + bandCols) * cellSize;
    const totalH = (targetRows + bandRows) * cellSize;
    const startX = Math.floor(region.x + (region.width - totalW) / 2 + bandCols * cellSize);
    const startY = Math.floor(region.y + (region.height - totalH) / 2 + bandRows * cellSize);

    const bombMatrix = Array.from({ length: targetRows }, () => Array(targetCols).fill(0));
    const clueMatrix = Array.from({ length: targetRows }, () => Array(targetCols).fill(0));

    if (levelData && Array.isArray(levelData.bombs)) {
      for (let r = 0; r < targetRows; r++) {
        for (let c = 0; c < targetCols; c++) {
          if (levelData.bombs[r] && levelData.bombs[r][c] === 1) bombMatrix[r][c] = 1;
        }
      }
    }
    if (levelData && levelData.clues && Array.isArray(levelData.clues.grid)) {
      for (let r = 0; r < targetRows; r++) {
        for (let c = 0; c < targetCols; c++) {
          if (levelData.clues.grid[r] && levelData.clues.grid[r][c]) clueMatrix[r][c] = levelData.clues.grid[r][c];
        }
      }
    }

    for (let row = 0; row < targetRows; row++) {
      for (let col = 0; col < targetCols; col++) {
        const item = new GridCell(cellSize, gap, cell, onCellActivate);
        item.index = row * targetCols + col;
        item.x = startX + col * cellSize; item.y = startY + row * cellSize;

        if (bombMatrix[row][col] === 1) { item.hasBomb = true; item.setState(0); }

        if (clueMatrix[row][col] !== 0) {
          const cellClueTypeCode = clueMatrix[row][col];
          const clueValue = this.computeCellClueValue(bombMatrix, clueMatrix, row, col, cellClueTypeCode, targetRows, targetCols);
          item.setCellClueText(clueValue, cellClueTypeCode);
        }

        this.cellsContainer.addChild(item); this.cells.push(item); this.cells2D[row][col] = item;
      }
    }

    // Buscador Flood-Fill de cadenas contiguas corregido con asignaciones lineales fijas
    const visited = Array.from({ length: targetRows }, () => Array(targetCols).fill(false));
    let clusterCounter = 0;

    for (let r = 0; r < targetRows; r++) {
      for (let c = 0; c < targetCols; c++) {
        const cell = this.cells2D[r][c];
        if (cell && cell.clueType === 4 && !visited[r][c]) {
          const currentGroupCells = []; const queue = [[r, c]]; visited[r][c] = true;
          while (queue.length > 0) {
            const [qr, qc] = queue.shift(); currentGroupCells.push({ r: qr, c: qc, node: this.cells2D[qr][qc] });
            
            const upRow = qr - 1;
            const downRow = qr + 1;
            const leftCol = qc - 1;
            const rightCol = qc + 1;

            if (upRow >= 0 && !visited[upRow][qc]) {
              const n = this.cells2D[upRow][qc];
              if (n && n.clueType === 4) { visited[upRow][qc] = true; queue.push([upRow, qc]); }
            }
            if (downRow < targetRows && !visited[downRow][qc]) {
              const n = this.cells2D[downRow][qc];
              if (n && n.clueType === 4) { visited[downRow][qc] = true; queue.push([downRow, qc]); }
}
if (leftCol >= 0 && !visited[qr][leftCol]) {
const n = this.cells2D[qr][leftCol];
if (n && n.clueType === 4) { visited[qr][leftCol] = true; queue.push([qr, leftCol]); }
}
if (rightCol < targetCols && !visited[qr][rightCol]) {
const n = this.cells2D[qr][rightCol];
if (n && n.clueType === 4) { visited[qr][rightCol] = true; queue.push([qr, rightCol]); }
}
}
currentGroupCells.forEach(({ node }) => { node.chainId = clusterCounter; }); clusterCounter++;
}
}
}
for (let r = 0; r < targetRows; r++) {
for (let c = 0; c < targetCols; c++) {
const cell = this.cells2D[r][c];
if (cell && cell.chainId !== null) {
const tN = (r - 1 >= 0) ? this.cells2D[r - 1][c] : null; const bN = (r + 1 < targetRows) ? this.cells2D[r + 1][c] : null;
const lN = (c - 1 >= 0) ? this.cells2D[r][c - 1] : null; const rN = (c + 1 < targetCols) ? this.cells2D[r][c + 1] : null;
if (tN && tN.chainId === cell.chainId) cell.fenceBorders.top = false; if (bN && bN.chainId === cell.chainId) cell.fenceBorders.bottom = false;
if (lN && lN.chainId === cell.chainId) cell.fenceBorders.left = false; if (rN && rN.chainId === cell.chainId) cell.fenceBorders.right = false;
cell.draw();
}
}
}
this.layoutInfo = { rows: targetRows, cols: targetCols, cellSize, gap, startX, startY };
if (!levelData || !levelData.clues) return;
if (Array.isArray(levelData.clues.top)) {
for (let c = 0; c < targetCols; c++) {
const type = levelData.clues.top[c]; if (type === 0) continue;
const columnBombs = [], columnClues = [];
for (let r = 0; r < targetRows; r++) { columnBombs.push(bombMatrix[r][c]); columnClues.push(clueMatrix[r][c]); }
const value = this.computeLineClueValue(columnBombs, columnClues, type); if (value === "") continue;
const badge = this.createClueBadge(value, type, cellSize, "top");
badge.x = startX + c * cellSize + cellSize / 2; badge.y = startY - cellSize * 0.6; this.cluesContainer.addChild(badge); this.colBadges[c] = badge;
}
}
if (Array.isArray(levelData.clues.left)) {
for (let r = 0; r < targetRows; r++) {
const type = levelData.clues.left[r]; if (type === 0) continue;
const value = this.computeLineClueValue(bombMatrix[r], clueMatrix[r], type); if (value === "") continue;
const badge = this.createClueBadge(value, type, cellSize, "left");
badge.x = startX - cellSize * 0.72; badge.y = startY + r * cellSize + cellSize / 2; this.cluesContainer.addChild(badge); this.rowBadges[r] = badge;
}
}
}

  /**
   * Fades the clues the player's marks have settled (see shared/fulfilled.js) and restores all the others.
   * fulfilled: { cells: Set of cell indexes, rows: Set, cols: Set }
   */
  applyFulfilled({ cells, rows, cols }) {
    for (const cell of this.cells) if (cell.clueType === 1 || cell.clueType === 2 || cell.clueType === 3 || cell.clueType === 6) cell.setFulfilled(cells.has(cell.index));
    const FADED = 0.38;
    this.rowBadges.forEach((badge, r) => { if (badge) badge.alpha = rows.has(r) ? FADED : 1; });
    this.colBadges.forEach((badge, c) => { if (badge) badge.alpha = cols.has(c) ? FADED : 1; });
  }
}
