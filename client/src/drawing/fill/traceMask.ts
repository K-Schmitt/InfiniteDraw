import { pointInPolygon } from '../hitTest';
import type { RegionMask } from './maskBuffer';

/** One closed boundary loop on the pixel lattice. Sign of `area` separates outers from holes. */
export interface TracedRing {
  readonly ring: number[];
  readonly area: number;
}

/** An outer contour with the holes that sit inside it. */
export interface TracedRegion {
  readonly outer: number[];
  readonly holes: number[][];
}

/** Direction deltas indexed by heading: 0 = +x, 1 = +y, 2 = -x, 3 = -y. */
const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];
/** Preference when a lattice vertex offers several exits: straight, then left, then right. */
const TURN_ORDER = [0, 3, 1, 2];

interface EdgeGraph {
  /** vertexKey → outgoing headings still unused, as a bitmask over the 4 directions. */
  readonly exits: Map<number, number>;
  readonly stride: number;
}

/**
 * Marching the boundary of a binary mask into closed rings. Each filled cell emits one directed
 * unit edge per empty 4-neighbour, wound so the filled side is on the left. In-degree equals
 * out-degree at every lattice vertex, so the edge set always decomposes into closed cycles —
 * the walk below cannot dead-end regardless of how it resolves a diagonal pinch.
 */
export function traceMask(mask: RegionMask): TracedRing[] {
  const graph = buildEdgeGraph(mask);
  const rings: TracedRing[] = [];
  // `walkRing` → `takeExit` deletes entries from `graph.exits` while this loop iterates it. That
  // is well-defined in JS (a deleted, not-yet-visited entry is skipped) and is what makes the
  // single pass correct — do not "fix" it by snapshotting the map.
  for (const [vertex] of graph.exits) {
    const ring = walkRing(graph, vertex);
    if (ring.length >= 8) rings.push({ ring, area: signedArea(ring) });
  }
  return rings;
}

/**
 * Groups traced rings into outer contours with their contained holes. A hole is classified by its
 * **first** vertex, which is a lattice point on the region boundary — ray casting is
 * boundary-undefined if a pinch makes that point coincide with an outer-ring vertex. Fine for
 * flood masks in practice; if that ever bites, test an edge midpoint instead of a vertex.
 */
export function groupRings(rings: readonly TracedRing[]): TracedRegion[] {
  const outers = rings.filter((r) => r.area > 0);
  const holes = rings.filter((r) => r.area < 0);
  return outers.map((o) => ({
    outer: o.ring,
    holes: holes.filter((h) => pointInPolygon(h.ring[0]!, h.ring[1]!, o.ring)).map((h) => h.ring),
  }));
}

/** Walks `mask.box`, not the whole buffer — no cell outside the box can be set, and a full-buffer
 *  scan costs ~1.4M extra iterations per click at a 1512×945 viewport. */
function buildEdgeGraph(mask: RegionMask): EdgeGraph {
  const stride = mask.width + 1;
  const exits = new Map<number, number>();
  for (let y = mask.box.minY; y <= mask.box.maxY; y++) {
    for (let x = mask.box.minX; x <= mask.box.maxX; x++) {
      if (mask.cells[y * mask.width + x] !== 1) continue;
      addCellEdges({ exits, stride }, mask, { x, y });
    }
  }
  return { exits, stride };
}

interface Cell {
  readonly x: number;
  readonly y: number;
}

function addCellEdges(graph: EdgeGraph, mask: RegionMask, cell: Cell): void {
  const { x, y } = cell;
  const s = graph.stride;
  if (!filled(mask, x, y - 1)) addExit(graph, y * s + x, 0);             // top    → +x
  if (!filled(mask, x + 1, y)) addExit(graph, y * s + x + 1, 1);         // right  → +y
  if (!filled(mask, x, y + 1)) addExit(graph, (y + 1) * s + x + 1, 2);   // bottom → -x
  if (!filled(mask, x - 1, y)) addExit(graph, (y + 1) * s + x, 3);       // left   → -y
}

function filled(mask: RegionMask, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= mask.width || y >= mask.height) return false;
  return mask.cells[y * mask.width + x] === 1;
}

function addExit(graph: EdgeGraph, vertex: number, heading: number): void {
  graph.exits.set(vertex, (graph.exits.get(vertex) ?? 0) | (1 << heading));
}

/**
 * Follows unused edges from `start` until the loop closes, consuming each edge exactly once —
 * **provably closed and terminating**, but not necessarily a *simple* polygon: when the start
 * vertex has several unused exits (a diagonal pinch in a 4-connected region), the loops merge
 * into one self-touching figure-8 ring. Even-odd fill renders that correctly and the shoelace
 * area is still the sum, but polygon-clipping makes no robustness promise on self-touching input.
 */
function walkRing(graph: EdgeGraph, start: number): number[] {
  const ring: number[] = [];
  let vertex = start;
  let heading = 0;
  while (true) {
    const next = takeExit(graph, vertex, heading);
    if (next === null) break;
    heading = next;
    ring.push(vertex % graph.stride, Math.floor(vertex / graph.stride));
    vertex += DX[heading]! + DY[heading]! * graph.stride;
    if (vertex === start && (graph.exits.get(vertex) ?? 0) === 0) break;
  }
  return ring;
}

/** Consumes and returns the preferred unused heading out of `vertex`, or null if there is none. */
function takeExit(graph: EdgeGraph, vertex: number, incoming: number): number | null {
  const bits = graph.exits.get(vertex) ?? 0;
  if (bits === 0) return null;
  for (const turn of TURN_ORDER) {
    const heading = (incoming + turn) % 4;
    if ((bits & (1 << heading)) === 0) continue;
    const remaining = bits & ~(1 << heading);
    if (remaining === 0) graph.exits.delete(vertex);
    else graph.exits.set(vertex, remaining);
    return heading;
  }
  return null;
}

/** Shoelace with sign: positive for the winding this tracer gives outer contours. */
function signedArea(ring: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i += 2) {
    const j = (i + 2) % ring.length;
    sum += ring[i]! * ring[j + 1]! - ring[j]! * ring[i + 1]!;
  }
  return sum / 2;
}
