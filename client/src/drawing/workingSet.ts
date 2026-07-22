import type { IndexHit } from './SpatialIndex';

/** Ids in stable paint order (ascending zIndex). Non-negotiable: sort before render. */
export function workingSet(hits: readonly IndexHit[]): string[] {
  return [...hits].sort((a, b) => a.zIndex - b.zIndex).map((h) => h.id);
}
