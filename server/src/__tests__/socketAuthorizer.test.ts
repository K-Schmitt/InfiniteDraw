import { describe, it, expect } from 'vitest';
import type { SessionValidator } from '../auth/types.js';
import {
  attachAuthMiddleware,
  type CollabIo,
  type CollabSocket,
} from '../auth/socketAuthorizer.js';

type Middleware = (socket: CollabSocket, next: (err?: Error) => void) => void;

/** Captures the single middleware `attachAuthMiddleware` registers via `io.use`. */
function captureMiddleware(validator: SessionValidator): Middleware {
  let middleware: Middleware = () => {};
  const io = { use: (fn: Middleware) => { middleware = fn; } } as unknown as CollabIo;
  attachAuthMiddleware(io, validator);
  return middleware;
}

function fakeSocket(cookie?: string): CollabSocket {
  return { handshake: { headers: { cookie } }, data: {} } as unknown as CollabSocket;
}

describe('attachAuthMiddleware', () => {
  it('fails open to a spectator when the validator rejects', async () => {
    const rejecting: SessionValidator = async () => { throw new Error('backend unreachable'); };
    const middleware = captureMiddleware(rejecting);
    const socket = fakeSocket('p3_session=whatever');
    let nextCalled = false;
    await new Promise<void>((resolve) => {
      middleware(socket, () => { nextCalled = true; resolve(); });
    });
    // The bug this guards: without a `.catch()`, `next()` is never called and the
    // handshake hangs forever instead of failing open to a read-only spectator.
    expect(nextCalled).toBe(true);
    expect(socket.data.auth.user).toBeNull();
  });

  it('still resolves the session normally when the validator succeeds', async () => {
    const user = { id: 'u1', name: 'K' };
    const validator: SessionValidator = async () => user;
    const middleware = captureMiddleware(validator);
    const socket = fakeSocket('p3_session=good');
    await new Promise<void>((resolve) => middleware(socket, () => resolve()));
    expect(socket.data.auth.user).toEqual(user);
  });

  it('calls next() exactly once even when next() itself throws', async () => {
    const ok: SessionValidator = async () => ({ id: 'u1', name: 'K' });
    const middleware = captureMiddleware(ok);
    const socket = fakeSocket('p3_session=x');
    let calls = 0;
    middleware(socket, () => { calls += 1; throw new Error('downstream blew up'); });
    await new Promise((r) => setTimeout(r, 10));
    expect(calls).toBe(1);
  });
});
