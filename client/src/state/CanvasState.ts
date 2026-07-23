import type { BrushStroke, Color } from '@shared/stroke';

type HistoryEntry =
  | { type: 'add'; stroke: BrushStroke }
  | { type: 'delete'; stroke: BrushStroke }
  | { type: 'replace'; removed: BrushStroke[]; added: BrushStroke[] }
  | { type: 'recolor'; items: { id: string; before: Color }[]; after: Color };

/** What the renderer should do to reflect one undo/redo step. */
export type RendererInstruction =
  | { action: 'add'; stroke: BrushStroke }
  | { action: 'remove'; strokeId: string }
  | { action: 'recolor'; strokeId: string; color: Color };

/**
 * Source of truth for all committed strokes and the undo/redo history.
 * Does not own any rendering state — it only manipulates data and reports
 * the instructions the renderer must apply.
 */
export class CanvasState {
  private readonly _strokes: BrushStroke[] = [];
  private readonly history: HistoryEntry[] = [];
  private historyIndex = -1;
  // Monotone global paint-order counter. Assigned once per genuinely-new stroke; never rolled
  // back on undo, so a redraw after undo always outranks the undone stroke. Undo/redo re-add the
  // same object, which keeps its assigned zIndex — restored, not reassigned.
  private nextZ = 0;
  // in-progress eraser gesture: applied to _strokes live, recorded as one entry on commit
  private eraseTxn: { removed: Map<string, BrushStroke>; added: Map<string, BrushStroke> } | null =
    null;

  get strokes(): readonly BrushStroke[] {
    return this._strokes;
  }

  addStroke(stroke: BrushStroke): void {
    stroke.zIndex = this.nextZ++; // genuinely-new stroke gets the next paint slot
    this._strokes.push(stroke);
    this.record({ type: 'add', stroke });
  }

  deleteStroke(id: string): BrushStroke | undefined {
    const idx = this._strokes.findIndex((s) => s.id === id);
    if (idx === -1) return undefined;
    const [stroke] = this._strokes.splice(idx, 1);
    this.record({ type: 'delete', stroke: stroke! });
    return stroke;
  }

  /** Removes `removeIds` and adds `additions` as a single undoable step (used by the eraser). */
  replaceStrokes(removeIds: readonly string[], additions: readonly BrushStroke[]): void {
    const removed: BrushStroke[] = [];
    for (const id of removeIds) {
      const idx = this._strokes.findIndex((s) => s.id === id);
      if (idx !== -1) removed.push(this._strokes.splice(idx, 1)[0]!);
    }
    this._strokes.push(...additions);
    this.record({ type: 'replace', removed, added: [...additions] });
  }

  /** Recolors an existing stroke as a single undoable step. */
  recolor(id: string, color: Color): void {
    this.recolorMany([id], color);
  }

  /** Recolors several strokes to the same color as one undoable step (paint-bucket). */
  recolorMany(ids: readonly string[], color: Color): void {
    const items: { id: string; before: Color }[] = [];
    for (const id of ids) {
      const stroke = this._strokes.find((s) => s.id === id);
      if (!stroke) continue;
      items.push({ id, before: stroke.color });
      stroke.color = color;
    }
    if (items.length > 0) this.record({ type: 'recolor', items, after: color });
  }

  /** Applies one eraser step immediately (no history). Call commitErase() at gesture end. */
  liveErase(removeIds: readonly string[], additions: readonly BrushStroke[]): void {
    if (!this.eraseTxn) this.eraseTxn = { removed: new Map(), added: new Map() };
    for (const id of removeIds) {
      const idx = this._strokes.findIndex((s) => s.id === id);
      if (idx === -1) continue;
      const [stroke] = this._strokes.splice(idx, 1);
      if (this.eraseTxn.added.has(id)) this.eraseTxn.added.delete(id);
      else this.eraseTxn.removed.set(id, stroke!);
    }
    for (const stroke of additions) {
      this._strokes.push(stroke);
      this.eraseTxn.added.set(stroke.id, stroke);
    }
  }

  /** Records the whole erase gesture as a single undoable step. */
  commitErase(): void {
    if (!this.eraseTxn) return;
    const removed = [...this.eraseTxn.removed.values()];
    const added = [...this.eraseTxn.added.values()];
    this.eraseTxn = null;
    if (removed.length > 0 || added.length > 0) this.record({ type: 'replace', removed, added });
  }

  undo(): RendererInstruction[] {
    if (this.historyIndex < 0) return [];
    const entry = this.history[this.historyIndex]!;
    this.historyIndex--;
    return this.applyEntry(entry, false);
  }

  redo(): RendererInstruction[] {
    if (this.historyIndex >= this.history.length - 1) return [];
    this.historyIndex++;
    return this.applyEntry(this.history[this.historyIndex]!, true);
  }

  get canUndo(): boolean {
    return this.historyIndex >= 0;
  }

  get canRedo(): boolean {
    return this.historyIndex < this.history.length - 1;
  }

  private record(entry: HistoryEntry): void {
    this.history.splice(this.historyIndex + 1); // discard redo branch
    this.history.push(entry);
    this.historyIndex = this.history.length - 1;
  }

  // forward = redo (apply as recorded); !forward = undo (reverse it)
  private applyEntry(entry: HistoryEntry, forward: boolean): RendererInstruction[] {
    if (entry.type === 'add') {
      return forward ? this.add(entry.stroke) : this.remove(entry.stroke.id);
    }
    if (entry.type === 'delete') {
      return forward ? this.remove(entry.stroke.id) : this.add(entry.stroke);
    }
    if (entry.type === 'recolor') {
      return entry.items.flatMap((it) =>
        this.recolorInstruction(it.id, forward ? entry.after : it.before),
      );
    }
    const toRemove = forward ? entry.removed : entry.added;
    const toAdd = forward ? entry.added : entry.removed;
    return [...toRemove.flatMap((s) => this.remove(s.id)), ...toAdd.flatMap((s) => this.add(s))];
  }

  private recolorInstruction(id: string, color: Color): RendererInstruction[] {
    const stroke = this._strokes.find((s) => s.id === id);
    if (stroke) stroke.color = color;
    return [{ action: 'recolor', strokeId: id, color }];
  }

  private add(stroke: BrushStroke): RendererInstruction[] {
    this._strokes.push(stroke);
    return [{ action: 'add', stroke }];
  }

  private remove(id: string): RendererInstruction[] {
    const idx = this._strokes.findIndex((s) => s.id === id);
    if (idx !== -1) this._strokes.splice(idx, 1);
    return [{ action: 'remove', strokeId: id }];
  }
}
