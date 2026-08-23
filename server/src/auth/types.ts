/** Authenticated Better Auth identity. Server-side only — never emitted on the wire. */
export interface AuthUser {
  readonly id: string;
  readonly name: string;
}

/** Resolves a raw Cookie header to a session user, or null (no/invalid/unreachable). */
export type SessionValidator = (cookieHeader: string | undefined) => Promise<AuthUser | null>;

/** Per-socket auth state cached at handshake, revalidated lazily on write. */
export interface SocketAuthState {
  user: AuthUser | null;
  cookieHeader: string | undefined;
  validatedAt: number;
}
