import type { BrushStroke } from '@shared/stroke.js';

export interface BatchOrderContext {
  readonly nextZ: number;
  readonly ownerId: string;
}

export interface OrderedBatch {
  readonly strokes: BrushStroke[];
  readonly nextZ: number;
}

/**
 * Stamps a batch with authoritative paint order and ownership. The server owns `zIndex` so every
 * client agrees on the stacking of an eraser gesture's remnants; a batch gets one contiguous
 * block so the remnants of a single stroke can never be interleaved with another user's edit.
 */
export function applyBatchOrder(
  strokes: readonly BrushStroke[],
  context: BatchOrderContext,
): OrderedBatch {
  let z = context.nextZ;
  const out: BrushStroke[] = [];
  for (const stroke of strokes) {
    out.push({ ...stroke, zIndex: z, ownerId: context.ownerId });
    z++;
  }
  return { strokes: out, nextZ: z };
}
