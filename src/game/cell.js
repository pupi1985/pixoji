import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { APP_CONFIG, GRID_CONFIG } from '../config.js';
import { drawAreaIcon, drawCellClueIcon, drawDashedLine, drawMultiplierRing } from './clue-icons.js';

/**
 * Robust cell container rendering icons, text, and custom fences persistently across ALL interaction states.
 */
export class GridCell extends Container {
  constructor(size, gap, palette, onActivate) {
    super();
    this.size = size;
    this.gap = gap;
    this.palette = palette;
    this.onActivate = onActivate;
    this.state = 0;
    this.index = -1;   // position in the grid's row-major cell list (set by ButtonGrid)
    this.hasBomb = false; 
    this.isClueCell = false; 
    this.clueType = 0; 
    this.clueValueRaw = ""; 
    this.clueTextNode = null; 

    this.chainId = null; 
    this.fenceBorders = { top: true, bottom: true, left: true, right: true };

    this.art = new Graphics();
    this.addChild(this.art);

    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.hitArea = { contains: (x, y) => x >= 0 && y >= 0 && x <= size && y <= size };

    this.on('pointerdown', (event) => {
      this.onActivate?.(this, event);
    });

    this.draw();
  }

  setState(nextState) {
    this.state = nextState;
    this.updateClueTextDisplay();
    this.draw();
  }

  setCellClueText(value, clueType) {
    this.clueValueRaw = value;
    this.clueType = clueType;
    this.isClueCell = (value !== undefined && value !== null && value !== "" && clueType) || clueType === 4 || clueType === 5;

    this.updateClueTextDisplay();
    this.draw(); 
  }

  updateClueTextDisplay() {
    if (this.clueTextNode) {
      this.removeChild(this.clueTextNode);
      this.clueTextNode = null;
    }

    if (!this.isClueCell || this.clueType === 4) return;
    const isMult = this.clueType === 5;
    if (!isMult && this.clueValueRaw === "") return;

    // Solo el click izquierdo (State 1) vuelve el texto blanco. El click derecho (State 2) y el normal (State 0) usan texto oscuro.
    const textConfig = (this.state === 1) ? GRID_CONFIG.cellClueTextPainted : GRID_CONFIG.cellClueText;
    const labelStyle = new TextStyle({
      ...textConfig,
      fontSize: isMult ? Math.max(12, Math.floor(this.size * 0.36)) : Math.max(12, Math.floor(this.size * 0.40))
    });

    this.clueTextNode = new Text({ text: isMult ? '2' : `${this.clueValueRaw}`, style: labelStyle });
    if (isMult) {
      // the "2" sits in the middle of the circle drawn in draw()
      this.clueTextNode.anchor.set(0.5);
      this.clueTextNode.x = this.size / 2;
      this.clueTextNode.y = this.size / 2 + 1;
    } else {
      this.clueTextNode.x = (this.size - this.clueTextNode.width) / 2;
      this.clueTextNode.y = this.size * 0.51;
    }

    this.addChild(this.clueTextNode);
  }

  drawDashedLine(g, x1, y1, x2, y2, strokeStyle, dashLength = 4, gapLength = 4) {
    drawDashedLine(g, x1, y1, x2, y2, strokeStyle, dashLength, gapLength);
  }

  draw() {
    const { face, topLeft, bottomRight, darkFace, darkTopLeft, darkBottomRight, pressedFace, pressedTopLeft, pressedBottomRight, hintFace } = this.palette;
    const g = this.art; const s = this.size;
    const bevel = Math.max(2, Math.round(s * 0.09));
    g.clear();

    let f = this.isClueCell ? hintFace : face;
    let tl = topLeft; let br = bottomRight;
    
    if (this.state === 1) { 
      f = darkFace; tl = darkTopLeft; br = darkBottomRight; 
    } else if (this.state === 2) { 
      f = pressedFace; tl = pressedTopLeft; br = pressedBottomRight; 
    }

    // 1. Dibujar estructura biselada exterior
    g.roundRect(0, 0, s, s, Math.max(2, s * 0.045)).fill(f);
    g.poly([0, s, 0, 0, s, 0, s - bevel, bevel, bevel, bevel, bevel, s - bevel]).fill(tl);
    g.poly([s, 0, s, s, 0, s, bevel, s - bevel, s - bevel, s - bevel, s - bevel, bevel]).fill(br);

    // 2. Dibujar la cara interna
    g.roundRect(bevel, bevel, s - 2 * bevel, s - 2 * bevel, 1).fill(f);

    // FIX: El color de los vectores SOLO cambia a blanco en el State 1 (click izquierdo morado). En State 0 y State 2 (click derecho) se mantiene el azul/gris oscuro original.
    let vectorColor = 0x2c3e50;
    if (this.state === 1) {
      vectorColor = 0xffffff;
    }
    
    const eyeColor = (this.state === 1) ? darkFace : (this.state === 2 ? pressedFace : f);
    const cx = s / 2; const cy = s * 0.35; const r = s * 0.20;

    // --- ICONOS DE LAS PISTAS (TIPOS 1 A 3) ---
    // --- ICONOS DE LAS PISTAS (TIPOS 1 A 3) ---
    if (this.isClueCell && this.clueType <= 3) drawCellClueIcon(g, this.clueType, cx, cy, r, vectorColor, eyeColor);

    // --- CERCAS PERIMETRALES (TIPO 4) ---
    if (this.clueType === 4) {
      const inset = 5; const borderW = s - 2 * inset;
      const fenceStroke = { color: vectorColor, width: 2.5, cap: 'round', join: 'miter' };
      const dash = 4; const gap = 4;

      if (this.fenceBorders.top)    this.drawDashedLine(g, inset, inset, inset + borderW, inset, fenceStroke, dash, gap);
      if (this.fenceBorders.bottom) this.drawDashedLine(g, inset, inset + borderW, inset + borderW, inset + borderW, fenceStroke, dash, gap);
      if (this.fenceBorders.left)   this.drawDashedLine(g, inset, inset, inset, inset + borderW, fenceStroke, dash, gap);
      if (this.fenceBorders.right)  this.drawDashedLine(g, inset + borderW, inset, inset + borderW, inset + borderW, fenceStroke, dash, gap);
    }

    // --- MULTIPLICADOR (TIPO 5): circle with a "2" inside (the "2" is the text node) ---
    if (this.clueType === 5) drawMultiplierRing(g, s / 2, s / 2, s * 0.30, vectorColor);

    // --- ÁREA CONTIGUA (TIPO 6): paint bucket tipped over, paint flowing out of it ---
    if (this.clueType === 6) drawAreaIcon(g, cx, cy, r, vectorColor, eyeColor);

    if (this.hasBomb && APP_CONFIG.showBombs) {
      g.circle(s / 2, s / 2, s * 0.12).fill({ color: 0xc0392b });
    }
    
    if (this.clueTextNode) this.addChild(this.clueTextNode);
  }
}
