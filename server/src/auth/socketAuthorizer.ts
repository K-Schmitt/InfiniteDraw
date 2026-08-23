import type { Server, Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from '@shared/socket-events.js';
import type { AuthUser, SessionValidator } from './types.js';
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
 * rejected connection, so the room stays visible (read-only) even without a session.
 */
export function attachAuthMiddleware(io: CollabIo, validator: SessionValidator): void {
  io.use((socket, next) => {
    void validator(socket.handshake.headers.cookie).then((user) => {
      socket.data.auth = {
        user,
        cookieHeader: socket.handshake.headers.cookie,
        validatedAt: Date.now(),
      };
      next(); // always next(): fail-open to spectator
    });
  });
}

/** Builds the per-write guard used by every write handler: gate check, then rate limit. */
export function createWriteAuthorizer(gate: WriterGate, rateLimit: WriteRateLimit): WriteAuthorizer {
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
