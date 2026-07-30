/**
 * Socket.io JSON-encodes every payload; `bigint` fields (`CellAnchor.cell`, `CellBbox`) throw
 * synchronously in `JSON.stringify` and are not recoverable from an event handler. `WireStroke`/
 * `WireProject` are the wire-safe shapes (bigints as decimal strings) — every socket boundary
 * must convert through `toWireStroke`/`fromWireStroke` (or the project-level equivalents) rather
 * than sending a `BrushStroke`/`Project` directly.
 */

import type { BrushStroke } from './stroke.js';
import type { Project } from './project.js';

export interface WireCellAnchor {
  level: number;
  cellX: string;
  cellY: string;
}

export interface WireCellBbox {
  minX: string;
  minY: string;
  maxX: string;
  maxY: string;
}

export type WireStroke = Omit<BrushStroke, 'anchor' | 'cellBbox'> & {
  anchor: WireCellAnchor;
  cellBbox: WireCellBbox;
};

export type WireProject = Omit<Project, 'strokes'> & { strokes: WireStroke[] };

export function toWireStroke(stroke: BrushStroke): WireStroke {
  return {
    ...stroke,
    anchor: {
      level: stroke.anchor.level,
      cellX: stroke.anchor.cell.x.toString(),
      cellY: stroke.anchor.cell.y.toString(),
    },
    cellBbox: {
      minX: stroke.cellBbox.minX.toString(),
      minY: stroke.cellBbox.minY.toString(),
      maxX: stroke.cellBbox.maxX.toString(),
      maxY: stroke.cellBbox.maxY.toString(),
    },
  };
}

export function fromWireStroke(wire: WireStroke): BrushStroke {
  return {
    ...wire,
    anchor: {
      level: wire.anchor.level,
      cell: { x: BigInt(wire.anchor.cellX), y: BigInt(wire.anchor.cellY) },
    },
    cellBbox: {
      minX: BigInt(wire.cellBbox.minX),
      minY: BigInt(wire.cellBbox.minY),
      maxX: BigInt(wire.cellBbox.maxX),
      maxY: BigInt(wire.cellBbox.maxY),
    },
  };
}

export function toWireProject(project: Project): WireProject {
  return { ...project, strokes: project.strokes.map(toWireStroke) };
}

export function fromWireProject(wire: WireProject): Project {
  return { ...wire, strokes: wire.strokes.map(fromWireStroke) };
}
