import type { BrushStroke } from '@shared/stroke';

type HistoryEntry =
  | { type: 'add'; stroke: BrushStroke }
  | { type: 'delete'; stroke: BrushStroke };

/** What the renderer should do after an undo/redo operation. */
export type RendererInstruction =
  | { action: 'add'; stroke: BrushStroke }
  | { action: 'remove'; strokeId: string };

/**
 * Source of truth for all committed strokes and the undo/redo history.
 * Does not own any rendering state — it only manipulates data.
 */
export class CanvasState {
  private readonly _strokes: BrushStroke[] = [];
  private readonly history: HistoryEntry[] = [];
  private historyIndex = -1;

  get strokes(): readonly BrushStroke[] {
    return this._strokes;
  }

  addStroke(stroke: BrushStroke): void {
    this._strokes.push(stroke);
    this.truncateForward();
    this.history.push({ type: 'add', stroke });
    this.historyIndex = this.history.length - 1;
  }

  deleteStroke(id: string): BrushStroke | undefined {
    const idx = this._strokes.findIndex((s) => s.id === id);
    if (idx === -1) return undefined;
    const [stroke] = this._strokes.splice(idx, 1);
    this.truncateForward();
    this.history.push({ type: 'delete', stroke: stroke! });
    this.historyIndex = this.history.length - 1;
    return stroke;
  }

  /** Returns the renderer instruction needed to reflect the undo, or undefined if nothing to undo. */
  undo(): RendererInstruction | undefined {
    if (this.historyIndex < 0) return undefined;

    const entry = this.history[this.historyIndex]!;
    this.historyIndex--;

    if (entry.type === 'add') {
      removeById(this._strokes, entry.stroke.id);
      return { action: 'remove', strokeId: entry.stroke.id };
    } else {
      this._strokes.push(entry.stroke);
      return { action: 'add', stroke: entry.stroke };
    }
  }

  /** Returns the renderer instruction needed to reflect the redo, or undefined if nothing to redo. */
  redo(): RendererInstruction | undefined {
    if (this.historyIndex >= this.history.length - 1) return undefined;

    this.historyIndex++;
    const entry = this.history[this.historyIndex]!;

    if (entry.type === 'add') {
      this._strokes.push(entry.stroke);
      return { action: 'add', stroke: entry.stroke };
    } else {
      removeById(this._strokes, entry.stroke.id);
      return { action: 'remove', strokeId: entry.stroke.id };
    }
  }

  get canUndo(): boolean {
    return this.historyIndex >= 0;
  }

  get canRedo(): boolean {
    return this.historyIndex < this.history.length - 1;
  }

  /** Discards future history when a new action is taken after an undo. */
  private truncateForward(): void {
    this.history.splice(this.historyIndex + 1);
  }
}

function removeById(strokes: BrushStroke[], id: string): void {
  const idx = strokes.findIndex((s) => s.id === id);
  if (idx !== -1) strokes.splice(idx, 1);
}
