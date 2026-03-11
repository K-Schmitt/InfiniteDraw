import { describe, it, expect, beforeEach } from 'vitest';
import { CanvasState } from '../CanvasState';
import type { BrushStroke } from '@shared/stroke';
import { StrokeType } from '@shared/stroke';

function makeStroke(id: string): BrushStroke {
  return {
    id,
    type: StrokeType.BRUSH,
    color: { r: 0, g: 0, b: 0, a: 255 },
    size: 8,
    points: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
    pressures: [0.5, 0.8],
    layerId: 'default',
    createdAt: Date.now(),
  };
}

describe('CanvasState', () => {
  let state: CanvasState;

  beforeEach(() => {
    state = new CanvasState();
  });

  it('starts empty', () => {
    expect(state.strokes).toHaveLength(0);
    expect(state.canUndo).toBe(false);
    expect(state.canRedo).toBe(false);
  });

  it('addStroke appends and enables undo', () => {
    state.addStroke(makeStroke('a'));
    expect(state.strokes).toHaveLength(1);
    expect(state.canUndo).toBe(true);
    expect(state.canRedo).toBe(false);
  });

  it('undo removes the last added stroke', () => {
    state.addStroke(makeStroke('a'));
    const result = state.undo();
    expect(result).toEqual({ action: 'remove', strokeId: 'a' });
    expect(state.strokes).toHaveLength(0);
  });

  it('redo re-adds the stroke after undo', () => {
    const s = makeStroke('a');
    state.addStroke(s);
    state.undo();
    const result = state.redo();
    expect(result?.action).toBe('add');
    expect(state.strokes).toHaveLength(1);
  });

  it('undo returns undefined when nothing to undo', () => {
    expect(state.undo()).toBeUndefined();
  });

  it('redo returns undefined when at latest state', () => {
    state.addStroke(makeStroke('a'));
    expect(state.redo()).toBeUndefined();
  });

  it('new action after undo truncates redo history', () => {
    state.addStroke(makeStroke('a'));
    state.addStroke(makeStroke('b'));
    state.undo(); // undo 'b'
    state.addStroke(makeStroke('c')); // new action
    expect(state.canRedo).toBe(false);
    expect(state.strokes.map((s) => s.id)).toEqual(['a', 'c']);
  });

  it('deleteStroke removes by id and enables undo', () => {
    state.addStroke(makeStroke('a'));
    state.addStroke(makeStroke('b'));
    state.deleteStroke('a');
    expect(state.strokes.map((s) => s.id)).toEqual(['b']);
    expect(state.canUndo).toBe(true);
  });

  it('undo of delete restores the stroke', () => {
    state.addStroke(makeStroke('a'));
    state.deleteStroke('a');
    const result = state.undo();
    expect(result?.action).toBe('add');
    expect(state.strokes).toHaveLength(1);
  });

  it('multiple undo/redo cycles are consistent', () => {
    state.addStroke(makeStroke('a'));
    state.addStroke(makeStroke('b'));
    state.undo();
    state.undo();
    expect(state.strokes).toHaveLength(0);
    state.redo();
    state.redo();
    expect(state.strokes).toHaveLength(2);
  });
});
