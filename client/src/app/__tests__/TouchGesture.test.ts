import { describe, it, expect } from 'vitest';
import { TouchGesture, type GestureStep } from '../TouchGesture';

/**
 * Real fingers move one pointer event at a time, and every event rebases the reference centroid,
 * so a two-finger motion arrives as two partial steps. Callers apply them in sequence; a test
 * asserting the whole motion has to sum them the same way.
 */
function total(steps: readonly (GestureStep | null)[]): GestureStep {
  const sum = { dx: 0, dy: 0, zoomLog2: 0, pivotX: 0, pivotY: 0 };
  for (const step of steps) {
    if (!step) continue;
    sum.dx += step.dx;
    sum.dy += step.dy;
    sum.zoomLog2 += step.zoomLog2;
    sum.pivotX = step.pivotX;
    sum.pivotY = step.pivotY;
  }
  return sum;
}

describe('TouchGesture', () => {
  it('stays inactive with a single finger so the tool keeps drawing', () => {
    const gesture = new TouchGesture();
    expect(gesture.start(1, 100, 100)).toBe(false);
    expect(gesture.isActive).toBe(false);
    expect(gesture.isBlockingTools).toBe(false);
    expect(gesture.move(1, 120, 100)).toBeNull();
  });

  it('promotes to a camera gesture on the second finger', () => {
    const gesture = new TouchGesture();
    gesture.start(1, 100, 100);
    expect(gesture.start(2, 200, 100)).toBe(true);
    expect(gesture.isActive).toBe(true);
    expect(gesture.isBlockingTools).toBe(true);
  });

  it('reports centroid translation as pan with no zoom', () => {
    const gesture = new TouchGesture();
    gesture.start(1, 100, 100);
    gesture.start(2, 200, 100);
    const step = total([gesture.move(1, 110, 130), gesture.move(2, 210, 130)]);
    expect(step.dx).toBeCloseTo(10);
    expect(step.dy).toBeCloseTo(30);
    expect(step.zoomLog2).toBeCloseTo(0);
  });

  it('reports a doubled spread as +1 log2 zoom about the centroid', () => {
    const gesture = new TouchGesture();
    gesture.start(1, 100, 100);
    gesture.start(2, 200, 100);
    const step = total([gesture.move(1, 50, 100), gesture.move(2, 250, 100)]);
    expect(step.zoomLog2).toBeCloseTo(1);
    expect(step.pivotX).toBeCloseTo(150);
    expect(step.pivotY).toBeCloseTo(100);
    expect(step.dx).toBeCloseTo(0);
  });

  it('emits no jump when a third finger lands mid-gesture', () => {
    const gesture = new TouchGesture();
    gesture.start(1, 100, 100);
    gesture.start(2, 200, 100);
    expect(gesture.start(3, 300, 400)).toBe(false);
    const step = gesture.move(3, 300, 400);
    expect(step?.dx).toBeCloseTo(0);
    expect(step?.dy).toBeCloseTo(0);
    expect(step?.zoomLog2).toBeCloseTo(0);
  });

  it('keeps blocking tools while a finger remains after the gesture', () => {
    const gesture = new TouchGesture();
    gesture.start(1, 100, 100);
    gesture.start(2, 200, 100);
    gesture.end(2);
    expect(gesture.isActive).toBe(false);
    expect(gesture.isBlockingTools).toBe(true);
    expect(gesture.move(1, 300, 100)).toBeNull();
    gesture.end(1);
    expect(gesture.isBlockingTools).toBe(false);
  });

  it('ignores moves from untracked pointers', () => {
    const gesture = new TouchGesture();
    gesture.start(1, 100, 100);
    gesture.start(2, 200, 100);
    expect(gesture.move(9, 0, 0)).toBeNull();
  });

  it('clear() drops every finger', () => {
    const gesture = new TouchGesture();
    gesture.start(1, 100, 100);
    gesture.start(2, 200, 100);
    gesture.clear();
    expect(gesture.isActive).toBe(false);
    expect(gesture.isBlockingTools).toBe(false);
  });
});
