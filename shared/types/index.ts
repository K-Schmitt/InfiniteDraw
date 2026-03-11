export type { Color, Point, BrushStroke, StrokePreview, StrokeType } from './stroke.js';
export { StrokeType, BYTES_PER_POINT, STROKE_HEADER_SIZE } from './stroke.js';

export type { Camera, Viewport, CameraBookmark } from './camera.js';
export { DEFAULT_CAMERA, MIN_ZOOM, MAX_ZOOM } from './camera.js';

export type { Layer, BlendMode } from './layer.js';
export { BlendMode, DEFAULT_LAYER } from './layer.js';

export type { Project, ProjectMeta, ProjectDelta } from './project.js';
export { FILE_FORMAT_VERSION } from './project.js';

export type {
  ConnectedUser,
  CursorPosition,
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
} from './socket-events.js';
