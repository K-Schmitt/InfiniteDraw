/**
 * Typed Socket.io event contracts shared by client and server.
 *
 * Usage on the server:
 *   new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>()
 *
 * Usage on the client (note reversed type parameter order):
 *   io() as Socket<ServerToClientEvents, ClientToServerEvents>
 */

import type { StrokePreview, Point, Color } from './stroke.js';
import type { Layer } from './layer.js';
import type { WireStroke, WireProject } from './wireStroke.js';

/**
 * One atomic multi-stroke edit. An eraser gesture deletes the strokes it touched and adds their
 * remnants; sending those as hundreds of individual events is what stalled receiving peers, so
 * the whole gesture crosses the wire — and the journal — as one message.
 */
export interface StrokeBatchPayload {
  deletes: string[];
  adds: WireStroke[];
}

/** A user connected to a drawing room. */
export interface ConnectedUser {
  id: string;
  name: string;
  /** Display color for cursor and user indicator. */
  color: Color;
}

export interface CursorPosition {
  userId: string;
  /** Sender's camera-frame-local position; receivers reproject via `camera`. */
  x: number;
  y: number;
  camera: SerializableCamera;
}

/** Paint-bucket recolor of one or more existing strokes to a single color. */
export interface RecolorPayload {
  ids: string[];
  color: Color;
}

/** Sent on cursor move — frame-local position plus the camera it's relative to. */
export interface CursorMovePayload {
  x: number;
  y: number;
  camera: SerializableCamera;
}

/**
 * Camera parameters serialized for the network.
 * BigInt cell coordinates become strings; sub is float in [0, LOCAL_SPAN).
 */
export interface SerializableCamera {
  level: number;
  cellX: string;
  cellY: string;
  subX: number;
  subY: number;
}

/** Sent on pointer down — enough info for receivers to show a ghost preview. */
export interface StrokeBeginPayload {
  /** Server-injected; sender's connected user id. Set by server on relay. */
  userId?: string;
  tentativeId: string;
  color: Color;
  size: number;
  camera: SerializableCamera;
}

/** Sent on each pointer move during a live stroke. */
export interface StrokePointPayload {
  /** Server-injected; sender's connected user id. Set by server on relay. */
  userId?: string;
  tentativeId: string;
  point: Point;
}

// ---------------------------------------------------------------------------
// Server → Client events
// ---------------------------------------------------------------------------

export interface ServerToClientEvents {
  /** Full project state sent when a user first joins a room. */
  'project:state': (project: WireProject) => void;

  /** Another user committed a completed stroke. */
  'stroke:added': (stroke: WireStroke) => void;

  /** Live preview of a stroke in progress (partial points). */
  'stroke:preview': (preview: StrokePreview) => void;

  /** Another user began a stroke — show ghost cursor + preview anchor. */
  'stroke:begin': (payload: StrokeBeginPayload) => void;

  /** A point was added to a live stroke in progress. */
  'stroke:point': (payload: StrokePointPayload) => void;

  /** Another user deleted a stroke by id. */
  'stroke:deleted': (strokeId: string) => void;

  /** Another user recolored a set of strokes (paint-bucket on existing shapes). */
  'stroke:recolored': (payload: RecolorPayload) => void;

  /** An atomic multi-stroke edit (eraser gesture). */
  'stroke:batch': (payload: StrokeBatchPayload) => void;

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

  /** Emitted on pointer down — receivers show ghost cursor + preview anchor. */
  'stroke:begin': (payload: StrokeBeginPayload) => void;

  /** Emitted on each pointer move during a live stroke. */
  'stroke:point': (payload: StrokePointPayload) => void;

  /** Commit a completed stroke to the room. */
  'stroke:commit': (stroke: WireStroke) => void;

  /** Broadcast a live preview while drawing (throttled, ~60Hz). */
  'stroke:preview': (preview: StrokePreview) => void;

  /** Delete a stroke by id. */
  'stroke:delete': (strokeId: string) => void;

  /** Recolor a set of strokes to one color (paint-bucket on existing shapes). */
  'stroke:recolor': (payload: RecolorPayload) => void;

  /** An atomic multi-stroke edit (eraser gesture). */
  'stroke:batch': (payload: StrokeBatchPayload) => void;

  /** Broadcast cursor position, frame-local to the sender's camera (throttled, ~30Hz). */
  'cursor:move': (position: CursorMovePayload) => void;
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
