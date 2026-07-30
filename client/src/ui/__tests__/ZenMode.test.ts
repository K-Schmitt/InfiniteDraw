// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { ZenMode } from '../ZenMode';

let root: HTMLElement;

beforeEach(() => {
  root = document.createElement('div');
});

describe('ZenMode', () => {
  it('starts visible', () => {
    expect(new ZenMode(root).isHidden).toBe(false);
    expect(root.classList.contains('zen')).toBe(false);
  });

  it('toggles the chrome-hidden class', () => {
    const zen = new ZenMode(root);
    expect(zen.toggle()).toBe(true);
    expect(root.classList.contains('zen')).toBe(true);
    expect(zen.toggle()).toBe(false);
    expect(root.classList.contains('zen')).toBe(false);
  });

  it('show() is idempotent and always restores the chrome', () => {
    const zen = new ZenMode(root);
    zen.toggle();
    zen.show();
    zen.show();
    expect(zen.isHidden).toBe(false);
    expect(root.classList.contains('zen')).toBe(false);
  });
});
