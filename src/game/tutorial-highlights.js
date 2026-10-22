import { resolveHighlight } from '../../shared/tutorial.js';
import { UI_CONFIG } from '../config.js';

const colorOf = (style) => UI_CONFIG.tutorialColors[style] ?? UI_CONFIG.tutorialColors.primary;

/**
 * Draws a tutorial step's highlight on top of the board. Each item has a style (primary / secondary / bomb / safe) that sets its
 * color: strong cells get an outline (primary slightly thicker, so the main cell stands out even without color), soft cells a
 * tint, and the line clue badge of a highlighted row / column a ring. `g` is a Graphics that sits above the grid.
 */
export function drawHighlights(g, items, layoutInfo, levelData) {
  g.clear();
  if (!layoutInfo || !items?.length) return;
  const { startX, startY, cellSize: cs } = layoutInfo;
  const { width, height } = levelData.grid;
  const { strong, soft, rows, cols } = resolveHighlight(items, width, height);
  const lineWidth = (style) => (style === 'primary' ? 4 : 3);

  for (const { r, c, style } of soft) g.roundRect(startX + c * cs + 1, startY + r * cs + 1, cs - 2, cs - 2, 4).fill({ color: colorOf(style), alpha: 0.33 });
  for (const { r, c, style } of strong) {
    const x = startX + c * cs + 1.5, y = startY + r * cs + 1.5;
    g.roundRect(x, y, cs - 3, cs - 3, 5).fill({ color: colorOf(style), alpha: 0.14 });
    g.roundRect(x, y, cs - 3, cs - 3, 5).stroke({ color: colorOf(style), width: lineWidth(style) });
  }
  const ring = (x, y, style) => g.circle(x, y, cs * 0.56).stroke({ color: colorOf(style), width: lineWidth(style) });
  for (const { index, style } of rows) if (levelData.clues?.left?.[index]) ring(startX - cs * 0.72, startY + index * cs + cs / 2, style);
  for (const { index, style } of cols) if (levelData.clues?.top?.[index]) ring(startX + index * cs + cs / 2, startY - cs * 0.6, style);
}
