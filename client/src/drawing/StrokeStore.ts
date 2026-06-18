import type { BrushStroke } from '@shared/stroke';
import { computeBoundingBox, type BoundingBox } from './Culling';

export interface StrokeItem {
  stroke: BrushStroke;
  rings: number[][]; // outer ring + optional holes
  bbox: BoundingBox; // never changes after commit
  anchorX: number;
  anchorY: number;
}

// Iterates strokes linearly — safe at any zoom; never iterates coordinate space.
export class StrokeStore {
  private readonly items = new Map<string, StrokeItem>();

  add(stroke: BrushStroke, rings: number[][]): StrokeItem {
    const bbox = computeBoundingBox(stroke);
    const item: StrokeItem = {
      stroke,
      rings,
      bbox,
      anchorX: (bbox.minX + bbox.maxX) / 2,
      anchorY: (bbox.minY + bbox.maxY) / 2,
    };
    this.items.set(stroke.id, item);
    return item;
  }

  remove(id: string): void {
    this.items.delete(id);
  }

  get(id: string): StrokeItem | undefined {
    return this.items.get(id);
  }

  all(): IterableIterator<StrokeItem> {
    return this.items.values();
  }

  get size(): number {
    return this.items.size;
  }

  queryRect(bbox: BoundingBox): StrokeItem[] {
    const result: StrokeItem[] = [];
    for (const item of this.items.values()) {
      const b = item.bbox;
      if (b.maxX >= bbox.minX && b.minX <= bbox.maxX && b.maxY >= bbox.minY && b.minY <= bbox.maxY) {
        result.push(item);
      }
    }
    return result;
  }

  clear(): void {
    this.items.clear();
  }
}
