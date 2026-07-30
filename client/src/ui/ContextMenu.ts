import { log } from '../debug/logger';

export type PointerIntent = 'menu' | 'pan' | 'tool';

/** Ctrl/Cmd + right opens the quick menu; plain right pans; anything else goes to the tool. */
export function classifyPointerDown(button: number, isModified: boolean): PointerIntent {
  if (button !== 2) return 'tool';
  return isModified ? 'menu' : 'pan';
}

/** One row of the quick menu. `run` fires on click, then the menu closes. */
export interface ContextMenuItem {
  readonly label: string;
  readonly hint: string;
  readonly run: () => void;
}

/**
 * Ctrl+right-click quick menu. A plain DOM popup positioned in screen pixels — deliberately not
 * a Pixi overlay, so it never participates in the camera projection and cannot drift at extreme
 * zoom. The caller owns placement; this owns open/closed state and dispatch.
 */
export class ContextMenu {
  readonly root = document.createElement('div');
  private open = false;

  constructor(items: readonly ContextMenuItem[]) {
    this.root.id = 'context-menu';
    this.root.hidden = true;
    for (const item of items) this.root.appendChild(this.buildRow(item));
    document.body.appendChild(this.root);
  }

  get isOpen(): boolean {
    return this.open;
  }

  openAt(x: number, y: number): void {
    this.root.style.left = `${x}px`;
    this.root.style.top = `${y}px`;
    this.root.hidden = false;
    this.open = true;
    log('tool', 'context menu opened', { x, y });
  }

  close(): void {
    this.root.hidden = true;
    this.open = false;
  }

  private buildRow(item: ContextMenuItem): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'context-row';
    btn.innerHTML = `<span>${item.label}</span><kbd>${item.hint}</kbd>`;
    btn.addEventListener('click', () => {
      this.close();
      item.run();
    });
    return btn;
  }
}
