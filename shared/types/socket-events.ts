/**
 * Typed Socket.io event contracts shared by client and server.
 *
 * Usage on the server:
 *   new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>()
 *
 * Usage on the client (note reversed type parameter order):
 *   io() as Socket<ServerToClientEvents, ClientToServerEvents>
 */

import type { BrushStroke, StrokePreview, Point, Color } from './stroke.js';
import type { Layer } from './layer.js';
import type { Project } from './project.js';

/** A user connected to a drawing room. */
export interface ConnectedUser {
  id: string;
  name: string;
  /** Display color for cursor and user indicator. */
  color: Color;
}

export interface CursorPosition {
  userId: string;
  /** World-space position. */
  x: number;
  y: number;
}

// ---------------------------------------------------------------------------
// Server → Client events
// ---------------------------------------------------------------------------

export interface ServerToClientEvents {
  /** Full project state sent when a user first joins a room. */
  'project:state': (project: Project) => void;

  /** Another user committed a completed stroke. */
  'stroke:added': (stroke: BrushStroke) => void;

  /** Live preview of a stroke in progress (partial points). */
  'stroke:preview': (preview: StrokePreview) => void;

  /** Another user deleted a stroke by id. */
  'stroke:deleted': (strokeId: string) => void;

  /** Layer list changed (add, remove, reorder, rename). */
  'layer:updated': (layers: Layer[]) => void;

  /** User joined the current room. */
  'user:joined': (user: ConnectedUser) => void;

  /** User left the current room. */
  'user:left': (userId: string) => void;

  /** Cursor position broadcast from another user. */
  'cursor:moved': (cursor: CursorPosition) => void;

  /** Server error (e.g. room not found, permission denied). */
  error: (message: string) => void;
}

// ---------------------------------------------------------------------------
// Client → Server events
// ---------------------------------------------------------------------------

export interface ClientToServerEvents {
  /** Create a new room and receive back its id via callback. */
  'room:create': (callback: (roomId: string) => void) => void;

  /** Join an existing room by id. */
  'room:join': (roomId: string, callback: (error?: string) => void) => void;

  /** Commit a completed stroke to the room. */
  'stroke:commit': (stroke: BrushStroke) => void;

  /** Broadcast a live preview while drawing (throttled, ~60Hz). */
  'stroke:preview': (preview: StrokePreview) => void;

  /** Delete a stroke by id. */
  'stroke:delete': (strokeId: string) => void;

  /** Broadcast cursor world-space position (throttled, ~30Hz). */
  'cursor:move': (position: Point) => void;
}

// ---------------------------------------------------------------------------
// Server-side only
// ---------------------------------------------------------------------------

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  userId: string;
  roomId: string;
  user: ConnectedUser;
}
