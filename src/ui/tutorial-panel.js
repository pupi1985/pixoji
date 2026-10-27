import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import { createTextButton } from './widgets.js';
import { UI_CONFIG } from '../config.js';

const MARGIN = 8, PAD = 14;

/**
 * The tutorial text box docked at the bottom of the screen, with a back arrow, the step counter, Skip and Next.
 * show({ text, index, count, canGoBack, showNext, last }) redraws it; resize(w, h, height) positions it.
 */
export class TutorialPanel extends Container {
  /** callbacks: { onBack(), onNext(), onSkip() } */
  constructor(callbacks) {
    super();
    this.callbacks = callbacks;
    this.visible = false;
    this.eventMode = 'static';   // taps on the panel must not reach the board or the "tap to continue" layer below it
    this.state = null;
    this.w = 0; this.h = 0; this.panelHeight = 0;
  }

  resize(w, h, panelHeight) {
    this.w = w; this.h = h; this.panelHeight = panelHeight;
    this.position.set(0, h - panelHeight);
    this.hitArea = new Rectangle(0, 0, w, panelHeight);
    if (this.visible) this.build();
  }

  /**
   * The panel height that fits the longest of `texts` at the normal font size (so it stays the same on every step and the board
   * does not jump), within a fraction of the screen; longer texts shrink their font instead.
   */
  heightFor(texts, w, h) {
    const btnH = UI_CONFIG.buttonSize, textW = w - 2 * (MARGIN + PAD);
    let tallest = 0;
    for (const text of texts) {
      const t = new Text({ text, style: { fontFamily: 'Arial', fontSize: 18, fill: 0xffffff, wordWrap: true, wordWrapWidth: textW, lineHeight: 18 * 1.3 } });
      tallest = Math.max(tallest, t.height);
      t.destroy();
    }
    const needed = (PAD - 2) + tallest + 8 + btnH + PAD / 2 + MARGIN;
    return Math.round(Math.min(Math.max(110, needed), Math.max(110, h * (h < 480 ? 0.4 : 0.42))));
  }

  show(state) {
    this.state = state;
    this.visible = true;
    this.build();
  }

  hide() {
    this.visible = false;
    this.state = null;
  }

  build() {
    // removed now, destroyed after the current event (a tap on one of this panel's own buttons often triggers the redraw)
    const old = this.removeChildren();
    queueMicrotask(() => old.forEach((child) => child.destroy({ children: true })));
    const s = this.state;
    if (!s || !this.w) return;
    const { w, panelHeight: H } = this;
    const btnH = UI_CONFIG.buttonSize;

    this.addChild(new Graphics().roundRect(MARGIN, 0, w - 2 * MARGIN, H - MARGIN, 14).fill({ color: 0x2b2d3a, alpha: 0.97 }).stroke({ color: 0xffc400, width: 2 }));

    // Buttons row. Left: back and next/close side by side, then the step counter. Far right: Skip, kept away from them so it is
    // not hit by mistake. On the last step the primary button reads "Close" and ends the tutorial, so Skip would be a duplicate and is
    // left out; if the last step ends by itself (it waits for the player to solve the level) there is no primary button and the far
    // button becomes "Close".
    const rowY = H - MARGIN - PAD / 2 - btnH;
    const backW = 46, primaryW = 100, farW = 62, gap = 8;
    let x = MARGIN + PAD;
    const back = createTextButton({ label: '◀', width: backW, height: btnH, color: UI_CONFIG.navColor, hoverColor: UI_CONFIG.navHoverColor, onTap: () => this.callbacks.onBack?.() });
    back.position.set(x, rowY);
    back.setEnabled(s.canGoBack);
    this.addChild(back);
    x += backW + gap;

    if (s.showNext) {
      const primary = createTextButton({ label: s.last ? 'Close ✓' : 'Next ▶', width: primaryW, height: btnH, color: 0x16a085, hoverColor: 0x1abc9c, onTap: () => this.callbacks.onNext?.() });
      primary.position.set(x, rowY);
      this.addChild(primary);
      x += primaryW;
    }

    if (!(s.showNext && s.last)) {
      const far = createTextButton({ label: s.last ? 'Close' : 'Skip', width: farW, height: btnH, color: 0x555a6e, hoverColor: 0x6d7390, fontSize: 14, onTap: () => this.callbacks.onSkip?.() });
      far.position.set(w - MARGIN - PAD - farW, rowY);
      this.addChild(far);
    }

    const counter = new Text({ text: `${s.index + 1} / ${s.count}`, style: { fontFamily: 'Arial', fontSize: 13, fill: 0x9a9db0 } });
    counter.anchor.set(0, 0.5);
    counter.position.set(x + 14, rowY + btnH / 2);
    this.addChild(counter);

    // text: as large as fits above the buttons
    const textW = w - 2 * (MARGIN + PAD), avail = rowY - PAD - 8;
    let size = 18, text;
    for (;;) {
      text = new Text({ text: s.text, style: { fontFamily: 'Arial', fontSize: size, fill: 0xffffff, wordWrap: true, wordWrapWidth: textW, lineHeight: size * 1.3 } });
      if (text.height <= avail || size <= 12) break;
      text.destroy();
      size -= 1;
    }
    text.position.set(MARGIN + PAD, PAD - 2);
    this.addChild(text);
  }
}
