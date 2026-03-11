/**
 * Layer types for the multi-layer canvas system.
 *
 * Layers are ordered by `order` (ascending = bottom). Blend modes map directly
 * to CSS/Canvas2D `globalCompositeOperation` values or PixiJS BLEND_MODES.
 */

export const BlendMode = {
  NORMAL: 'normal',
  MULTIPLY: 'multiply',
  SCREEN: 'screen',
  OVERLAY: 'overlay',
  DARKEN: 'darken',
  LIGHTEN: 'lighten',
  ADD: 'lighter',
} as const;

export type BlendMode = (typeof BlendMode)[keyof typeof BlendMode];

export interface Layer {
  id: string;
  name: string;
  blendMode: BlendMode;
  /** Layer transparency: 0.0 (invisible) – 1.0 (fully opaque). */
  opacity: number;
  visible: boolean;
  locked: boolean;
  /** Z-order index. Lower = further back. */
  order: number;
}

export const DEFAULT_LAYER: Omit<Layer, 'id' | 'name' | 'order'> = {
  blendMode: BlendMode.NORMAL,
  opacity: 1.0,
  visible: true,
  locked: false,
};
