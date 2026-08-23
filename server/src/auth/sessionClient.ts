import type { AuthUser, SessionValidator } from './types.js';
import { log } from '../debug/logger.js';

export interface SessionValidatorConfig {
  endpoint: string;
  timeoutMs: number;
}

interface GetSessionBody {
  user?: { id?: unknown; name?: unknown };
}

/**
 * Server-to-server Better Auth session check. Fail-open by design: any error, timeout,
 * or malformed body yields null (spectator) — a MyBackend incident must never take
 * InfiniteDraw down with it.
 */
export function createSessionValidator(config: SessionValidatorConfig): SessionValidator {
  return async (cookieHeader): Promise<AuthUser | null> => {
    if (!cookieHeader) return null;
    try {
      const res = await fetch(config.endpoint, {
        headers: { cookie: cookieHeader },
        signal: AbortSignal.timeout(config.timeoutMs),
      });
      if (!res.ok) return null;
      const body = (await res.json()) as GetSessionBody | null;
      return toAuthUser(body);
    } catch (err) {
      log('error', 'get-session failed open', { message: (err as Error).message });
      return null;
    }
  };
}

function toAuthUser(body: GetSessionBody | null): AuthUser | null {
  const user = body?.user;
  if (!user || typeof user.id !== 'string') return null;
  return { id: user.id, name: typeof user.name === 'string' && user.name ? user.name : 'User' };
}
