// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { ContextMenu } from '../ContextMenu';

function menu(run = vi.fn()): { menu: ContextMenu; run: ReturnType<typeof vi.fn> } {
  return { menu: new ContextMenu([{ label: 'Brush', hint: 'B', run }]), run };
}

describe('ContextMenu', () => {
  it('starts closed', () => {
    expect(menu().menu.isOpen).toBe(false);
  });

  it('positions itself where it is opened', () => {
    const { menu: m } = menu();
    m.openAt(120, 40);
    expect(m.isOpen).toBe(true);
    expect(m.root.style.left).toBe('120px');
    expect(m.root.style.top).toBe('40px');
  });

  it('runs the item action and closes', () => {
    const { menu: m, run } = menu();
    m.openAt(0, 0);
    m.root.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(run).toHaveBeenCalledOnce();
    expect(m.isOpen).toBe(false);
  });

  it('close() is safe when already closed', () => {
    const { menu: m } = menu();
    m.close();
    expect(m.isOpen).toBe(false);
  });
});
