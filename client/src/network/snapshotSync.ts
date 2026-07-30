import type { BrushStroke } from '@shared/stroke';
import type { CanvasState } from '../state/CanvasState';
import type { RemoteStrokeQueue } from './RemoteStrokeQueue';

type SnapshotState = Pick<CanvasState, 'strokes' | 'loadSnapshot'>;
type SnapshotQueue = Pick<RemoteStrokeQueue, 'enqueueDelete' | 'enqueueForceAdd'>;

/**
 * Applies a full-room resync snapshot (join/reconnect): bulk-replaces `state`, then queues removal
 * of every previously-known stroke and a forced render of every incoming one.
 *
 * Incoming strokes MUST go through `enqueueForceAdd`, never `enqueueAdd`. `state.loadSnapshot`
 * above already makes `state.hasStroke(id)` true for every incoming stroke before the queue ever
 * drains, so the ordinary echo check — meant to detect a locally-committed stroke echoed back by
 * the server — would treat every one of them as "already rendered" and never build their Graphics.
 * This exact regression shipped once in v4.0.1; `snapshotSync.test.ts` calls this function
 * directly so reverting the `enqueueForceAdd` call below breaks that test, not just a hand-rolled
 * queue-primitive test.
 */
export function syncSnapshot(
  strokes: readonly BrushStroke[],
  state: SnapshotState,
  queue: SnapshotQueue,
): void {
  const current = [...state.strokes];
  state.loadSnapshot(strokes);
  for (const s of current) queue.enqueueDelete(s.id);
  for (const s of strokes) queue.enqueueForceAdd(s);
}
