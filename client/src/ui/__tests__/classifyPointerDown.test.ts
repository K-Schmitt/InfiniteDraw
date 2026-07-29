import { describe, it, expect } from 'vitest';
import { classifyPointerDown } from '../ContextMenu';

describe('classifyPointerDown', () => {
  it('classifies ctrl/cmd + right-click as opening the menu', () => {
    expect(classifyPointerDown(2, true)).toBe('menu');
  });

  it('classifies plain right-click as panning', () => {
    expect(classifyPointerDown(2, false)).toBe('pan');
  });

  it('classifies a modified left-click as going to the tool', () => {
    expect(classifyPointerDown(0, true)).toBe('tool');
  });

  it('classifies a plain left-click as going to the tool', () => {
    expect(classifyPointerDown(0, false)).toBe('tool');
  });
});
