import type { GlobalRoom } from './GlobalRoom.js';
import type { CollabIo } from '../auth/socketAuthorizer.js';
import { log } from '../debug/logger.js';

/** Who to undo for, and which room to notify. */
export interface UndoMineTarget {
  authorId: string;
  roomId: string;
}

/**
 * Mobile-friendly scoped undo: deletes the caller's most recent authored stroke (max
 * `zIndex` among strokes with a matching `authorId`) and broadcasts `stroke:deleted` to
 * the whole room, including the caller, so its local state converges the same way as peers'.
 * A no-op when the caller has authored nothing still in the room.
 */
export async function undoMostRecentAuthored(
  room: GlobalRoom,
  io: CollabIo,
  target: UndoMineTarget,
): Promise<void> {
  const mine = room.snapshot().filter((s) => s.authorId === target.authorId);
  if (mine.length === 0) return;
  const latest = mine.reduce((a, b) => (b.zIndex > a.zIndex ? b : a));
  await room.deleteStroke(latest.id);
  log('net', 'IN stroke:undoMine -> OUT stroke:deleted', {
    authorId: target.authorId, id: latest.id,
  });
  io.to(target.roomId).emit('stroke:deleted', latest.id);
}
