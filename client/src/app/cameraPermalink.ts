import type { ProjCamera } from '../coords/viewProject';
import { log } from '../debug/logger';

const FIELD_COUNT = 5;

/**
 * Camera position as a URL fragment. This is the closest thing the project has to an absolute
 * address: there are no world coordinates, so a shareable location *is* a quadtree level plus a
 * BigInt cell plus a sub-cell offset. It is also the demo — a link that opens at 2^-137 zoom on a
 * drawing inside a drawing is something no fixed-precision canvas can produce.
 */
export function encodeCamera(camera: ProjCamera): string {
  const parts = [
    String(camera.level),
    camera.cell.x.toString(),
    camera.cell.y.toString(),
    encodeFloat(camera.sub.x),
    encodeFloat(camera.sub.y),
  ];
  return `#l${parts.join('.')}`;
}

export function decodeCamera(hash: string): ProjCamera | null {
  const body = hash.replace(/^#/, '');
  if (!body.startsWith('l')) return null;
  const parts = body.slice(1).split('.');
  if (parts.length !== FIELD_COUNT) return null;
  const level = Number(parts[0]);
  const cellX = toBigInt(parts[1]!);
  const cellY = toBigInt(parts[2]!);
  const subX = decodeFloat(parts[3]!);
  const subY = decodeFloat(parts[4]!);
  if (!Number.isInteger(level) || cellX === null || cellY === null) return null;
  if (!Number.isFinite(subX) || !Number.isFinite(subY)) return null;
  return { level, cell: { x: cellX, y: cellY }, sub: { x: subX, y: subY } };
}

/** `.` separates fields, so a float's decimal point is escaped to `_` to keep the split exact. */
function encodeFloat(value: number): string {
  return value.toString().replace('.', '_');
}

function decodeFloat(text: string): number {
  return Number(text.replace('_', '.'));
}

function toBigInt(text: string): bigint | null {
  if (!/^-?\d+$/.test(text)) return null;
  return BigInt(text);
}

/**
 * Writes the camera into the URL and the clipboard: a shareable address for a position that
 * no fixed-precision canvas can represent. The clipboard write is awaited and guarded — an
 * unhandled rejection otherwise, in an insecure context or when permission is denied.
 */
export async function writePermalink(camera: ProjCamera): Promise<void> {
  const hash = encodeCamera(camera);
  window.history.replaceState(null, '', hash);
  try {
    await navigator.clipboard?.writeText(window.location.href);
  } catch {
    log('camera', 'clipboard write failed (insecure context or permission denied)', { hash });
    return;
  }
  log('camera', 'permalink copied', { hash });
}
