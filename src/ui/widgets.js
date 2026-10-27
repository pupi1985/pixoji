import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import { UI_CONFIG } from '../config.js';

const dispose = (container) => container.removeChildren().forEach((child) => child.destroy({ children: true }));

/** Adds enable/disable behaviour to a button container. */
function makeToggleable(btn) {
  btn.enabled = true;
  btn.setEnabled = (on) => {
    btn.enabled = on;
    btn.alpha = on ? 1 : 0.35;
    btn.eventMode = on ? 'static' : 'none';
    btn.cursor = on ? 'pointer' : 'default';
  };
}

/** Rounded rectangle button with a centred label. */
export function createTextButton({ label, width, height = UI_CONFIG.buttonSize, color, hoverColor = color, fontSize = 16, radius = 10, onTap }) {
  const btn = new Container();
  const bg = new Graphics();
  const paint = (c) => bg.clear().roundRect(0, 0, width, height, radius).fill({ color: c });
  paint(color);
  const text = new Text({ text: label, style: { fontFamily: 'Arial', fontSize, fontWeight: 'bold', fill: 0xffffff } });
  text.anchor.set(0.5);
  text.position.set(width / 2, height / 2);
  btn.addChild(bg, text);

  btn.eventMode = 'static';
  btn.cursor = 'pointer';
  btn.hitArea = new Rectangle(0, 0, width, height);
  btn.on('pointerover', (e) => { if (e.pointerType === 'mouse') paint(hoverColor); });
  btn.on('pointerout', () => paint(color));
  btn.on('pointertap', () => onTap?.());
  btn.setLabel = (label) => { text.text = label; };
  makeToggleable(btn);
  return btn;
}

/** Circular button; drawIcon(graphics, size) draws the icon on top of the coloured disc. */
export function createIconButton({ size = UI_CONFIG.buttonSize, color, hoverColor = color, drawIcon, onTap }) {
  const btn = new Container();
  const bg = new Graphics();
  const paint = (c) => bg.clear().circle(size / 2, size / 2, size / 2).fill({ color: c });
  paint(color);
  const icon = new Graphics();
  drawIcon(icon, size);
  btn.addChild(bg, icon);

  btn.eventMode = 'static';
  btn.cursor = 'pointer';
  btn.hitArea = new Rectangle(0, 0, size, size);
  btn.on('pointerover', (e) => { if (e.pointerType === 'mouse') paint(hoverColor); });
  btn.on('pointerout', () => paint(color));
  btn.on('pointertap', () => onTap?.());
  makeToggleable(btn);
  return btn;
}

/**
 * A 270-degree circular arrow with its head at the end of the arc.
 * clockwise = true gives the "redo" arrow, false the mirrored "undo" arrow.
 */
export function drawCircularArrow(g, cx, cy, r, { clockwise = true, color = 0xffffff, width = 3.2 } = {}) {
  const f = clockwise ? 1 : -1;
  const a0 = -Math.PI * 0.4, a1 = a0 + Math.PI * 1.5;
  const point = (a) => [cx + f * r * Math.cos(a), cy + r * Math.sin(a)];

  const steps = 28;
  for (let i = 0; i <= steps; i++) {
    const [x, y] = point(a0 + ((a1 - a0) * i) / steps);
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.stroke({ color, width, cap: 'round', join: 'round' });

  const [ex, ey] = point(a1);
  const tLen = Math.hypot(-f * r * Math.sin(a1), r * Math.cos(a1));
  const tx = (-f * r * Math.sin(a1)) / tLen, ty = (r * Math.cos(a1)) / tLen;   // direction of travel
  const nx = f * Math.cos(a1), ny = Math.sin(a1);                              // radial direction
  const head = r * 0.8;
  g.poly([
    ex + nx * head * 0.75, ey + ny * head * 0.75,
    ex - nx * head * 0.75, ey - ny * head * 0.75,
    ex + tx * head * 1.1, ey + ty * head * 1.1,
  ]).fill({ color });
}

/** Modal yes/no dialog. open({ title, message, confirmLabel, cancelLabel, confirmColor, onConfirm, onCancel }). */
export class ConfirmDialog extends Container {
  constructor() {
    super();
    this.visible = false;
    this.eventMode = 'static';
    this.cfg = null;
    this.w = 0;
    this.h = 0;
  }

  open(cfg) {
    this.cfg = cfg;
    this.visible = true;
    this.build();
  }

  /** Hides the dialog; its pieces are released the next time it is built. */
  close() {
    this.visible = false;
    this.cfg = null;
  }

  cancel() { const cb = this.cfg?.onCancel; this.close(); cb?.(); }
  confirm() { const cb = this.cfg?.onConfirm; this.close(); cb?.(); }

  resize(w, h) {
    this.w = w;
    this.h = h;
    this.hitArea = new Rectangle(0, 0, w, h);
    if (this.visible) this.build();
  }

  build() {
    dispose(this);
    const { w, h, cfg } = this;
    if (!cfg || !w || !h) return;
    const d = UI_CONFIG.dialog;

    // the overlay swallows every pointer event so nothing underneath can be touched
    const overlay = new Graphics().rect(0, 0, w, h).fill({ color: 0x000000, alpha: d.overlayAlpha });
    overlay.eventMode = 'static';
    overlay.on('pointerdown', (e) => e.stopPropagation());
    this.addChild(overlay);

    const pw = Math.min(d.maxWidth, w - 32), pad = 20, gap = 14;
    const title = new Text({ text: cfg.title, style: { fontFamily: 'Arial', fontSize: 22, fontWeight: 'bold', fill: 0xffffff } });
    const message = new Text({ text: cfg.message, style: { fontFamily: 'Arial', fontSize: 15, fill: 0xd0d2d9, wordWrap: true, wordWrapWidth: pw - 2 * pad, lineHeight: 21 } });
    const btnH = UI_CONFIG.buttonSize, btnW = (pw - 2 * pad - gap) / 2;
    const ph = pad + title.height + gap + message.height + gap * 1.5 + btnH + pad;
    const px = Math.floor((w - pw) / 2), py = Math.floor((h - ph) / 2);

    const panel = new Container();
    panel.position.set(px, py);
    panel.addChild(new Graphics().roundRect(0, 0, pw, ph, 16).fill({ color: d.panelColor }).stroke({ color: d.borderColor, width: 2 }));
    title.position.set(pad, pad);
    message.position.set(pad, pad + title.height + gap);
    const by = ph - pad - btnH;
    const cancelBtn = createTextButton({ label: cfg.cancelLabel ?? 'Cancel', width: btnW, color: UI_CONFIG.navColor, hoverColor: UI_CONFIG.navHoverColor, onTap: () => this.cancel() });
    const okBtn = createTextButton({ label: cfg.confirmLabel ?? 'OK', width: btnW, color: cfg.confirmColor ?? UI_CONFIG.resetColor, onTap: () => this.confirm() });
    cancelBtn.position.set(pad, by);
    okBtn.position.set(pad + btnW + gap, by);
    panel.addChild(title, message, cancelBtn, okBtn);
    this.addChild(panel);
  }
}
