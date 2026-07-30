import type { BrushStroke, Color } from '@shared/stroke';
import { StrokeType } from '@shared/stroke';
import type { ProjCamera } from '../coords/viewProject';
import { subtractStamp } from '../drawing/eraseGeometry';
import { simplifyRing } from '../drawing/fill/simplifyRing';
import type { FrameCandidate } from '../drawing/StrokeRenderer';
import type { FramePoint } from '../drawing/anchorCommit';
import { anchoredStroke } from './strokeFactory';
import { log } from '../debug/logger';

type Pair = [number, number];
// eraseGeometry.ts keeps `MultiPolygon` module-private (same treatment as `Pair`), so it is
// redeclared here — this must match `subtractStamp`'s real `stamp` type exactly. Not `readonly`:
// `subtractStamp` takes the mutable form.
type MultiPolygon = Pair[][][];

export interface EraserSessionConfig {
  readonly camera: ProjCamera;
  readonly cameraScale: number;
}

export interface SealedErase {
  readonly removed: string[];
  readonly added: BrushStroke[];
}

export interface WorkingShape {
  readonly id: string;
  readonly color: Color;
  readonly rings: number[][];
}

/** Simplification tolerance for sealed remnants, in camera-frame units at gesture scale. */
const REMNANT_TOLERANCE = 0.5;

interface WorkItem {
  readonly source: BrushStroke;
  /** Surviving geometry in camera-frame coords: one entry per disjoint piece, outer + holes. */
  pieces: Pair[][][];
}

/**
 * One eraser gesture, held entirely in memory.
 *
 * The old tool re-anchored and re-committed a fresh remnant stroke on *every* drag step and
 * broadcast each one, so a single pass emitted hundreds of 4–15 point strokes — 15 s of blocked
 * main thread on a receiving peer, and permanent bloat in the append-only journal. Here nothing
 * is committed or broadcast until `seal()`: the working geometry stays in frame coordinates, is
 * carved in place, and is anchored exactly once at the end.
 *
 * `config.camera` is FROZEN for the gesture — same contract as `StrokeRecorder` for the brush.
 * Frame coordinates are camera-relative, so buffering them across a re-anchor mixes coordinate
 * systems (the origin-straddle bug class, `anchorCommit.ts:41-49`). The eraser's exposure is worse
 * than the brush's: a garbled brush stroke is one contained, undoable object, while a garbled
 * erase misplaces *pre-existing shared* strokes and ships that to every peer. The session does not
 * detect drift itself — `EraserTool.step()` (Task 19) compares the live camera to the frozen one
 * and seals early, so a session is never carved with a stamp from a different frame.
 */
export class EraserSession {
  private readonly items = new Map<string, WorkItem>();

  constructor(private readonly config: EraserSessionConfig) {}

  get takenIds(): string[] {
    return [...this.items.keys()];
  }

  /**
   * Adopts every not-yet-adopted candidate the stamp actually touches, keeping `subtractStamp`'s
   * result as the item's initial geometry rather than the un-carved rings — the caller then skips
   * re-carving what was just adopted. `polygonClipping.difference` is the most expensive call in
   * this pipeline; running it twice per newly-touched stroke is pure waste.
   */
  take(candidates: readonly FrameCandidate[], stamp: MultiPolygon): string[] {
    const taken: string[] = [];
    for (const cand of candidates) {
      if (this.items.has(cand.stroke.id)) continue;
      const carved = subtractStamp(cand.frameRings, stamp);
      if (carved === null) continue;
      this.items.set(cand.stroke.id, { source: cand.stroke, pieces: carved });
      taken.push(cand.stroke.id);
    }
    return taken;
  }

  /** Subtracts the stamp from every adopted stroke's working geometry, in place. */
  carve(stamp: MultiPolygon, skip: ReadonlySet<string> = new Set()): void {
    for (const [id, item] of this.items) {
      if (skip.has(id)) continue;   // adopted this same step — `take()` already carved it
      const next: MultiPolygon = [];
      for (const piece of item.pieces) {
        const result = subtractStamp(piece.map(toFlat), stamp);
        if (result === null) next.push(piece);
        else next.push(...result);
      }
      item.pieces = next;
    }
  }

  /** Current surviving geometry, for the tool's live preview overlay. */
  workingRings(): WorkingShape[] {
    const out: WorkingShape[] = [];
    for (const [id, item] of this.items) {
      for (const piece of item.pieces) {
        out.push({ id, color: item.source.color, rings: piece.map(toFlat) });
      }
    }
    return out;
  }

  /** One delete per adopted original, one simplified anchored stroke per surviving piece. */
  seal(): SealedErase {
    const removed = [...this.items.keys()];
    const added: BrushStroke[] = [];
    for (const item of this.items.values()) {
      for (const piece of item.pieces) added.push(this.remnant(piece, item.source));
    }
    log('tool', 'erase gesture sealed', {
      removed: removed.length, added: added.length,
      vertices: added.reduce((n, s) => n + s.points.length, 0),
    });
    this.items.clear();
    return { removed, added };
  }

  private remnant(piece: readonly Pair[][], source: BrushStroke): BrushStroke {
    const rings = piece.map((ring) =>
      simplifyRing(toFlat(dropClosingDuplicate(ring)), REMNANT_TOLERANCE),
    );
    return anchoredStroke({
      type: StrokeType.BRUSH,
      color: source.color,
      screenSize: 1,
      framePoints: toFramePoints(rings[0]!),
      frameHoles: rings.slice(1).map(toFramePoints),
      layerId: source.layerId,
      camera: this.config.camera,
      cameraScale: this.config.cameraScale,
      zIndex: source.zIndex,
      filled: true,
      ...(source.background ? { background: true } : {}),
    });
  }
}

/**
 * polygon-clipping documents its output rings as self-closing (first === last) — every other ring
 * format in this codebase (traceMask, ringToPairs, hitTest's pointInPolygon) is open, closure
 * implicit. Left in, the duplicate makes the downstream Douglas-Peucker pass in `simplifyRing` see
 * a zero-length edge at both wrap points and drop a real corner instead. Same fix as
 * `exactRegion.ts`'s `dropClosingDuplicate` (un-exported there, so duplicated here) — `piece` comes
 * from the same `subtractStamp`/polygon-clipping origin and has the same self-closing shape.
 */
function dropClosingDuplicate(ring: readonly Pair[]): readonly Pair[] {
  if (ring.length < 2) return ring;
  const first = ring[0]!;
  const last = ring[ring.length - 1]!;
  return first[0] === last[0] && first[1] === last[1] ? ring.slice(0, -1) : ring;
}

function toFlat(ring: readonly Pair[]): number[] {
  const out: number[] = [];
  for (const [x, y] of ring) out.push(x, y);
  return out;
}

function toFramePoints(flat: readonly number[]): FramePoint[] {
  const out: FramePoint[] = [];
  for (let i = 0; i < flat.length; i += 2) out.push({ x: flat[i]!, y: flat[i + 1]! });
  return out;
}
