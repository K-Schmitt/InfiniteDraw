import type { StrokeJournal } from '../storage/StrokeJournal.js';
import type { BrushStroke } from '@shared/stroke.js';
import type { ConnectedUser } from '@shared/socket-events.js';

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
    this.strokes.set(stroke.id, stroke);
    await this.journal.appendStroke(stroke);
  }

  async deleteStroke(id: string): Promise<void> {
    if (!this.strokes.delete(id)) return;
    await this.journal.appendDelete(id);
  }

  snapshot(): BrushStroke[] {
    return [...this.strokes.values()];
  }

  addUser(user: ConnectedUser): void {
    this.connected.set(user.id, user);
  }

  removeUser(id: string): void {
    this.connected.delete(id);
  }

  users(): ConnectedUser[] {
    return [...this.connected.values()];
  }
}
