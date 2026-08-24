import type { Server, Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from '@shared/socket-events.js';
import { log } from '../debug/logger.js';
import type { AuthUser, SessionValidator, SocketAuthState } from './types.js';
import type { WriterGate } from './writerGate.js';
import type { WriteRateLimit } from './writeRateLimit.js';

export type CollabIo =
  Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

export type CollabSocket =
  Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

/** Per-connection write authorization check: spectator → auth:denied, flood → silent drop. */
export type WriteAuthorizer = (socket: CollabSocket) => Promise<AuthUser | null>;

/**
 * Handshake middleware: resolves the session once per connection and caches it on the socket.
 * Always calls `next()` — an unresolved or invalid session becomes a spectator rather than a
 * rejected connection, so the room stays visible (read-only) even without a session. The
 * two-argument `.then(ok, fail)` is load-bearing: a rejecting validator must still reach
 * `next()` (socket.io never times out a pending `io.use` middleware), and the failure branch
 * must NOT also fire when `ok` itself throws after calling `next()` — a chained `.catch()`
 * would call `next()` twice. The trailing `.catch()` only logs.
 */
export function attachAuthMiddleware(io: CollabIo, validator: SessionValidator): void {
  io.use((socket, next) => {
    const cookieHeader = socket.handshake.headers.cookie;
    const onResolved = (user: AuthUser | null): void => {
      socket.data.auth = spectatorState(cookieHeader, user);
      next(); // always next(): fail-open to spectator
    };
    const onRejected = (): void => {
      socket.data.auth = spectatorState(cookieHeader, null);
      next(); // validator rejected: fail-open to spectator, same as an invalid session
    };
    void validator(cookieHeader).then(onResolved, onRejected).catch((err: unknown) => {
      log('error', 'auth middleware handler threw', { message: (err as Error).message });
    });
  });
}

function spectatorState(
  cookieHeader: string | undefined,
  user: AuthUser | null,
): SocketAuthState {
  return { user, cookieHeader, validatedAt: Date.now() };
}

/** Builds the per-write guard used by every write handler: gate check, then rate limit. */
export function createWriteAuthorizer(
  gate: WriterGate,
  rateLimit: WriteRateLimit,
): WriteAuthorizer {
  return async (socket) => {
    const gateSocket = { data: socket.data, emit: (ev: 'auth:expired') => socket.emit(ev) };
    const user = await gate(gateSocket);
    if (!user) {
      socket.emit('auth:denied');
      return null;
    }
    if (!rateLimit.allow(user.id)) return null; // silent drop; flood, not confusion
    return user;
  };
}
