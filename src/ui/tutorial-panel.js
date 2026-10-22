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

    // buttons row: back | step counter | skip | next
    const rowY = H - MARGIN - PAD / 2 - btnH;
    const back = createTextButton({ label: '◀', width: 46, height: btnH, color: UI_CONFIG.navColor, hoverColor: UI_CONFIG.navHoverColor, onTap: () => this.callbacks.onBack?.() });
    back.position.set(MARGIN + PAD, rowY);
    back.setEnabled(s.canGoBack);
    this.addChild(back);

    const nextW = 96, skipW = 60;
    let right = w - MARGIN - PAD;
    if (s.showNext) {
      const next = createTextButton({ label: s.last ? 'Got it ✓' : 'Next ▶', width: nextW, height: btnH, color: 0x16a085, hoverColor: 0x1abc9c, onTap: () => this.callbacks.onNext?.() });
      right -= nextW;
      next.position.set(right, rowY);
      this.addChild(next);
      right -= 8;
    }
    const skip = createTextButton({ label: 'Skip', width: skipW, height: btnH, color: 0x555a6e, hoverColor: 0x6d7390, fontSize: 14, onTap: () => this.callbacks.onSkip?.() });
    right -= skipW;
    skip.position.set(right, rowY);
    this.addChild(skip);

    const counter = new Text({ text: `${s.index + 1} / ${s.count}`, style: { fontFamily: 'Arial', fontSize: 13, fill: 0x9a9db0 } });
    counter.anchor.set(0, 0.5);
    counter.position.set(MARGIN + PAD + 46 + 10, rowY + btnH / 2);
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
