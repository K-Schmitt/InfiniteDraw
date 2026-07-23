import { Container, Graphics } from 'pixi.js';
import { io, type Socket } from 'socket.io-client';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  StrokeBeginPayload,
  StrokePointPayload,
} from '@shared/socket-events';
import type { BrushStroke } from '@shared/stroke';

/** PixiApp implements this so CollabClient can modify state + renderer. */
export interface CollabDelegate {
  /** Bulk-load all strokes on room join. */
  loadSnapshot(strokes: readonly BrushStroke[]): void;
  /** Remote user committed a completed stroke. */
  remoteStrokeAdded(stroke: BrushStroke): void;
  /** Remote user deleted a stroke by id. */
  remoteStrokeDeleted(id: string): void;
}

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const CURSOR_THROTTLE_MS = 200;
const GHOST_RADIUS = 5;
const PREVIEW_WIDTH = 2;

/**
 * Socket.io client for the single global room. Manages connection, snapshot load,
 * live stroke relay, ghost cursors, and remote previews. PixiApp owns one instance.
 */
export class CollabClient {
  readonly remoteLayer = new Container();
  private readonly socket: TypedSocket;
  private readonly delegate: CollabDelegate;
  private readonly ghosts = new Map<string, Graphics>();
  private readonly previews = new Map<string, Graphics>();
  private readonly activeStrokes = new Map<string, StrokeBeginPayload>();
  private lastCursorEmit = 0;

  constructor(serverUrl: string, delegate: CollabDelegate) {
    this.delegate = delegate;
    this.socket = io(serverUrl) as TypedSocket;
    this.socket.on('connect', () => this.onConnect());
    this.socket.on('project:state', (project) => this.delegate.loadSnapshot(project.strokes));
    this.socket.on('stroke:added', (stroke) => this.delegate.remoteStrokeAdded(stroke));
    this.socket.on('stroke:deleted', (id) => this.delegate.remoteStrokeDeleted(id));
    this.socket.on('stroke:begin', (p) => this.onRemoteBegin(p));
    this.socket.on('stroke:point', (p) => this.onRemotePoint(p));
    this.socket.on('user:joined', (_user) => {});
    this.socket.on('user:left', (userId) => this.removeGhost(userId));
    this.socket.on('cursor:moved', (c) => this.moveGhost(c.userId, c.x, c.y));
    this.socket.on('error', (msg) => console.warn('[Collab] server error:', msg));
  }

  // ---- outgoing --------------------------------------------------------------

  sendStrokeBegin(payload: StrokeBeginPayload): void {
    this.socket.emit('stroke:begin', payload);
  }

  sendStrokePoint(payload: StrokePointPayload): void {
    this.socket.emit('stroke:point', payload);
  }

  sendStrokeCommit(stroke: BrushStroke): void {
    this.socket.emit('stroke:commit', stroke);
  }

  sendStrokeDelete(id: string): void {
    this.socket.emit('stroke:delete', id);
  }

  broadcastCursor(x: number, y: number): void {
    const now = performance.now();
    if (now - this.lastCursorEmit < CURSOR_THROTTLE_MS) return;
    this.lastCursorEmit = now;
    this.socket.emit('cursor:move', { x, y });
  }

  disconnect(): void {
    this.socket.disconnect();
    this.remoteLayer.destroy({ children: true });
    this.ghosts.clear();
    this.previews.clear();
  }

  // ---- incoming handlers -----------------------------------------------------

  private onConnect(): void {
    this.socket.emit('room:create', (_roomId) => {
      // connected and synced
    });
  }

  private onRemoteBegin(payload: StrokeBeginPayload): void {
    if (!payload.userId) return;
    this.activeStrokes.set(payload.tentativeId, payload);
    const gfx = new Graphics();
    gfx.setStrokeStyle({ color: rgba(payload.color), width: 1 });
    gfx.circle(0, 0, payload.size / 2).stroke();
    this.previews.set(payload.tentativeId, gfx);
    this.remoteLayer.addChild(gfx);
    this.ensureGhost(payload.userId, payload.color);
  }

  private onRemotePoint(payload: StrokePointPayload): void {
    if (!payload.userId) return;
    const gfx = this.previews.get(payload.tentativeId);
    if (!gfx) return;
    const { x, y } = payload.point;
    gfx.circle(x, y, PREVIEW_WIDTH / 2).fill({ color: gfx.strokeStyle.color });
    this.moveGhost(payload.userId, x, y);
  }

  // ---- ghost cursors ---------------------------------------------------------

  private ensureGhost(id: string, color: { r: number; g: number; b: number; a: number }): void {
    if (this.ghosts.has(id)) return;
    const gfx = new Graphics();
    gfx.circle(0, 0, GHOST_RADIUS).fill({ color: rgba(color), alpha: 0.8 });
    this.ghosts.set(id, gfx);
    this.remoteLayer.addChild(gfx);
  }

  private moveGhost(userId: string, x: number, y: number): void {
    const gfx = this.ghosts.get(userId);
    if (gfx) gfx.position.set(x, y);
  }

  private removeGhost(userId: string): void {
    const gfx = this.ghosts.get(userId);
    if (gfx) {
      this.remoteLayer.removeChild(gfx);
      gfx.destroy();
      this.ghosts.delete(userId);
    }
  }
}

function rgba(c: { r: number; g: number; b: number; a: number }): number {
  return (c.r << 16) | (c.g << 8) | c.b;
}
