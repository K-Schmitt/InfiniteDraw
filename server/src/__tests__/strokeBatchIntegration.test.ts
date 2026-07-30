import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer, type Server as HttpServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stat } from 'node:fs/promises';
import { io, type Socket as ClientSocket } from 'socket.io-client';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  StrokeBatchPayload,
} from '@shared/socket-events.js';
import type { WireProject, WireStroke } from '@shared/wireStroke.js';
import { StrokeType, type BrushStroke } from '@shared/stroke.js';
import { originAnchor, originBbox } from '@shared/anchor.js';
import { toWireStroke } from '@shared/wireStroke.js';
import { CollabServer } from '../CollabServer.js';

type TestSocket = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

function stroke(id: string): BrushStroke {
  return {
    id,
    type: StrokeType.BRUSH,
    color: { r: 0, g: 0, b: 0, a: 255 },
    size: 1,
    points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    pressures: [1, 1],
    layerId: 'default',
    createdAt: 0,
    anchor: originAnchor(),
    zIndex: 0,
    cellBbox: originBbox(),
  };
}

/** Resolves with the next payload of a given event, or rejects after `timeoutMs`. */
function nextEvent<T>(socket: TestSocket, event: string, timeoutMs = 2000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), timeoutMs);
    socket.once(event as never, ((payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    }) as never);
  });
}

/** Connects a client, joins the global room via room:create, and awaits its project:state. */
async function connectAndJoin(port: number): Promise<TestSocket> {
  const socket: TestSocket = io(`http://127.0.0.1:${port}`, { forceNew: true });
  await new Promise<void>((resolve) => socket.on('connect', () => resolve()));
  const stateReady = nextEvent<WireProject>(socket, 'project:state');
  await new Promise<void>((resolve) => socket.emit('room:create', () => resolve()));
  await stateReady;
  return socket;
}

describe('stroke:batch integration', () => {
  let httpServer: HttpServer;
  let journalDir: string;
  let port: number;
  const sockets: TestSocket[] = [];

  beforeEach(async () => {
    journalDir = await mkdtemp(join(tmpdir(), 'idraw-batch-'));
    httpServer = createServer();
    new CollabServer(httpServer, join(journalDir, 'room.idraw'));
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const address = httpServer.address();
    if (address === null || typeof address === 'string') throw new Error('no ephemeral port');
    port = address.port;
  });

  afterEach(async () => {
    for (const socket of sockets) socket.disconnect();
    sockets.length = 0;
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await rm(journalDir, { recursive: true, force: true });
  });

  it('delivers one batch, a contiguous zIndex block, and no echo duplication', async () => {
    const sender = await connectAndJoin(port);
    const receiver = await connectAndJoin(port);
    sockets.push(sender, receiver);

    const adds: WireStroke[] = [toWireStroke(stroke('r1')), toWireStroke(stroke('r2'))];
    const batchesSeen: StrokeBatchPayload[] = [];
    receiver.on('stroke:batch', (p: StrokeBatchPayload) => batchesSeen.push(p));

    const received = nextEvent<StrokeBatchPayload>(receiver, 'stroke:batch');
    sender.emit('stroke:batch', { deletes: [], adds });
    const payload = await received;

    // Give any stray duplicate emit a chance to land before asserting exclusivity.
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(batchesSeen).toHaveLength(1);
    expect(payload.deletes).toEqual([]);
    expect(payload.adds.map((s) => s.id)).toEqual(['r1', 'r2']);
    const zIndices = payload.adds.map((s) => s.zIndex);
    expect(zIndices[1]).toBe(zIndices[0]! + 1);

    // Third "observer" client: the room's final count must equal adds.length, never 2x —
    // proof the author's own echo of its batch was not applied a second time server-side.
    const observer = await connectAndJoin(port);
    sockets.push(observer);
    const stateReady = nextEvent<WireProject>(observer, 'project:state');
    await new Promise<void>((resolve) => observer.emit('room:create', () => resolve()));
    const state = await stateReady;
    expect(state.strokes).toHaveLength(adds.length);
  });

  it('appends a bounded number of journal bytes for one batched gesture', async () => {
    const sender = await connectAndJoin(port);
    const receiver = await connectAndJoin(port);
    sockets.push(sender, receiver);

    const journalPath = join(journalDir, 'room.idraw');
    const before = await stat(journalPath);

    const adds: WireStroke[] = [toWireStroke(stroke('j1')), toWireStroke(stroke('j2'))];
    const received = nextEvent<StrokeBatchPayload>(receiver, 'stroke:batch');
    sender.emit('stroke:batch', { deletes: [], adds });
    await received;
    // Journal appends are awaited inside handleBatch before the broadcast; give the event
    // loop one more tick so the final append (if any) has flushed to disk.
    await new Promise((resolve) => setTimeout(resolve, 20));

    const after = await stat(journalPath);
    const grown = after.size - before.size;
    // Old per-drag-step broadcasting appended one record per pointermove — tens to hundreds
    // of records for one gesture. One batch of 2 tiny strokes must cost only its own 2 records,
    // bounded well under what a per-step flood would have cost.
    expect(grown).toBeGreaterThan(0);
    expect(grown).toBeLessThan(2_000);
  });

  it('handles a real erase-shaped batch: deletes originals, adds their remnants', async () => {
    const sender = await connectAndJoin(port);
    const receiver = await connectAndJoin(port);
    sockets.push(sender, receiver);

    // Seed the room with two "original" strokes via a preliminary adds-only batch, the same way
    // a normal stroke:commit would land them before an eraser gesture ever touches them.
    const originals: WireStroke[] = [toWireStroke(stroke('orig1')), toWireStroke(stroke('orig2'))];
    const seeded = nextEvent<StrokeBatchPayload>(receiver, 'stroke:batch');
    sender.emit('stroke:batch', { deletes: [], adds: originals });
    await seeded;

    // Now erase them: a real eraser-gesture batch deletes the originals it touched and adds
    // their carved remnants in the same message — not adds-only.
    const remnants: WireStroke[] = [toWireStroke(stroke('rem1')), toWireStroke(stroke('rem2'))];
    const batchesSeen: StrokeBatchPayload[] = [];
    receiver.on('stroke:batch', (p: StrokeBatchPayload) => batchesSeen.push(p));
    const erased = nextEvent<StrokeBatchPayload>(receiver, 'stroke:batch');
    sender.emit('stroke:batch', { deletes: ['orig1', 'orig2'], adds: remnants });
    const payload = await erased;

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(batchesSeen).toHaveLength(1);
    expect(payload.deletes).toEqual(['orig1', 'orig2']);
    expect(payload.adds.map((s) => s.id)).toEqual(['rem1', 'rem2']);

    // Observer client: originals must be gone and remnants present — exactly 2 strokes, not 4
    // (adds landing on top of undeleted originals) and not 0 (deletes racing ahead of adds).
    const observer = await connectAndJoin(port);
    sockets.push(observer);
    const stateReady = nextEvent<WireProject>(observer, 'project:state');
    await new Promise<void>((resolve) => observer.emit('room:create', () => resolve()));
    const state = await stateReady;
    expect(state.strokes.map((s) => s.id).sort()).toEqual(['rem1', 'rem2']);
  });

  it('reconnect yields a fresh project:state with no duplicate ids', async () => {
    const sender = await connectAndJoin(port);
    sockets.push(sender);
    const other = await connectAndJoin(port);
    sockets.push(other);

    const adds: WireStroke[] = [toWireStroke(stroke('d1')), toWireStroke(stroke('d2'))];
    const received = nextEvent<StrokeBatchPayload>(other, 'stroke:batch');
    sender.emit('stroke:batch', { deletes: [], adds });
    await received;

    const reconnected = await connectAndJoin(port);
    sockets.push(reconnected);
    const stateReady = nextEvent<WireProject>(reconnected, 'project:state');
    await new Promise<void>((resolve) => reconnected.emit('room:create', () => resolve()));
    const state = await stateReady;

    const ids = state.strokes.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual(['d1', 'd2']);
  });
});
