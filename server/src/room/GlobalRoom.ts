import type { StrokeJournal } from '../storage/StrokeJournal.js';
import type { BrushStroke, Color } from '@shared/stroke.js';
import type { ConnectedUser } from '@shared/socket-events.js';
import { log } from '../debug/logger.js';

/**
 * In-memory state for the single shared room: the current stroke set and the connected
 * users. Every stroke mutation is mirrored to the append-only journal for persistence.
 */
export class GlobalRoom {
  private readonly strokes = new Map<string, BrushStroke>();
  private readonly connected = new Map<string, ConnectedUser>();

  private constructor(private readonly journal: StrokeJournal) {}

  static create(journal: StrokeJournal): GlobalRoom {
    const room = new GlobalRoom(journal);
    for (const stroke of journal.load()) room.strokes.set(stroke.id, stroke);
    return room;
  }

  async addStroke(stroke: BrushStroke): Promise<void> {
    const replaced = this.strokes.has(stroke.id);
    this.strokes.set(stroke.id, stroke);
    await this.journal.appendStroke(stroke);
    log('room', 'stroke stored', { id: stroke.id, replaced, total: this.strokes.size });
  }

  async deleteStroke(id: string): Promise<void> {
    if (!this.strokes.delete(id)) {
      log('room', 'delete MISS (unknown id)', { id, total: this.strokes.size });
      return;
    }
    await this.journal.appendDelete(id);
    log('room', 'stroke deleted', { id, total: this.strokes.size });
  }

  /** Recolors the given strokes in place and persists each. Returns the ids that existed. */
  async recolorStrokes(ids: readonly string[], color: Color): Promise<string[]> {
    const applied: string[] = [];
    for (const id of ids) {
      const stroke = this.strokes.get(id);
      if (!stroke) continue;
      stroke.color = { ...color };
      await this.journal.appendStroke(stroke); // journal is append-only; last write wins on load
      applied.push(id);
    }
    log('room', 'strokes recolored', { requested: ids.length, applied: applied.length });
    return applied;
  }

  has(id: string): boolean {
    return this.strokes.has(id);
  }

  size(): number {
    return this.strokes.size;
  }

  snapshot(): BrushStroke[] {
    return [...this.strokes.values()];
  }

  addUser(user: ConnectedUser): void {
    this.connected.set(user.id, user);
    log('room', 'user added', { user, connected: this.connected.size });
  }

  removeUser(id: string): void {
    this.connected.delete(id);
  }

  users(): ConnectedUser[] {
    return [...this.connected.values()];
  }
}
