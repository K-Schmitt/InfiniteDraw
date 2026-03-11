/**
 * Project-level types.
 *
 * A Project is the top-level container saved to a `.lorien` file.
 * The binary format begins with:
 *   u32  VERSION_NUMBER
 *   pascal_string  metadata  (key=value,key=value,...)
 *   [stroke records...]
 */

import type { BrushStroke } from './stroke.js';
import type { Layer } from './layer.js';
import type { CameraBookmark } from './camera.js';

/** Current file format version. Increment on breaking format changes. */
export const FILE_FORMAT_VERSION = 1;

/**
 * Key-value metadata stored in the file header.
 * All values are strings (matching the Lorien pascal-string format).
 */
export interface ProjectMeta {
  id: string;
  name: string;
  /** ISO 8601 date string. */
  createdAt: string;
  /** ISO 8601 date string. */
  modifiedAt: string;
}

export interface Project {
  meta: ProjectMeta;
  layers: Layer[];
  strokes: BrushStroke[];
  bookmarks: CameraBookmark[];
}

/** Delta sent over the wire: only new/changed data, not the full project. */
export interface ProjectDelta {
  addedStrokes?: BrushStroke[];
  deletedStrokeIds?: string[];
  updatedLayers?: Layer[];
}
