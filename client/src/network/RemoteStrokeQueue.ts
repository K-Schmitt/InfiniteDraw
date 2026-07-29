import type { BrushStroke } from '@shared/stroke';

/** A pending remote mutation, coalesced per stroke id until the next flush. */
type PendingOp =
  | { readonly kind: 'add'; readonly stroke: BrushStroke }
  | { readonly kind: 'delete' };

/** Applies a coalesced op to state + renderer. Runs inside the frame's time budget. */
export interface RemoteOpSink {
  hasStroke(id: string): boolean;
  applyAdd(stroke: BrushStroke): void;
  applyDelete(id: string): void;
}

/**
 * Buffers remote stroke ops so a peer's flood can't block the local main thread. Two defences:
 *
 * 1. **Coalesce before flush.** An `add` then `delete` of the same id inside one un-flushed batch
 *    cancel each other — no Graphics is ever built for a stroke that's already gone. Eraser
 *    remnants (fresh id, added then re-erased a step later) are the common case; this removes the
 *    work, it doesn't merely spread it across frames.
 * 2. **Time budget, not op count.** `flush` drains only until a wall-clock budget elapses, so a
 *    1000-op arrival becomes a few ms per frame and the local user's own drawing stays fluid.
 */
export class RemoteStrokeQueue {
  private readonly pending = new Map<string, PendingOp>();

  constructor(private readonly sink: RemoteOpSink) {}

  enqueueAdd(stroke: BrushStroke): void {
    this.pending.set(stroke.id, { kind: 'add', stroke });
  }

  enqueueDelete(id: string): void {
    const prior = this.pending.get(id);
    // A queued add that never reached state cancels with this delete: the stroke was born and died
    // inside one batch, so skip building it entirely. If the stroke IS already committed (own echo
    // or an earlier batch), the delete is real and must run.
    if (prior?.kind === 'add' && !this.sink.hasStroke(id)) {
      this.pending.delete(id);
      return;
    }
    this.pending.set(id, { kind: 'delete' });
  }

  get size(): number {
    return this.pending.size;
  }

  /** Drains coalesced ops until `budgetMs` of wall-clock elapses; leftovers wait for next frame. */
  flush(budgetMs: number): void {
    const start = performance.now();
    for (const [id, op] of this.pending) {
      this.pending.delete(id);
      if (op.kind === 'add') this.sink.applyAdd(op.stroke);
      else this.sink.applyDelete(id);
      if (performance.now() - start >= budgetMs) return;
    }
  }
}
