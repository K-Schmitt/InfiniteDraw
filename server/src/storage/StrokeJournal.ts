import { mkdir, readFile, appendFile, writeFile, access } from 'node:fs/promises';
import { dirname } from 'node:path';
import { writePascalString, readPascalString } from './pascalString.js';
import { encodeStroke, decodeStroke } from './strokeCodec.js';
import { FILE_MAGIC, FILE_FORMAT_VERSION } from '../../../shared/types/project.js';
import type { BrushStroke } from '@shared/stroke.js';
import { log } from '../debug/logger.js';

/**
 * Append-only binary journal for one room. The file IS the event log: a fixed header
 * written once, then one framed record per event (ADD or DELETE). Loading replays the
 * records in order, so a committed stroke is a single O(1) append, never a full rewrite.
 */

const OP_ADD = 0;
const OP_DELETE = 1;

export class StrokeJournal {
  private readonly strokes = new Map<string, BrushStroke>();

  private constructor(private readonly path: string) {}

  static async open(path: string): Promise<StrokeJournal> {
    const journal = new StrokeJournal(path);
    const found = await exists(path);
    if (found) {
      await journal.replay();
    } else {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, header());
    }
    log('store', found ? 'journal replayed' : 'journal created', {
      path, strokes: journal.strokes.size,
    });
    return journal;
  }

  load(): BrushStroke[] {
    return [...this.strokes.values()];
  }

  async appendStroke(stroke: BrushStroke): Promise<void> {
    this.strokes.set(stroke.id, stroke);
    const record = frame(OP_ADD, encodeStroke(stroke));
    await appendFile(this.path, record);
    log('store', 'journal ADD', { id: stroke.id, bytes: record.length, live: this.strokes.size });
  }

  async appendDelete(id: string): Promise<void> {
    const known = this.strokes.delete(id);
    await appendFile(this.path, frame(OP_DELETE, writePascalString(id)));
    log('store', 'journal DELETE', { id, known, live: this.strokes.size });
  }

  private async replay(): Promise<void> {
    const buf = await readFile(this.path);
    let o = readHeader(buf); // throws on bad magic/version
    while (o < buf.length) {
      const op = buf.readUInt8(o); o += 1;
      const length = buf.readUInt32LE(o); o += 4;
      const payload = buf.subarray(o, o + length);
      if (op === OP_ADD) {
        const { stroke } = decodeStroke(payload, 0);
        this.strokes.set(stroke.id, stroke);
      } else if (op === OP_DELETE) {
        this.strokes.delete(readPascalString(payload, 0).value);
      }
      o += length;
    }
  }
}

function header(): Buffer {
  const h = Buffer.allocUnsafe(8);
  h.writeUInt32LE(FILE_MAGIC, 0);
  h.writeUInt32LE(FILE_FORMAT_VERSION, 4);
  return Buffer.concat([h, writePascalString('')]); // empty meta for the global room
}

function readHeader(buf: Buffer): number {
  if (buf.readUInt32LE(0) !== FILE_MAGIC) throw new Error('bad journal magic');
  if (buf.readUInt32LE(4) !== FILE_FORMAT_VERSION) throw new Error('unsupported journal version');
  return readPascalString(buf, 8).next;
}

function frame(op: number, payload: Buffer): Buffer {
  const head = Buffer.allocUnsafe(5);
  head.writeUInt8(op, 0);
  head.writeUInt32LE(payload.length, 1);
  return Buffer.concat([head, payload]);
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
