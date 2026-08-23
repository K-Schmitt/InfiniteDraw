import type { SessionValidator } from './types.js';

export interface DevBypassEnv {
  DEV_USER?: string;
  NODE_ENV?: string;
}

/**
 * Double lock (spec §6): the cross-subdomain cookie is production-only, so dev
 * needs a fabricated session — but a leaked DEV_USER in production must be
 * inert AND fatal at boot.
 */
export function applyDevBypass(
  inner: SessionValidator,
  env: DevBypassEnv
): SessionValidator {
  const devUser = env.NODE_ENV !== 'production' ? env.DEV_USER : undefined;
  if (!devUser) return inner;
  return async () => ({ id: `dev-${devUser}`, name: devUser });
}

export function assertDevUserSafety(env: DevBypassEnv): void {
  if (env.DEV_USER && env.NODE_ENV === 'production') {
    throw new Error('DEV_USER must not be set in production — refusing to start');
  }
}
