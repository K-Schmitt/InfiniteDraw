import { type Server as HttpServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Server, type Socket } from 'socket.io';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
  ConnectedUser,
} from '@shared/socket-events.js';
import type { BrushStroke } from '@shared/stroke.js';
import type { Project } from '@shared/project.js';
import { GlobalRoom } from './room/GlobalRoom.js';
import { StrokeJournal } from './storage/StrokeJournal.js';

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

  constructor(httpServer: HttpServer, private readonly journalPath = 'data/journal.bin') {
    this.io = new Server<
      ClientToServerEvents,
      ServerToClientEvents,
      InterServerEvents,
      SocketData
    >(httpServer, { cors: { origin: '*' } });

    this.io.on('connection', (socket) => this.onConnection(socket));
  }

  // ---- connection lifecycle -------------------------------------------------

  private onConnection(
    socket: Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>,
  ): void {
    socket.on('room:create', (cb) => { void this.handleCreate(socket, cb); });
    socket.on('room:join', (roomId, cb) => { void this.handleJoin(socket, roomId, cb); });

    socket.on('stroke:begin', (p) => {
      this.relay(socket, 'stroke:begin', { ...p, userId: socket.data.userId! });
    });
    socket.on('stroke:point', (p) => {
      this.relay(socket, 'stroke:point', { ...p, userId: socket.data.userId! });
    });
    socket.on('stroke:commit', (s) => { void this.handleCommit(socket, s); });
    socket.on('stroke:preview', (p) => this.relay(socket, 'stroke:preview', p));
    socket.on('stroke:delete', (id) => { void this.handleDelete(socket, id); });
    socket.on('cursor:move', (pos) => this.handleCursor(socket, pos));

    socket.on('disconnect', () => this.handleDisconnect(socket));
  }

  private async handleCreate(
    socket: Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>,
    callback: (roomId: string) => void,
  ): Promise<void> {
    const room = await this.getOrCreateRoom();
    const user = this.makeUser(socket);
    socket.data.user = user;
    socket.data.userId = user.id;
    socket.data.roomId = 'global';
    await socket.join('global');
    room.addUser(user);
    socket.emit('project:state', emptyProject(room.snapshot()));
    socket.to('global').emit('user:joined', user);
    callback('global');
  }

  private async handleJoin(
    socket: Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>,
    _roomId: string,
    callback: (error?: string) => void,
  ): Promise<void> {
    const room = await this.getOrCreateRoom();
    const user = this.makeUser(socket);
    socket.data.user = user;
    socket.data.userId = user.id;
    socket.data.roomId = 'global';
    await socket.join('global');
    room.addUser(user);
    socket.emit('project:state', emptyProject(room.snapshot()));
    socket.to('global').emit('user:joined', user);
    callback();
  }

  private handleDisconnect(
    socket: Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>,
  ): void {
    if (!this.room || !socket.data.userId) return;
    this.room.removeUser(socket.data.userId);
    this.io.to('global').emit('user:left', socket.data.userId);
  }

  // ---- stroke relay ---------------------------------------------------------

  private relay<T extends keyof ServerToClientEvents>(
    socket: Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>,
    event: T,
    ...args: Parameters<ServerToClientEvents[T]>
  ): void {
    if (!socket.data.roomId) return;
    socket.to(socket.data.roomId).emit(event, ...args);
  }

  private async handleCommit(
    socket: Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>,
    stroke: BrushStroke,
  ): Promise<void> {
    if (!this.room || !socket.data.roomId) return;
    stroke.zIndex = this.nextZ++;
    await this.room.addStroke(stroke);
    socket.to(socket.data.roomId).emit('stroke:added', stroke);
  }

  private async handleDelete(
    socket: Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>,
    strokeId: string,
  ): Promise<void> {
    if (!this.room || !socket.data.roomId) return;
    await this.room.deleteStroke(strokeId);
    socket.to(socket.data.roomId).emit('stroke:deleted', strokeId);
  }

  // ---- cursor ---------------------------------------------------------------

  private handleCursor(
    socket: Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>,
    position: { x: number; y: number },
  ): void {
    if (!socket.data.roomId || !socket.data.userId) return;
    socket.to(socket.data.roomId).emit('cursor:moved', {
      userId: socket.data.userId,
      x: position.x,
      y: position.y,
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
    }
    return this.room;
  }

  private makeUser(
    socket: Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>,
  ): ConnectedUser {
    const colors: ConnectedUser['color'][] = [
      { r: 59, g: 130, b: 246, a: 255 },
      { r: 239, g: 68, b: 68, a: 255 },
      { r: 34, g: 197, b: 94, a: 255 },
      { r: 251, g: 146, b: 60, a: 255 },
      { r: 168, g: 85, b: 247, a: 255 },
    ];
    return {
      id: randomUUID(),
      name: `User-${socket.id.slice(0, 5)}`,
      color: colors[this.room?.users().length ?? 0 % colors.length]!,
    };
  }
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
