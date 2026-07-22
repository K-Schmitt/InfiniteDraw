import { writePascalString, readPascalString } from './pascalString.js';
import { writeVarBigInt, readVarBigInt } from '@shared/bigintVarint.js';
import type { BrushStroke, Point, StrokeType } from '@shared/stroke.js';

/**
 * Encode/decode one BrushStroke to/from the v3 binary record.
 *
 * Layout (little-endian):
 *   pascal id, pascal layerId,
 *   varint anchor.level, varint cell.x, varint cell.y, varint zIndex,
 *   varint cellBbox.minX/minY/maxX/maxY,
 *   f64 createdAt, u8 type, u8×4 rgba, u16 size,
 *   u8 flags (bit0 filled, bit1 background), u16 pointCount,
 *   per point: f32 x, f32 y, u8 pressure,
 *   u8 holeCount, per hole: u16 count, per point: f32 x, f32 y
 */

const FLAG_FILLED = 1;
const FLAG_BACKGROUND = 2;
const CELL_BOUND = 2n ** 60n; // reject monster anchors that would blow up the index/memory

const absBig = (v: bigint): bigint => (v < 0n ? -v : v);

export function encodeStroke(stroke: BrushStroke): Buffer {
  const parts: Buffer[] = [
    writePascalString(stroke.id),
    writePascalString(stroke.layerId),
    encodeAnchor(stroke),
  ];
  const head = Buffer.allocUnsafe(8 + 1 + 4 + 2 + 1 + 2);
  let o = 0;
  head.writeDoubleLE(stroke.createdAt, o); o += 8;
  head.writeUInt8(stroke.type, o); o += 1;
  head.writeUInt8(stroke.color.r, o); o += 1;
  head.writeUInt8(stroke.color.g, o); o += 1;
  head.writeUInt8(stroke.color.b, o); o += 1;
  head.writeUInt8(stroke.color.a, o); o += 1;
  head.writeUInt16LE(Math.round(stroke.size), o); o += 2;
  const flags = (stroke.filled ? FLAG_FILLED : 0) | (stroke.background ? FLAG_BACKGROUND : 0);
  head.writeUInt8(flags, o); o += 1;
  head.writeUInt16LE(stroke.points.length, o);
  parts.push(head, encodePoints(stroke.points, stroke.pressures), encodeHoles(stroke.holes ?? []));
  return Buffer.concat(parts);
}

function encodeAnchor(stroke: BrushStroke): Buffer {
  const b = stroke.cellBbox;
  return Buffer.concat([
    writeVarBigInt(BigInt(stroke.anchor.level)),
    writeVarBigInt(stroke.anchor.cell.x),
    writeVarBigInt(stroke.anchor.cell.y),
    writeVarBigInt(BigInt(stroke.zIndex)),
    writeVarBigInt(b.minX),
    writeVarBigInt(b.minY),
    writeVarBigInt(b.maxX),
    writeVarBigInt(b.maxY),
  ]);
}

function encodePoints(points: readonly Point[], pressures: readonly number[]): Buffer {
  const buf = Buffer.allocUnsafe(points.length * 9);
  let o = 0;
  for (let i = 0; i < points.length; i++) {
    buf.writeFloatLE(points[i]!.x, o); o += 4;
    buf.writeFloatLE(points[i]!.y, o); o += 4;
    buf.writeUInt8(Math.round((pressures[i] ?? 1) * 255), o); o += 1;
  }
  return buf;
}

function encodeHoles(holes: readonly Point[][]): Buffer {
  const parts: Buffer[] = [Buffer.from([holes.length])];
  for (const hole of holes) {
    const header = Buffer.allocUnsafe(2);
    header.writeUInt16LE(hole.length, 0);
    const body = Buffer.allocUnsafe(hole.length * 8);
    let o = 0;
    for (const p of hole) {
      body.writeFloatLE(p.x, o); o += 4;
      body.writeFloatLE(p.y, o); o += 4;
    }
    parts.push(header, body);
  }
  return Buffer.concat(parts);
}

export function decodeStroke(buf: Buffer, offset: number): { stroke: BrushStroke; next: number } {
  const id = readPascalString(buf, offset);
  const layer = readPascalString(buf, id.next);
  const anchorPart = decodeAnchor(buf, layer.next);
  let o = anchorPart.next;
  const createdAt = buf.readDoubleLE(o); o += 8;
  const type = buf.readUInt8(o) as StrokeType; o += 1;
  const color = {
    r: buf.readUInt8(o++),
    g: buf.readUInt8(o++),
    b: buf.readUInt8(o++),
    a: buf.readUInt8(o++),
  };
  const size = buf.readUInt16LE(o); o += 2;
  const flags = buf.readUInt8(o); o += 1;
  const pointCount = buf.readUInt16LE(o); o += 2;
  const points: Point[] = [];
  const pressures: number[] = [];
  for (let i = 0; i < pointCount; i++) {
    points.push({ x: buf.readFloatLE(o), y: buf.readFloatLE(o + 4) }); o += 8;
    pressures.push(buf.readUInt8(o) / 255); o += 1;
  }
  const holes = decodeHoles(buf, o);
  const stroke: BrushStroke = {
    id: id.value,
    layerId: layer.value,
    anchor: anchorPart.anchor,
    zIndex: anchorPart.zIndex,
    cellBbox: anchorPart.cellBbox,
    createdAt,
    type,
    color,
    size,
    points,
    pressures,
    ...(flags & FLAG_FILLED ? { filled: true, holes: holes.holes } : {}),
    ...(flags & FLAG_BACKGROUND ? { background: true } : {}),
  };
  return { stroke, next: holes.next };
}

function decodeAnchor(
  buf: Buffer,
  offset: number,
): { anchor: BrushStroke['anchor']; zIndex: number; cellBbox: BrushStroke['cellBbox']; next: number } {
  const level = readVarBigInt(buf, offset);
  const cx = readVarBigInt(buf, level.next);
  const cy = readVarBigInt(buf, cx.next);
  if (absBig(cx.value) > CELL_BOUND || absBig(cy.value) > CELL_BOUND) {
    throw new Error('anchor cell out of bounds');
  }
  const z = readVarBigInt(buf, cy.next);
  const minX = readVarBigInt(buf, z.next);
  const minY = readVarBigInt(buf, minX.next);
  const maxX = readVarBigInt(buf, minY.next);
  const maxY = readVarBigInt(buf, maxX.next);
  return {
    anchor: { level: Number(level.value), cell: { x: cx.value, y: cy.value } },
    zIndex: Number(z.value),
    cellBbox: { minX: minX.value, minY: minY.value, maxX: maxX.value, maxY: maxY.value },
    next: maxY.next,
  };
}

function decodeHoles(buf: Buffer, offset: number): { holes: Point[][]; next: number } {
  let o = offset;
  const count = buf.readUInt8(o); o += 1;
  const holes: Point[][] = [];
  for (let h = 0; h < count; h++) {
    const n = buf.readUInt16LE(o); o += 2;
    const ring: Point[] = [];
    for (let i = 0; i < n; i++) {
      ring.push({ x: buf.readFloatLE(o), y: buf.readFloatLE(o + 4) }); o += 8;
    }
    holes.push(ring);
  }
  return { holes, next: o };
}
