import { Container, Graphics, Text } from 'pixi.js';
import { GRID_CONFIG } from '../config.js';
import { addLineClueShape, drawAreaIcon, drawCellClueIcon, drawChainIcon, drawMultiplierRing } from '../game/clue-icons.js';

const INK = 0x2c3e50;

/**
 * A small chip with the icon of a clue, drawn the way it looks on the board: a light "cell" for in-grid clues, the dark game
 * background for the coloured line-clue badges. clue = { kind: 'cell' | 'line', code }. Returns a square Container of `size`.
 */
export function createClueIcon(clue, size) {
  const chip = new Container();
  const face = clue.kind === 'cell' ? GRID_CONFIG.cell.hintFace : GRID_CONFIG.background;
  chip.addChild(new Graphics().roundRect(0, 0, size, size, size * 0.2).fill({ color: face }).stroke({ color: 0xffffff, width: 1, alpha: 0.55 }));
  const c = size / 2;
  const g = new Graphics();
  chip.addChild(g);
  if (clue.kind === 'line') {
    const shape = new Container();
    shape.position.set(c, c);
    addLineClueShape(shape, clue.code, size * 0.34, 'top');
    chip.addChild(shape);
  } else if (clue.code <= 3) {
    drawCellClueIcon(g, clue.code, c, c, size * 0.27, INK, face);
  } else if (clue.code === 4) {
    drawChainIcon(g, c, c, size * 0.27, INK);
  } else if (clue.code === 5) {
    drawMultiplierRing(g, c, c, size * 0.31, INK, Math.max(1.5, size * 0.07));
    const two = new Text({ text: '2', style: { fontFamily: 'Arial', fontSize: Math.round(size * 0.44), fontWeight: 'bold', fill: INK } });
    two.anchor.set(0.5);
    two.position.set(c, c + 0.5);
    chip.addChild(two);
  } else if (clue.code === 6) {
    drawAreaIcon(g, c, c - size * 0.05, size * 0.27, INK, face);
  }
  return chip;
}
