import { type Server as HttpServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Server } from 'socket.io';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
  ConnectedUser,
  CursorMovePayload,
  RecolorPayload,
  StrokeBatchPayload,
  StrokeBeginPayload,
  StrokePointPayload,
} from '@shared/socket-events.js';
import type { BrushStroke, StrokePreview } from '@shared/stroke.js';
import type { Project } from '@shared/project.js';
import { toWireStroke, fromWireStroke, toWireProject, type WireStroke } from '@shared/wireStroke.js';
import { GlobalRoom } from './room/GlobalRoom.js';
import { StrokeJournal } from './storage/StrokeJournal.js';
import { applyBatchOrder } from './batchOrder.js';
import { log } from './debug/logger.js';
import type { SessionValidator } from './auth/types.js';
import { createWriterGate } from './auth/writerGate.js';
import { WriteRateLimit } from './auth/writeRateLimit.js';
import {
  attachAuthMiddleware,
  createWriteAuthorizer,
  type CollabSocket,
  type WriteAuthorizer,
} from './auth/socketAuthorizer.js';

/** Auth wiring handed to `CollabServer`: who may write, how sessions revalidate, how fast. */
export interface CollabAuthConfig {
  validator: SessionValidator;
  ttlMs?: number;
  rateLimit?: WriteRateLimit;
}

/**
 * Socket.io wiring for the single global room. Owns connection lifecycle, event relay,
 * and zIndex assignment (server is the authority on paint order). Does NOT modify
 * GlobalRoom's storage logic — it only calls its public API.
 */
export class CollabServer {
  private readonly io: Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >;
  private room: GlobalRoom | null = null;
  private nextZ = 0;
  private readonly authorizeWrite: WriteAuthorizer;

  constructor(
    httpServer: HttpServer,
    private readonly journalPath: string,
    auth: CollabAuthConfig,
  ) {
    const gate = createWriterGate({ validator: auth.validator, ttlMs: auth.ttlMs ?? 30 * 60_000 });
    const rateLimit = auth.rateLimit ?? new WriteRateLimit({ capacity: 1200, refillPerSecond: 240 });
    this.authorizeWrite = createWriteAuthorizer(gate, rateLimit);
    this.io = new Server<
      ClientToServerEvents,
      ServerToClientEvents,
      InterServerEvents,
      SocketData
    >(httpServer, { cors: { origin: allowedOrigins() } });

    attachAuthMiddleware(this.io, auth.validator);
    this.io.on('connection', (socket) => this.onConnection(socket));
  }

  // ---- connection lifecycle -------------------------------------------------

  private onConnection(socket: CollabSocket): void {
    log('conn', 'socket connected', {
      socketId: socket.id,
      address: socket.handshake.address,
      transport: socket.conn.transport.name,
      totalSockets: this.io.engine.clientsCount,
    });

    socket.on('room:create', (cb) => { void this.handleCreate(socket, cb); });
    socket.on('room:join', (roomId, cb) => { void this.handleJoin(socket, roomId, cb); });
    this.registerWriteHandlers(socket);
    socket.on('cursor:move', (pos) => this.handleCursor(socket, pos));

    socket.on('disconnect', (reason) => {
      log('conn', 'socket disconnected', { socketId: socket.id, userId: socket.data.userId, reason });
      this.handleDisconnect(socket);
    });
    socket.on('error', (err: Error) => {
      log('error', 'socket error', { socketId: socket.id, message: err.message, stack: err.stack });
    });
  }

  /** Registers every write event behind the shared `authorizeWrite` gate. */
  private registerWriteHandlers(socket: CollabSocket): void {
    socket.on('stroke:begin', (p) => this.gated(socket, () => this.handleBegin(socket, p)));
    socket.on('stroke:point', (p) => this.gated(socket, () => this.handlePoint(socket, p)));
    socket.on('stroke:commit', (s) => this.gated(socket, () => this.handleCommit(socket, s)));
    socket.on('stroke:batch', (p) => this.gated(socket, () => this.handleBatch(socket, p)));
    socket.on('stroke:preview', (p) => this.gated(socket, () => this.handlePreview(socket, p)));
    socket.on('stroke:delete', (id) => this.gated(socket, () => this.handleDelete(socket, id)));
    socket.on('stroke:recolor', (p) => this.gated(socket, () => this.handleRecolor(socket, p)));
  }

  /** Runs `action` only once `authorizeWrite` clears the socket for a write. */
  private gated(socket: CollabSocket, action: () => void | Promise<void>): void {
    void (async () => {
      if (!(await this.authorizeWrite(socket))) return;
      await action();
    })();
  }

  private handleBegin(socket: CollabSocket, p: StrokeBeginPayload): void {
    log('net', 'IN stroke:begin', {
      socketId: socket.id, userId: socket.data.userId,
      tentativeId: p.tentativeId, color: p.color, size: p.size, camera: p.camera,
    });
    this.relay(socket, 'stroke:begin', { ...p, userId: socket.data.userId! });
  }

  private handlePoint(socket: CollabSocket, p: StrokePointPayload): void {
    log('net', 'IN stroke:point', {
      socketId: socket.id, tentativeId: p.tentativeId, point: p.point,
    });
    this.relay(socket, 'stroke:point', { ...p, userId: socket.data.userId! });
  }

  private handlePreview(socket: CollabSocket, p: StrokePreview): void {
    log('net', 'IN stroke:preview', { socketId: socket.id, id: p.id, points: p.points.length });
    this.relay(socket, 'stroke:preview', p);
  }

  private async handleCreate(
    socket: CollabSocket,
    callback: (roomId: string) => void,
  ): Promise<void> {
    const room = await this.getOrCreateRoom();
    const strokes = room.snapshot();
    const isWriter = socket.data.auth.user !== null;
    if (isWriter) {
      const user = this.makeUser(socket);
      socket.data.user = user;
      socket.data.userId = user.id;
      room.addUser(user);
      socket.to('global').emit('user:joined', user);
    }
    socket.data.roomId = 'global';
    await socket.join('global');
    log('conn', 'room:create', {
      socketId: socket.id, isWriter, strokesSent: strokes.length, usersInRoom: room.users().length,
    });
    socket.emit('project:state', toWireProject(emptyProject(strokes)));
    callback('global');
  }

  private async handleJoin(
    socket: CollabSocket,
    _roomId: string,
    callback: (error?: string) => void,
  ): Promise<void> {
    const room = await this.getOrCreateRoom();
    const strokes = room.snapshot();
    const isWriter = socket.data.auth.user !== null;
    if (isWriter) {
      const user = this.makeUser(socket);
      socket.data.user = user;
      socket.data.userId = user.id;
      room.addUser(user);
      socket.to('global').emit('user:joined', user);
    }
    socket.data.roomId = 'global';
    await socket.join('global');
    log('conn', 'room:join', {
      socketId: socket.id, requested: _roomId, isWriter,
      strokesSent: strokes.length, usersInRoom: room.users().length,
    });
    socket.emit('project:state', toWireProject(emptyProject(strokes)));
    callback();
  }

  private handleDisconnect(socket: CollabSocket): void {
    if (!this.room || !socket.data.userId) return;
    this.room.removeUser(socket.data.userId);
    log('room', 'user removed', {
      userId: socket.data.userId, remaining: this.room.users().length,
    });
    this.io.to('global').emit('user:left', socket.data.userId);
  }

  // ---- stroke relay ---------------------------------------------------------

  private relay<T extends keyof ServerToClientEvents>(
    socket: CollabSocket,
    event: T,
    ...args: Parameters<ServerToClientEvents[T]>
  ): void {
    if (!socket.data.roomId) return;
    socket.to(socket.data.roomId).emit(event, ...args);
  }

  private async handleCommit(
    socket: CollabSocket,
    wire: WireStroke,
  ): Promise<void> {
    if (!this.room || !socket.data.roomId) return;
    const stroke = fromWireStroke(wire);
    const err = validateStroke(stroke);
    if (err) {
      log('error', 'stroke:commit REJECTED', { socketId: socket.id, id: wire.id, reason: err });
      socket.emit('error', err);
      return;
    }
    stroke.ownerId = socket.data.userId;
    const authorId = socket.data.auth.user?.id;
    if (authorId !== undefined) stroke.authorId = authorId;
    stroke.zIndex = this.nextZ++;
    await this.room.addStroke(stroke);
    log('net', 'IN stroke:commit -> OUT stroke:added', {
      socketId: socket.id, userId: socket.data.userId, id: stroke.id,
      type: stroke.type, color: stroke.color, size: stroke.size,
      points: stroke.points.length, holes: stroke.holes?.length ?? 0, filled: !!stroke.filled,
      anchorLevel: stroke.anchor.level, zIndex: stroke.zIndex,
      roomStrokes: this.room.size(),
    });
    this.io.to(socket.data.roomId).emit('stroke:added', toWireStroke(stroke));
  }

  // Applies a whole eraser gesture as one wire message: deletes first, then the remnants in one
  // zIndex block, then a single broadcast. NOT atomic against a concurrent `room:join` — each
  // delete/add is a separately-awaited journal append (real fs I/O, a real event-loop yield), so
  // a join landing mid-loop can observe a torn snapshot (deletes applied, adds not yet).
  // Accepted for this project's room size and traffic; if that changes, serialize room-mutating
  // handlers behind a per-room promise chain rather than trusting the word "atomic".
  // (`nextZ` itself is safe: its read/compute/write has no `await` between them.)
  // Rebroadcast to the room including the author, so the author adopts the authoritative order
  // exactly as `stroke:added` already does.
  private async handleBatch(
    socket: CollabSocket,
    payload: StrokeBatchPayload,
  ): Promise<void> {
    if (!this.room || !socket.data.roomId) return;
    for (const id of payload.deletes) await this.room.deleteStroke(id);
    const incoming = payload.adds.map(fromWireStroke).filter((s) => validateStroke(s) === null);
    const authorId = socket.data.auth.user?.id;
    const ordered = applyBatchOrder(incoming, {
      nextZ: this.nextZ,
      ownerId: socket.data.userId!,
      preserveOrder: payload.preserveOrder === true,
      ...(authorId !== undefined ? { authorId } : {}),
    });
    this.nextZ = ordered.nextZ;
    for (const stroke of ordered.strokes) await this.room.addStroke(stroke);
    log('net', 'IN stroke:batch -> OUT stroke:batch', {
      socketId: socket.id, userId: socket.data.userId,
      deletes: payload.deletes.length, adds: ordered.strokes.length,
      rejected: payload.adds.length - incoming.length, roomStrokes: this.room.size(),
    });
    this.io.to(socket.data.roomId).emit('stroke:batch', {
      deletes: payload.deletes,
      adds: ordered.strokes.map(toWireStroke),
    });
  }

  private async handleDelete(
    socket: CollabSocket,
    strokeId: string,
  ): Promise<void> {
    // No ownership check: the room is a shared canvas and the vector eraser works by
    // replace (delete the touched stroke, commit its remnants). Refusing another user's
    // delete leaves the original in place while remnants keep accumulating every
    // pointermove — unbounded stroke growth that stalls every client.
    if (!this.room || !socket.data.roomId) return;
    const existed = this.room.has(strokeId);
    await this.room.deleteStroke(strokeId);
    log('net', 'IN stroke:delete -> OUT stroke:deleted', {
      socketId: socket.id, userId: socket.data.userId, id: strokeId,
      existed, roomStrokes: this.room.size(),
    });
    socket.to(socket.data.roomId).emit('stroke:deleted', strokeId);
  }

  private async handleRecolor(
    socket: CollabSocket,
    payload: RecolorPayload,
  ): Promise<void> {
    if (!this.room || !socket.data.roomId) return;
    if (!Array.isArray(payload.ids) || payload.ids.length === 0) return;
    const applied = await this.room.recolorStrokes(payload.ids, payload.color);
    if (applied.length === 0) return;
    log('net', 'IN stroke:recolor -> OUT stroke:recolored', {
      socketId: socket.id, userId: socket.data.userId,
      requested: payload.ids.length, applied: applied.length, color: payload.color,
    });
    socket.to(socket.data.roomId).emit('stroke:recolored', { ids: applied, color: payload.color });
  }

  // ---- cursor ---------------------------------------------------------------

  private handleCursor(socket: CollabSocket, position: CursorMovePayload): void {
    if (!socket.data.auth.user) return;
    if (!socket.data.roomId || !socket.data.userId) return;
    log('net', 'IN cursor:move', {
      socketId: socket.id, userId: socket.data.userId,
      x: position.x, y: position.y, level: position.camera.level,
    });
    socket.to(socket.data.roomId).emit('cursor:moved', {
      userId: socket.data.userId,
      x: position.x,
      y: position.y,
      camera: position.camera,
    });
  }

  // ---- helpers --------------------------------------------------------------

  private async getOrCreateRoom(): Promise<GlobalRoom> {
    if (!this.room) {
      const journal = await StrokeJournal.open(this.journalPath);
      this.room = GlobalRoom.create(journal);
      // replay zIndex counter past any persisted strokes
      for (const s of this.room.snapshot()) {
        if (s.zIndex >= this.nextZ) this.nextZ = s.zIndex + 1;
      }
      log('room', 'room created from journal', {
        journalPath: this.journalPath, strokesLoaded: this.room.size(), nextZ: this.nextZ,
      });
    }
    return this.room;
  }

  private makeUser(
    socket: CollabSocket,
  ): ConnectedUser {
    const colors: ConnectedUser['color'][] = [
      { r: 59, g: 130, b: 246, a: 255 },
      { r: 239, g: 68, b: 68, a: 255 },
      { r: 34, g: 197, b: 94, a: 255 },
      { r: 251, g: 146, b: 60, a: 255 },
      { r: 168, g: 85, b: 247, a: 255 },
    ];
    // `%` binds tighter than `??`, so the old form indexed by the raw user count and handed
    // out `undefined` past the 5th user — every client then crashed reading `.r` off it.
    const index = (this.room?.users().length ?? 0) % colors.length;
    return {
      id: randomUUID(),
      name: socket.data.auth.user?.name ?? `User-${socket.id.slice(0, 5)}`,
      color: colors[index]!,
    };
  }
}

/**
 * Socket.io origins. In production the client is served from this same origin, so CORS is
 * irrelevant and the dev default would *block* the real site — hence `true` (reflect the
 * request origin) when CLIENT_ORIGIN is unset in production. Set CLIENT_ORIGIN to a
 * comma-separated allowlist to pin it.
 */
function allowedOrigins(): string[] | boolean {
  const configured = process.env['CLIENT_ORIGIN'];
  if (configured) return configured.split(',').map((o) => o.trim());
  return process.env['NODE_ENV'] === 'production' ? true : ['http://localhost:5173'];
}

function emptyProject(strokes: readonly BrushStroke[]): Project {
  const now = new Date().toISOString();
  return {
    meta: { id: 'global', name: 'Global Room', createdAt: now, modifiedAt: now },
    layers: [],
    strokes: [...strokes],
    bookmarks: [],
  };
}

const MAX_ID_LENGTH = 256;

function validateStroke(stroke: BrushStroke): string | null {
  if (!stroke.id || stroke.id.length > MAX_ID_LENGTH) return 'invalid stroke id';
  if (!stroke.layerId || stroke.layerId.length > MAX_ID_LENGTH) return 'invalid layerId';
  if (!stroke.points || stroke.points.length === 0) return 'stroke has no points';
  if (stroke.points.length !== stroke.pressures.length) {
    return 'points/pressures length mismatch';
  }
  return null;
}
