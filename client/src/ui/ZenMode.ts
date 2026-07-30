import { log } from '../debug/logger';

const HIDDEN_CLASS = 'zen';

/**
 * Distraction-free mode: hides every piece of chrome (toolbar, HUD, help legend) by putting one
 * class on the document root, so the canvas fills the screen. Styling lives in `toolbar.css` —
 * this owns only the state, which keeps it testable without a renderer.
 */
export class ZenMode {
  private hidden = false;

  constructor(private readonly root: HTMLElement) {}

  get isHidden(): boolean {
    return this.hidden;
  }

  /** Flips the mode; returns the new hidden state. */
  toggle(): boolean {
    this.hidden = !this.hidden;
    this.root.classList.toggle(HIDDEN_CLASS, this.hidden);
    log('life', 'zen mode', { hidden: this.hidden });
    return this.hidden;
  }

  /** Restores the chrome unconditionally (Escape, or before a modal interaction). */
  show(): void {
    this.hidden = false;
    this.root.classList.remove(HIDDEN_CLASS);
  }
}
