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
 */
export function createWriterGate(config: WriterGateConfig): WriterGate {
  return async (socket): Promise<AuthUser | null> => {
    const auth = socket.data.auth;
    if (!auth.user) return null;
    if (Date.now() - auth.validatedAt < config.ttlMs) return auth.user;
    const revalidated = await config.validator(auth.cookieHeader);
    auth.validatedAt = Date.now();
    if (revalidated) {
      auth.user = revalidated;
      return revalidated;
    }
    log('conn', 'session expired, demoting to spectator', { userId: auth.user.id });
    auth.user = null;
    socket.emit('auth:expired');
    return null;
  };
}
