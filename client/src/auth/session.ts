/** UI-state session check. NEVER used for authorization — the server enforces. */
export interface SessionUser {
  readonly id: string;
  readonly name: string;
}

export const LOGIN_URL =
  'https://slackliniste.com/login?redirect=/draw';

const GET_SESSION = 'https://api.slackliniste.com/api/auth/get-session';

export async function fetchSessionUser(): Promise<SessionUser | null> {
  const devUser = import.meta.env.DEV
    ? import.meta.env['VITE_DEV_USER']
    : undefined;
  if (typeof devUser === 'string' && devUser)
    return { id: 'dev', name: devUser };
  try {
    const res = await fetch(GET_SESSION, { credentials: 'include' });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      user?: { id?: unknown; name?: unknown };
    } | null;
    const user = body?.user;
    if (!user || typeof user.id !== 'string') return null;
    return {
      id: user.id,
      name:
        typeof user.name === 'string' && user.name ? user.name : 'User',
    };
  } catch {
    return null;
  }
}
