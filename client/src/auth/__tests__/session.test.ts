import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchSessionUser } from '../session';

afterEach(() => vi.unstubAllGlobals());

describe('fetchSessionUser', () => {
  it('returns the user with credentials included', async () => {
    const spy = vi.fn(async () =>
      new Response(JSON.stringify({ user: { id: 'u1', name: 'Kylian' } })));
    vi.stubGlobal('fetch', spy);
    expect(await fetchSessionUser()).toEqual({ id: 'u1', name: 'Kylian' });
    expect(spy.mock.calls.length).toBeGreaterThan(0);
    const [, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.credentials).toBe('include');
  });

  it('returns null on null body, error status, or network failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('null')));
    expect(await fetchSessionUser()).toBeNull();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('x', { status: 500 }))
    );
    expect(await fetchSessionUser()).toBeNull();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      })
    );
    expect(await fetchSessionUser()).toBeNull();
  });
});
