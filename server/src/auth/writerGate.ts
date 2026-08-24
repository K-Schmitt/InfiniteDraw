import type { AuthUser, SessionValidator, SocketAuthState } from './types.js';
import { log } from '../debug/logger.js';

export interface GateSocket {
  data: { auth: SocketAuthState };
  emit(ev: 'auth:expired'): boolean;
}

export type WriterGate = (socket: GateSocket) => Promise<AuthUser | null>;

export interface WriterGateConfig {
  validator: SessionValidator;
  ttlMs: number;
}

/**
 * Authorization check for every write event. Fresh cache → cached user; stale cache →
 * lazy revalidation of the handshake cookie; failed revalidation → demote to spectator
 * and tell the client (spec §1: 30-min TTL, escalation path to live kick without
 * protocol changes).
 *
 * At expiry, live drawing fires ~120 write events/sec, each hitting this gate. Without dedup
 * every one of them would kick off its own validator call while the first is still in flight —
 * hundreds of concurrent requests to an already-slow backend, plus a reordering race and a
 * flood of `auth:expired`. `pending` caches the in-flight revalidation promise per auth state so
 * concurrent callers all await the same call; only its resolution mutates auth state and emits.
 */
export function createWriterGate(config: WriterGateConfig): WriterGate {
  const pending = new WeakMap<SocketAuthState, Promise<AuthUser | null>>();
  return async (socket): Promise<AuthUser | null> => {
    const auth = socket.data.auth;
    if (!auth.user) return null;
    if (Date.now() - auth.validatedAt < config.ttlMs) return auth.user;
    const inFlight = pending.get(auth);
    if (inFlight) return inFlight;
    // `revalidate` never rejects, so the `.finally()`-derived promise cannot become an
    // unhandled rejection — and it is the one we hand out, never a discarded chain.
    const revalidation = revalidate(socket, auth, config.validator)
      .finally(() => pending.delete(auth));
    pending.set(auth, revalidation);
    return revalidation;
  };
}

/** Runs the actual validator call and mutates `auth` once, for every awaiter to share. */
async function revalidate(
  socket: GateSocket,
  auth: SocketAuthState,
  validator: SessionValidator,
): Promise<AuthUser | null> {
  const priorUserId = auth.user?.id;
  // A throwing validator is treated like an invalid session: demote, never propagate.
  const revalidated = await validator(auth.cookieHeader).catch((err: unknown) => {
    log('error', 'revalidation threw, demoting', { message: (err as Error).message });
    return null;
  });
  auth.validatedAt = Date.now();
  if (revalidated) {
    auth.user = revalidated;
    return revalidated;
  }
  log('conn', 'session expired, demoting to spectator', { userId: priorUserId });
  auth.user = null;
  socket.emit('auth:expired');
  return null;
}
