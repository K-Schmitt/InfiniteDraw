import type { Color } from '@shared/stroke';

/** Default palette swatches (opaque). */
export const PALETTE: readonly Color[] = [
  { r: 20, g: 20, b: 20, a: 255 },
  { r: 255, g: 255, b: 255, a: 255 },
  { r: 120, g: 120, b: 120, a: 255 },
  { r: 230, g: 30, b: 40, a: 255 },
  { r: 245, g: 130, b: 30, a: 255 },
  { r: 250, g: 210, b: 40, a: 255 },
  { r: 60, g: 180, b: 75, a: 255 },
  { r: 40, g: 130, b: 200, a: 255 },
  { r: 70, g: 50, b: 160, a: 255 },
  { r: 200, g: 60, b: 160, a: 255 },
  { r: 150, g: 90, b: 50, a: 255 },
  { r: 245, g: 200, b: 175, a: 255 },
];

function channel(n: number): string {
  return Math.round(n).toString(16).padStart(2, '0');
}

export function colorToHex(c: Color): string {
  return `#${channel(c.r)}${channel(c.g)}${channel(c.b)}`;
}

export function hexToColor(hex: string, alpha = 255): Color {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: alpha };
}

export function cssColor(c: Color): string {
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${(c.a / 255).toFixed(3)})`;
}
