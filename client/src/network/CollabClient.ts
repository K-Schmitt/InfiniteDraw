import { Container, Graphics } from 'pixi.js';
import { io, type Socket } from 'socket.io-client';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  StrokeBeginPayload,
  StrokePointPayload,
  SerializableCamera,
} from '@shared/socket-events';
import type { BrushStroke, Color } from '@shared/stroke';
import type { CellAnchor } from '@shared/anchor';
import { toWireStroke, fromWireStroke, fromWireProject } from '@shared/wireStroke';
import { log, logThrottled, SESSION_ID } from '../debug/logger';
import type { HierCamera } from '../app/HierCamera';
import { projectToFrame, CULLED } from '../coords/viewProject';
import { nextReconnectAction } from './reconnectPolicy';

/** PixiApp implements this so CollabClient can modify state + renderer. */
export interface CollabDelegate {
  /** Bulk-load all strokes on room join. */
  loadSnapshot(strokes: readonly BrushStroke[]): void;
  /** Remote user committed a completed stroke. */
  remoteStrokeAdded(stroke: BrushStroke): void;
  /** Remote user deleted a stroke by id. */
  remoteStrokeDeleted(id: string): void;
  /** Remote user recolored a set of strokes (paint-bucket on existing shapes). */
  remoteStrokesRecolored(ids: readonly string[], color: Color): void;
  /** Remote user applied one atomic multi-stroke edit (eraser gesture). */
  remoteBatchApplied(deletes: readonly string[], adds: readonly BrushStroke[]): void;
}

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** A live remote stroke, pinned to the sender's camera cell at `stroke:begin` (frozen, like the
 *  local brush gesture) so it can be reprojected into the receiver's own camera every frame. */
interface LiveStroke {
  anchor: CellAnchor;
  color: Color;
  size: number;
  localPoints: { x: number; y: number }[];
  gfx: Graphics;
}

/** A remote user's cursor, anchored the same way as a live stroke. */
interface Ghost {
  gfx: Graphics;
  anchor: CellAnchor | null;
  local: { x: number; y: number } | null;
}

/** A cell anchor plus the sub-cell offset needed to turn frame-local points into anchor-local ones. */
interface OriginAnchor {
  anchor: CellAnchor;
  subX: number;
  subY: number;
}

const CURSOR_THROTTLE_MS = 200;
const GHOST_RADIUS = 5;

/**
 * Socket.io client for the single global room. Manages connection, snapshot load,
 * live stroke relay, ghost cursors, and remote previews. PixiApp owns one instance.
 * Live previews and ghost cursors are stored anchor-relative (frozen at the sender's camera
 * position when the gesture/cursor-move happened) and reprojected into the receiver's own
 * camera every frame via `refresh`, exactly like committed strokes.
 */
export class CollabClient {
  readonly remoteLayer = new Container();
  private readonly socket: TypedSocket;
  private readonly delegate: CollabDelegate;
  private readonly ghosts = new Map<string, Ghost>();
  private readonly liveStrokes = new Map<string, LiveStroke>();
  private readonly beginOrigins = new Map<string, OriginAnchor>();
  // Socket callbacks can land inside a render pass; freeing GPU buffers there corrupts the
  // active batch. Retired graphics are destroyed from `refresh`, i.e. between frames.
  private readonly pendingDestroy: Graphics[] = [];
  private lastCursorEmit = 0;
  private hasJoinedBefore = false;
  private connectCount = 0;

  constructor(serverUrl: string, delegate: CollabDelegate) {
    this.delegate = delegate;
    log('net', 'connecting', { serverUrl, session: SESSION_ID });
    // Mirrors server/src/CollabServer.ts's socketIoPath(): production assets are served under
    // Vite's `/draw/` base (the Coolify proxy only forwards that prefix to this container), so
    // Socket.io must connect under the same prefix instead of the default root `/socket.io/`.
    this.socket = io(serverUrl, { path: `${import.meta.env.BASE_URL}socket.io/` }) as TypedSocket;
    this.socket.on('connect', () => {
      log('net', 'CONNECTED', { socketId: this.socket.id, session: SESSION_ID });
      this.onConnect();
    });
    this.socket.on('disconnect', (reason) => log('net', 'DISCONNECTED', { reason }));
    this.socket.on('connect_error', (err) => log('error', 'connect_error', { message: err.message }));
    this.socket.on('project:state', (project) => {
      log('net', 'IN project:state', {
        strokes: project.strokes.length, meta: project.meta.name,
      });
      this.delegate.loadSnapshot(fromWireProject(project).strokes);
    });
    this.socket.on('stroke:added', (stroke) => {
      log('net', 'IN stroke:added', {
        id: stroke.id, zIndex: stroke.zIndex, ownerId: stroke.ownerId,
        points: stroke.points.length, color: stroke.color, anchorLevel: stroke.anchor.level,
        isOwnEcho: this.liveStrokes.has(stroke.id) || undefined,
      });
      this.onStrokeAdded(fromWireStroke(stroke));
    });
    this.socket.on('stroke:batch', (p) => {
      log('net', 'IN stroke:batch', { deletes: p.deletes.length, adds: p.adds.length });
      this.delegate.remoteBatchApplied(p.deletes, p.adds.map(fromWireStroke));
    });
    this.socket.on('stroke:deleted', (id) => {
      log('net', 'IN stroke:deleted', { id });
      this.delegate.remoteStrokeDeleted(id);
    });
    this.socket.on('stroke:recolored', (p) => {
      log('net', 'IN stroke:recolored', { ids: p.ids.length, color: p.color });
      this.delegate.remoteStrokesRecolored(p.ids, p.color);
    });
    this.socket.on('stroke:begin', (p) => this.onRemoteBegin(p));
    this.socket.on('stroke:point', (p) => this.onRemotePoint(p));
    this.socket.on('user:joined', (user) => log('net', 'IN user:joined', { user }));
    this.socket.on('user:left', (userId) => {
      log('net', 'IN user:left', { userId });
      this.removeGhost(userId);
    });
    this.socket.on('cursor:moved', (c) => this.moveGhost(c.userId, c.x, c.y, c.camera));
    this.socket.on('error', (msg) => log('error', 'server error', { message: msg }));
  }

  // ---- outgoing --------------------------------------------------------------

  sendStrokeBegin(payload: StrokeBeginPayload): void {
    log('net', 'OUT stroke:begin', {
      tentativeId: payload.tentativeId, color: payload.color, size: payload.size,
      camera: payload.camera, connected: this.socket.connected,
    });
    this.socket.emit('stroke:begin', payload);
  }

  sendStrokePoint(payload: StrokePointPayload): void {
    logThrottled('out:point', 100, () => ({
      cat: 'net', msg: 'OUT stroke:point',
      data: { tentativeId: payload.tentativeId, point: payload.point },
    }));
    this.socket.emit('stroke:point', payload);
  }

  sendStrokeCommit(stroke: BrushStroke): void {
    log('net', 'OUT stroke:commit', {
      id: stroke.id, type: stroke.type, points: stroke.points.length,
      color: stroke.color, size: stroke.size, filled: !!stroke.filled,
      anchorLevel: stroke.anchor.level, connected: this.socket.connected,
    });
    this.socket.emit('stroke:commit', toWireStroke(stroke));
  }

  sendStrokeDelete(id: string): void {
    log('net', 'OUT stroke:delete', { id, connected: this.socket.connected });
    this.socket.emit('stroke:delete', id);
  }

  sendStrokeBatch(batch: {
    readonly deletes: readonly string[];
    readonly adds: readonly BrushStroke[];
  }): void {
    log('net', 'OUT stroke:batch', {
      deletes: batch.deletes.length, adds: batch.adds.length, connected: this.socket.connected,
    });
    this.socket.emit('stroke:batch', {
      deletes: [...batch.deletes],
      adds: batch.adds.map(toWireStroke),
    });
  }

  sendStrokeRecolor(ids: readonly string[], color: Color): void {
    log('net', 'OUT stroke:recolor', { ids: ids.length, color, connected: this.socket.connected });
    this.socket.emit('stroke:recolor', { ids: [...ids], color });
  }

  broadcastCursor(x: number, y: number, camera: SerializableCamera): void {
    const now = performance.now();
    if (now - this.lastCursorEmit < CURSOR_THROTTLE_MS) return;
    this.lastCursorEmit = now;
    this.socket.emit('cursor:move', { x, y, camera });
  }

  disconnect(): void {
    this.socket.disconnect();
    this.remoteLayer.destroy({ children: true });
    this.ghosts.clear();
    this.liveStrokes.clear();
  }

  /** Reproject every live preview + ghost cursor into the current camera. Call once per frame. */
  refresh(camera: HierCamera): void {
    for (const gfx of this.pendingDestroy) gfx.destroy();
    this.pendingDestroy.length = 0;
    for (const stroke of this.liveStrokes.values()) this.redrawStroke(stroke, camera);
    for (const ghost of this.ghosts.values()) this.repositionGhost(ghost, camera);
  }

  // ---- incoming handlers -----------------------------------------------------

  private onConnect(): void {
    this.connectCount++;
    const action = nextReconnectAction({
      hasJoinedBefore: this.hasJoinedBefore,
      attempts: this.connectCount,
    });
    log('net', `connect -> ${action}`, { connectCount: this.connectCount });
    this.clearTransient();
    this.socket.emit('room:join', 'global', (error) => {
      if (error) {
        log('error', 'room:join failed', { error });
        return;
      }
      this.hasJoinedBefore = true;
    });
  }

  /** Drops live previews and ghosts: their tentative ids and peers are gone after a reconnect. */
  private clearTransient(): void {
    for (const id of [...this.liveStrokes.keys()]) this.removeLiveStroke(id);
    for (const userId of [...this.ghosts.keys()]) this.removeGhost(userId);
  }

  private onStrokeAdded(stroke: BrushStroke): void {
    this.removeLiveStroke(stroke.id);
    this.delegate.remoteStrokeAdded(stroke);
  }

  private onRemoteBegin(payload: StrokeBeginPayload): void {
    log('net', 'IN stroke:begin', {
      userId: payload.userId, tentativeId: payload.tentativeId,
      color: payload.color, size: payload.size, camera: payload.camera,
      liveStrokes: this.liveStrokes.size,
    });
    if (!payload.userId) return;
    this.removeLiveStroke(payload.tentativeId);
    const gfx = new Graphics();
    this.remoteLayer.addChild(gfx);
    const origin = anchorOf(payload.camera);
    this.liveStrokes.set(payload.tentativeId, {
      anchor: origin.anchor,
      color: payload.color,
      size: payload.size,
      localPoints: [],
      gfx,
    });
    this.beginOrigins.set(payload.tentativeId, origin);
    this.ensureGhost(payload.userId, payload.color);
  }

  private onRemotePoint(payload: StrokePointPayload): void {
    const stroke = this.liveStrokes.get(payload.tentativeId);
    const origin = this.beginOrigins.get(payload.tentativeId);
    if (!stroke || !origin) {
      log('net', 'IN stroke:point ORPHAN (no matching begin)', {
        tentativeId: payload.tentativeId, known: [...this.liveStrokes.keys()],
      });
      return;
    }
    logThrottled('in:point', 100, () => ({
      cat: 'net', msg: 'IN stroke:point',
      data: {
        tentativeId: payload.tentativeId, point: payload.point,
        bufferedPoints: stroke.localPoints.length,
      },
    }));
    stroke.localPoints.push({
      x: origin.subX + payload.point.x,
      y: origin.subY + payload.point.y,
    });
  }

  private removeLiveStroke(tentativeId: string): void {
    const stroke = this.liveStrokes.get(tentativeId);
    if (!stroke) return;
    this.remoteLayer.removeChild(stroke.gfx);
    this.pendingDestroy.push(stroke.gfx);
    this.liveStrokes.delete(tentativeId);
    this.beginOrigins.delete(tentativeId);
  }

  private redrawStroke(stroke: LiveStroke, camera: HierCamera): void {
    const screenPoints: { x: number; y: number }[] = [];
    for (const p of stroke.localPoints) {
      const proj = projectToFrame(stroke.anchor, p.x, p.y, camera.projCamera);
      if (proj === CULLED) continue;
      screenPoints.push(camera.frameToScreen(proj.fx, proj.fy));
    }
    stroke.gfx.clear();
    if (screenPoints.length === 0) {
      stroke.gfx.visible = false;
      return;
    }
    stroke.gfx.visible = true;
    stroke.gfx.moveTo(screenPoints[0]!.x, screenPoints[0]!.y);
    for (const p of screenPoints.slice(1)) stroke.gfx.lineTo(p.x, p.y);
    stroke.gfx.stroke({
      color: rgba(stroke.color),
      alpha: stroke.color.a / 255,
      width: Math.max(1, stroke.size),
      cap: 'round',
      join: 'round',
    });
  }

  // ---- ghost cursors ---------------------------------------------------------

  private ensureGhost(id: string, color: Color): void {
    if (this.ghosts.has(id)) return;
    const gfx = new Graphics();
    gfx.circle(0, 0, GHOST_RADIUS).fill({ color: rgba(color), alpha: 0.8 });
    gfx.visible = false;
    this.remoteLayer.addChild(gfx);
    this.ghosts.set(id, { gfx, anchor: null, local: null });
  }

  private moveGhost(userId: string, x: number, y: number, camera: SerializableCamera): void {
    if (!this.ghosts.has(userId)) this.ensureGhost(userId, DEFAULT_GHOST_COLOR);
    const ghost = this.ghosts.get(userId)!;
    const origin = anchorOf(camera);
    ghost.anchor = origin.anchor;
    ghost.local = { x: origin.subX + x, y: origin.subY + y };
  }

  private repositionGhost(ghost: Ghost, camera: HierCamera): void {
    if (!ghost.anchor || !ghost.local) return;
    const proj = projectToFrame(ghost.anchor, ghost.local.x, ghost.local.y, camera.projCamera);
    if (proj === CULLED) {
      ghost.gfx.visible = false;
      return;
    }
    ghost.gfx.visible = true;
    const screen = camera.frameToScreen(proj.fx, proj.fy);
    ghost.gfx.position.set(screen.x, screen.y);
  }

  private removeGhost(userId: string): void {
    const ghost = this.ghosts.get(userId);
    if (ghost) {
      this.remoteLayer.removeChild(ghost.gfx);
      this.pendingDestroy.push(ghost.gfx);
      this.ghosts.delete(userId);
    }
  }
}

const DEFAULT_GHOST_COLOR: Color = { r: 128, g: 128, b: 128, a: 255 };

/** A frozen camera cell/level plus the sub-cell offset needed to anchor frame-local points. */
function anchorOf(camera: SerializableCamera): OriginAnchor {
  return {
    anchor: { level: camera.level, cell: { x: BigInt(camera.cellX), y: BigInt(camera.cellY) } },
    subX: camera.subX,
    subY: camera.subY,
  };
}

function rgba(c: Color): number {
  return (c.r << 16) | (c.g << 8) | c.b;
}
