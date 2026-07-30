import { log } from './logger';

/**
 * Captures failures that otherwise vanish or land without context:
 * uncaught exceptions, rejected promises, and WebGL context loss (which presents as a frozen
 * or blank canvas rather than a JS error, so it is easy to misread as "the app hung").
 *
 * On any of these the recent trace is dumped alongside the error, so the buffered
 * high-frequency categories (pointer, render) are visible for the moments before the failure.
 */
export function installErrorHooks(canvas: HTMLCanvasElement): void {
  window.addEventListener('error', (e) => {
    log('error', 'uncaught exception', {
      message: e.message,
      source: `${e.filename}:${e.lineno}:${e.colno}`,
      stack: e.error instanceof Error ? e.error.stack : undefined,
    });
  });

  window.addEventListener('unhandledrejection', (e) => {
    log('error', 'unhandled rejection', {
      reason: e.reason instanceof Error ? e.reason.stack : String(e.reason),
    });
  });

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    log('gl', 'WEBGL CONTEXT LOST — canvas is dead until restore', {
      note: 'usually a GPU-side fault: bad geometry, buffer overrun, or driver reset',
    });
  });

  canvas.addEventListener('webglcontextrestored', () => log('gl', 'webgl context restored'));

  document.addEventListener('visibilitychange', () => {
    log('life', 'visibility', { state: document.visibilityState });
  });

  window.addEventListener('beforeunload', () => log('life', 'unload'));
}

/** Wraps a handler so a throw is logged with context instead of silently killing the gesture. */
export function guarded<A extends unknown[]>(
  label: string,
  fn: (...args: A) => void,
): (...args: A) => void {
  return (...args: A): void => {
    try {
      fn(...args);
    } catch (err) {
      log('error', `THROW in ${label}`, {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
      throw err;
    }
  };
}
