import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer, type Server as HttpServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { io, type Socket as ClientSocket } from 'socket.io-client';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  ConnectedUser,
  CursorPosition,
  SerializableCamera,
} from '@shared/socket-events.js';
import type { WireProject, WireStroke } from '@shared/wireStroke.js';
import { StrokeType, type BrushStroke } from '@shared/stroke.js';
import { originAnchor, originBbox } from '@shared/anchor.js';
import { toWireStroke } from '@shared/wireStroke.js';
import type { SessionValidator } from '../auth/types.js';
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

function someCamera(): SerializableCamera {
  return { level: 0, cellX: '0', cellY: '0', subX: 0, subY: 0 };
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

const validator: SessionValidator = async (cookie) => {
  if (cookie?.includes('p3_session=good-bob')) return { id: 'ba-2', name: 'Bob' };
  if (cookie?.includes('p3_session=good')) return { id: 'ba-1', name: 'Kylian' };
  return null;
};

describe('collab auth integration', () => {
  let httpServer: HttpServer;
  let journalDir: string;
  let port: number;
  const sockets: TestSocket[] = [];

  beforeEach(async () => {
    journalDir = await mkdtemp(join(tmpdir(), 'idraw-auth-'));
    httpServer = createServer();
    new CollabServer(httpServer, join(journalDir, 'room.idraw'), { validator });
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const address = httpServer.address();
    if (address === null || typeof address === 'string') throw new Error('no ephemeral port');
    port = address.port;
  });

  afterEach(async () => {
    for (const socket of sockets) socket.disconnect();
    sockets.length = 0;
    // Polling-only transport (required for extraHeaders) can leave a long-poll request
    // outstanding right as it's superseded by disconnect, which would otherwise hang
    // httpServer.close() forever waiting for that keep-alive connection to end on its own.
    httpServer.closeAllConnections();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await rm(journalDir, { recursive: true, force: true });
  });

  /** Connects a client with an explicit cookie header (polling transport only). */
  function connectWith(cookie?: string): TestSocket {
    const socket: TestSocket = io(`http://127.0.0.1:${port}`, {
      forceNew: true,
      transports: ['polling'],
      extraHeaders: cookie ? { cookie } : {},
    });
    sockets.push(socket);
    return socket;
  }

  /** Connects with the given cookie and completes the room:create / project:state dance. */
  async function joinWith(cookie?: string): Promise<TestSocket> {
    const socket = connectWith(cookie);
    await new Promise<void>((resolve) => socket.on('connect', () => resolve()));
    const stateReady = nextEvent<WireProject>(socket, 'project:state');
    await new Promise<void>((resolve) => socket.emit('room:create', () => resolve()));
    await stateReady;
    return socket;
  }

  /** Connects with the given cookie and completes the room:join / project:state dance. */
  async function joinRoomWith(cookie?: string): Promise<TestSocket> {
    const socket = connectWith(cookie);
    await new Promise<void>((resolve) => socket.on('connect', () => resolve()));
    const stateReady = nextEvent<WireProject>(socket, 'project:state');
    await new Promise<void>((resolve) => socket.emit('room:join', 'global', () => resolve()));
    await stateReady;
    return socket;
  }

  /** Commits a stroke and awaits its `stroke:added` echo back to the committing socket. */
  async function commit(socket: TestSocket, id: string): Promise<void> {
    const added = nextEvent<WireStroke>(socket, 'stroke:added');
    socket.emit('stroke:commit', toWireStroke(stroke(id)));
    await added;
  }

  it('lets an authenticated socket commit a stroke', async () => {
    const author = await joinWith('p3_session=good');
    const peer = await joinWith('p3_session=good');
    const added = nextEvent<WireStroke>(peer, 'stroke:added');
    author.emit('stroke:commit', toWireStroke(stroke('a1')));
    expect((await added).id).toBe('a1');
  });

  it('rejects a spectator commit with auth:denied and relays nothing', async () => {
    const spectator = await joinWith(undefined);
    const peer = await joinWith('p3_session=good');
    const denied = nextEvent<void>(spectator, 'auth:denied');
    const relay = nextEvent<WireStroke>(peer, 'stroke:added', 500).catch(() => 'timeout');
    spectator.emit('stroke:commit', toWireStroke(stroke('s1')));
    await denied;
    expect(await relay).toBe('timeout');
  });

  it('does not announce spectators (no user:joined) and drops their cursors', async () => {
    const peer = await joinWith('p3_session=good');
    const joined = nextEvent<ConnectedUser>(peer, 'user:joined', 500).catch(() => 'timeout');
    const spectator = await joinWith(undefined);
    expect(await joined).toBe('timeout');
    const cursor = nextEvent<CursorPosition>(peer, 'cursor:moved', 500).catch(() => 'timeout');
    spectator.emit('cursor:move', { x: 0, y: 0, camera: someCamera() });
    expect(await cursor).toBe('timeout');
  });

  it('never leaks the real Better Auth id on the wire', async () => {
    const author = await joinWith('p3_session=good');
    const peer = await joinWith('p3_session=good');
    const added = nextEvent<WireStroke>(peer, 'stroke:added');
    author.emit('stroke:commit', toWireStroke(stroke('a2')));
    const wire = await added;
    expect(JSON.stringify(wire)).not.toContain('ba-1');
  });

  it('names the connected user after the session displayName', async () => {
    const peer = await joinWith('p3_session=good');
    const joined = nextEvent<ConnectedUser>(peer, 'user:joined');
    await joinWith('p3_session=good');
    expect((await joined).name).toBe('Kylian');
  });

  it('room:join: does not announce a spectator but still sends project:state', async () => {
    const peer = await joinWith('p3_session=good');
    const joined = nextEvent<ConnectedUser>(peer, 'user:joined', 500).catch(() => 'timeout');
    const spectator = await joinRoomWith(undefined);
    expect(await joined).toBe('timeout');
    expect(spectator.connected).toBe(true);
  });

  it('room:join: announces a writer with the session displayName', async () => {
    const peer = await joinWith('p3_session=good');
    const joined = nextEvent<ConnectedUser>(peer, 'user:joined');
    await joinRoomWith('p3_session=good');
    expect((await joined).name).toBe('Kylian');
  });

  it('stroke:undoMine deletes only the caller-authored most recent stroke', async () => {
    const alice = await joinWith('p3_session=good');
    const bob = await joinWith('p3_session=good-bob');
    await commit(alice, 'a1');
    await commit(bob, 'b1');
    await commit(alice, 'a2');
    const deletedOnBob = nextEvent<string>(bob, 'stroke:deleted');
    const deletedOnAlice = nextEvent<string>(alice, 'stroke:deleted');
    alice.emit('stroke:undoMine');
    expect(await deletedOnBob).toBe('a2');
    expect(await deletedOnAlice).toBe('a2');
  });

  it('stroke:undoMine with nothing authored is a silent no-op', async () => {
    const alice = await joinWith('p3_session=good');
    const deleted = nextEvent<string>(alice, 'stroke:deleted', 500).catch(() => 'timeout');
    alice.emit('stroke:undoMine');
    expect(await deleted).toBe('timeout');
  });
});
