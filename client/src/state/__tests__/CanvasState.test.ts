import { describe, it, expect, beforeEach } from 'vitest';
import { CanvasState } from '../CanvasState';
import type { BrushStroke } from '@shared/stroke';
import { StrokeType } from '@shared/stroke';
import { originAnchor, originBbox } from '@shared/anchor';

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
    anchor: originAnchor(),
    zIndex: 0,
    cellBbox: originBbox(),
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
    expect(result).toEqual([{ action: 'remove', strokeId: 'a' }]);
    expect(state.strokes).toHaveLength(0);
  });

  it('redo re-adds the stroke after undo', () => {
    const s = makeStroke('a');
    state.addStroke(s);
    state.undo();
    const result = state.redo();
    expect(result[0]?.action).toBe('add');
    expect(state.strokes).toHaveLength(1);
  });

  it('undo returns empty when nothing to undo', () => {
    expect(state.undo()).toEqual([]);
  });

  it('redo returns empty when at latest state', () => {
    state.addStroke(makeStroke('a'));
    expect(state.redo()).toEqual([]);
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
    expect(result[0]?.action).toBe('add');
    expect(state.strokes).toHaveLength(1);
  });

  it('replaceStrokes swaps one stroke for many in a single undo step', () => {
    state.addStroke(makeStroke('a'));
    state.replaceStrokes(['a'], [makeStroke('a1'), makeStroke('a2')]);
    expect(state.strokes.map((s) => s.id)).toEqual(['a1', 'a2']);

    const undo = state.undo();
    expect(state.strokes.map((s) => s.id)).toEqual(['a']);
    expect(undo).toEqual([
      { action: 'remove', strokeId: 'a1' },
      { action: 'remove', strokeId: 'a2' },
      { action: 'add', stroke: expect.objectContaining({ id: 'a' }) },
    ]);

    state.redo();
    expect(state.strokes.map((s) => s.id)).toEqual(['a1', 'a2']);
  });

  it('recolor changes a stroke color and undo restores it', () => {
    const s = makeStroke('a');
    s.color = { r: 10, g: 10, b: 10, a: 255 };
    state.addStroke(s);
    state.recolor('a', { r: 200, g: 0, b: 0, a: 255 });
    expect(state.strokes[0]!.color).toEqual({ r: 200, g: 0, b: 0, a: 255 });

    const undo = state.undo();
    expect(undo).toEqual([{ action: 'recolor', strokeId: 'a', color: { r: 10, g: 10, b: 10, a: 255 } }]);
    expect(state.strokes[0]!.color).toEqual({ r: 10, g: 10, b: 10, a: 255 });
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

  describe('zIndex counter', () => {
    it('assigns a strictly increasing zIndex to each new stroke', () => {
      const a = makeStroke('a');
      const b = makeStroke('b');
      const c = makeStroke('c');
      state.addStroke(a);
      state.addStroke(b);
      state.addStroke(c);
      expect(a.zIndex).toBeLessThan(b.zIndex);
      expect(b.zIndex).toBeLessThan(c.zIndex);
    });

    it('preserves (does not reassign) a stroke zIndex across undo then redo', () => {
      const a = makeStroke('a');
      state.addStroke(a);
      const original = a.zIndex;
      state.undo();
      state.redo();
      expect(a.zIndex).toBe(original); // restored, not bumped
    });

    it('keeps the counter monotone: a new draw after undo outranks the undone one', () => {
      const a = makeStroke('a');
      const b = makeStroke('b');
      state.addStroke(a);
      state.undo();       // a undone, but counter must not roll back
      state.addStroke(b); // brand new stroke
      expect(b.zIndex).toBeGreaterThan(a.zIndex);
    });

    it('does not reassign zIndex on eraser additions (they carry their own)', () => {
      const a = makeStroke('a');
      state.addStroke(a);
      const seg = makeStroke('a1');
      seg.zIndex = a.zIndex; // eraser sets segment zIndex from the original
      state.replaceStrokes(['a'], [seg]);
      expect(seg.zIndex).toBe(a.zIndex); // preserved, not overwritten
    });
  });
});
