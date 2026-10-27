import { Graphics } from 'pixi.js';
import { GRID_CONFIG } from '../config.js';

/**
 * Drawings of the clue icons, shared by the board (cell.js, grid.js) and the menu (ui/clue-icon.js) so they always look the same.
 * Cell clues: 1 neighbor (square), 2 isolated (broken heart), 3 surrounded (face), 4 chain (dashed fence), 5 multiplier
 * (ring with a 2 inside), 6 area (paint bucket). Line clues: 1 count, 2 longest-run, 3 groups.
 */

/** A dashed line from (x1, y1) to (x2, y2). */
export function drawDashedLine(g, x1, y1, x2, y2, strokeStyle, dashLength = 4, gapLength = 4) {
  const dx = x2 - x1; const dy = y2 - y1;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const dashCount = Math.floor(distance / (dashLength + gapLength));
  const xStep = (dx / distance) * (dashLength + gapLength);
  const yStep = (dy / distance) * (dashLength + gapLength);
  const xDash = (dx / distance) * dashLength;
  const yDash = (dy / distance) * dashLength;

  for (let i = 0; i <= dashCount; i++) {
    const startX = x1 + i * xStep; const startY = y1 + i * yStep;
    if (i * (dashLength + gapLength) + dashLength <= distance) {
      g.moveTo(startX, startY).lineTo(startX + xDash, startY + yDash).stroke(strokeStyle);
    } else if (i * (dashLength + gapLength) < distance) {
      g.moveTo(startX, startY).lineTo(x2, y2).stroke(strokeStyle);
    }
  }
}

/** Icons of cell clues 1-3, centred on (cx, cy) with "radius" r. vectorColor draws the shape, eyeColor the cut-outs. */
export function drawCellClueIcon(g, code, cx, cy, r, vectorColor, eyeColor) {
      if (code === 1) {
        g.rect(cx - r, cy - r, r * 2, r * 2).stroke({ color: vectorColor, width: 2 });
      } else if (code === 2) {
        g.moveTo(cx, cy - r * 0.3).bezierCurveTo(cx - r * 0.5, cy - r * 0.9, cx - r, cy - r * 0.5, cx - r, cy - r * 0.1).bezierCurveTo(cx - r, cy + r * 0.3, cx - r * 0.5, cy + r * 0.6, cx, cy + r * 0.9).lineTo(cx, cy + r * 0.6).lineTo(cx + r * 0.15, cy + r * 0.4).lineTo(cx - r * 0.15, cy + r * 0.1).fill({ color: vectorColor });
        g.moveTo(cx, cy - r * 0.3).bezierCurveTo(cx + r * 0.5, cy - r * 0.9, cx + r, cy - r * 0.5, cx + r, cy - r * 0.1).bezierCurveTo(cx + r, cy + r * 0.3, cx + r * 0.5, cy + r * 0.6, cx, cy + r * 0.9).lineTo(cx, cy + r * 0.6).lineTo(cx + r * 0.15, cy + r * 0.4).lineTo(cx - r * 0.15, cy + r * 0.1).fill({ color: vectorColor });
        g.moveTo(cx, cy - r * 0.3).lineTo(cx - r * 0.15, cy + r * 0.1).lineTo(cx + r * 0.15, cy + r * 0.4).lineTo(cx, cy + r * 0.6).stroke({ color: eyeColor, width: 1.5 });
      } else if (code === 3) {
        g.circle(cx, cy, r).fill({ color: vectorColor }); g.circle(cx - r * 0.35, cy - r * 0.20, r * 0.12).fill({ color: eyeColor }); g.circle(cx + r * 0.35, cy - r * 0.20, r * 0.12).fill({ color: eyeColor }); g.moveTo(cx - r * 0.4, cy + r * 0.1).arc(cx, cy + r * 0.1, r * 0.4, 0, Math.PI, false).stroke({ color: eyeColor, width: 2 });
      }
}

/** Cell clue 5 (multiplier): the ring; the "2" inside is a text added by the caller. */
export function drawMultiplierRing(g, cx, cy, radius, color, width = 2.5) {
  g.circle(cx, cy, radius).stroke({ color, width });
}

/** Cell clue 6 (area): a paint bucket tipped over, paint flowing out of it. */
export function drawAreaIcon(g, cx, cy, r, vectorColor, eyeColor) {
      const R = r * 1.05;
      const ox = cx - r * 0.25, oy = cy;
      const ang = Math.PI / 6, ca = Math.cos(ang), sa = Math.sin(ang);
      const P = (x, y) => [ox + (x * ca - y * sa) * R, oy + (x * sa + y * ca) * R];   // local bucket coords -> cell coords (tilted)

      // bucket body (wider at the rim)
      g.poly([...P(-0.6, -0.5), ...P(0.6, -0.5), ...P(0.45, 0.8), ...P(-0.45, 0.8)]).fill({ color: vectorColor });
      // paint level inside, just under the rim (cut-out in the cell face colour)
      g.poly([...P(-0.6, -0.5), ...P(0.6, -0.5), ...P(0.57, -0.15), ...P(-0.57, -0.15)]).fill({ color: eyeColor });
      // handle
      const [h1x, h1y] = P(-0.6, -0.5), [h2x, h2y] = P(-0.1, -0.95), [h3x, h3y] = P(0.35, -0.5);
      g.moveTo(h1x, h1y).quadraticCurveTo(h2x, h2y - R * 0.25, h3x, h3y).stroke({ color: vectorColor, width: 1.5, cap: 'round' });
      // paint stream leaving the low corner of the rim, plus a drop
      const [lx, ly] = P(0.6, -0.5);
      const ex = lx + R * 0.45, ey = ly + R * 0.7;
      g.moveTo(lx, ly).quadraticCurveTo(lx + R * 0.45, ly + R * 0.02, ex, ey).stroke({ color: vectorColor, width: Math.max(2, R * 0.30), cap: 'round', join: 'round' });
      g.circle(ex, ey + R * 0.22, R * 0.17).fill({ color: vectorColor });
}

/** A small dashed square: the icon of chain clue 4 on its own (on the board the fence follows the outline of the whole chain). */
export function drawChainIcon(g, cx, cy, half, color) {
  const stroke = { color, width: 2.5, cap: 'round', join: 'miter' };
  const x0 = cx - half, y0 = cy - half, x1 = cx + half, y1 = cy + half;
  drawDashedLine(g, x0, y0, x1, y0, stroke, 4, 3);
  drawDashedLine(g, x1, y0, x1, y1, stroke, 4, 3);
  drawDashedLine(g, x1, y1, x0, y1, stroke, 4, 3);
  drawDashedLine(g, x0, y1, x0, y0, stroke, 4, 3);
}

/** Adds the shape of a line clue badge (codes 1-3) to `container`, centred on its origin. orientation: "top" (column) or "left" (row). */
export function addLineClueShape(container, typeCode, radius, orientation = 'top') {
  const styleSettings = GRID_CONFIG.clueStyles[typeCode];
  const mainColor = styleSettings ? styleSettings.color : 0x7f8c8d;
  const bgShape = new Graphics();
  if (typeCode === 1) {
    if (orientation === 'top') bgShape.poly([-radius, -radius * 0.8, radius, -radius * 0.8, 0, radius]);
    else bgShape.poly([-radius * 0.8, -radius, radius, 0, -radius * 0.8, radius]);
    bgShape.fill({ color: mainColor });
    container.addChild(bgShape);
  } else if (typeCode === 2) {
    const r = radius;
    bgShape.poly([-r, r * 0.6, r, r * 0.6, r, -r * 0.6, r * 0.5, r * 0.1, 0, -r * 0.8, -r * 0.5, r * 0.1, -r, -r * 0.6]);
    bgShape.fill({ color: mainColor });
    container.addChild(bgShape);
  } else if (typeCode === 3) {
    const barW = (radius * 2) / 3, barH = radius * 1.5;
    const b1 = new Graphics().rect(-radius, -barH / 2, barW - 2, barH).fill({ color: 0x7f8c8d });
    const b2 = new Graphics().rect(-radius + barW, -barH / 2, barW - 2, barH).fill({ color: GRID_CONFIG.cell.darkFace });
    const b3 = new Graphics().rect(-radius + barW * 2, -barH / 2, barW - 2, barH).fill({ color: 0x7f8c8d });
    container.addChild(b1, b2, b3);
  }
}
