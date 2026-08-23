import type { BrushStroke } from '@shared/stroke.js';

export interface BatchOrderContext {
  readonly nextZ: number;
  readonly ownerId: string;
  /** Real Better Auth userId of the socket that sent the batch, stamped onto every add. */
  readonly authorId?: string;
  /**
   * Restore each stroke to the paint slot it already held instead of stamping a fresh block.
   * Set for undo/redo re-adds, never for the eraser: a redone stroke belongs where it was, while
   * an eraser gesture's remnants are genuinely new geometry that belongs on top.
   */
  readonly preserveOrder?: boolean;
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
  // authorId must be exactly the caller's verdict (`context.authorId`): `...stroke` alone would
  // let a client-supplied authorId survive from the incoming wire payload, so it's stripped
  // here before the authoritative stamp (or absence of one) is applied.
  const authorStamp = context.authorId !== undefined ? { authorId: context.authorId } : {};
  for (const stroke of strokes) {
    const restored = context.preserveOrder && isIssuedOrder(stroke.zIndex, context.nextZ);
    const { authorId: _forgedAuthorId, ...rest } = stroke;
    out.push({
      ...rest,
      zIndex: restored ? stroke.zIndex : z++,
      ownerId: context.ownerId,
      ...authorStamp,
    });
  }
  return { strokes: out, nextZ: z };
}

/**
 * True when `zIndex` is one this server actually handed out. Every assigned slot sits below the
 * running counter, so a value at or above it was never issued here — stale, forged or corrupted —
 * and must not steer paint order. Ownership is never restored this way: `ownerId` stays
 * server-stamped, as `BrushStroke` documents.
 */
function isIssuedOrder(zIndex: number, nextZ: number): boolean {
  return Number.isInteger(zIndex) && zIndex >= 0 && zIndex < nextZ;
}
