import { describe, it, expect, vi, afterEach } from 'vitest';
import { createSessionValidator } from '../auth/sessionClient.js';

const ENDPOINT = 'https://api.example.test/api/auth/get-session';

function mockFetchOnce(impl: typeof fetch): void {
  vi.stubGlobal('fetch', vi.fn(impl));
}

afterEach(() => vi.unstubAllGlobals());

describe('createSessionValidator', () => {
  it('returns the user for a valid session response', async () => {
    mockFetchOnce(async () =>
      new Response(JSON.stringify({ session: { id: 's1' }, user: { id: 'u1', name: 'Kylian' } })),
    );
    const validate = createSessionValidator({ endpoint: ENDPOINT, timeoutMs: 2500 });
    expect(await validate('p3_session=abc')).toEqual({ id: 'u1', name: 'Kylian' });
  });

  it('forwards the cookie header verbatim', async () => {
    const spy = vi.fn(async () => new Response('null'));
    vi.stubGlobal('fetch', spy);
    const validate = createSessionValidator({ endpoint: ENDPOINT, timeoutMs: 2500 });
    await validate('p3_session=abc; other=1');
    const [, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).get('cookie')).toBe('p3_session=abc; other=1');
  });

  it('returns null when the API answers null (no session)', async () => {
    mockFetchOnce(async () => new Response('null'));
    const validate = createSessionValidator({ endpoint: ENDPOINT, timeoutMs: 2500 });
    expect(await validate('p3_session=abc')).toBeNull();
  });

  it('returns null without calling fetch when no cookie header', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    const validate = createSessionValidator({ endpoint: ENDPOINT, timeoutMs: 2500 });
    expect(await validate(undefined)).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('fails open (null) on network error', async () => {
    mockFetchOnce(async () => { throw new Error('ECONNREFUSED'); });
    const validate = createSessionValidator({ endpoint: ENDPOINT, timeoutMs: 2500 });
    expect(await validate('p3_session=abc')).toBeNull();
  });

  it('fails open (null) on timeout', async () => {
    mockFetchOnce((_url, init) =>
      new Promise((_res, rej) => {
        (init?.signal as AbortSignal).addEventListener('abort', () =>
          rej(new DOMException('aborted', 'AbortError')));
      }) as Promise<Response>);
    const validate = createSessionValidator({ endpoint: ENDPOINT, timeoutMs: 20 });
    expect(await validate('p3_session=abc')).toBeNull();
  });

  it('fails open (null) on non-200 response', async () => {
    mockFetchOnce(async () => new Response('oops', { status: 502 }));
    const validate = createSessionValidator({ endpoint: ENDPOINT, timeoutMs: 2500 });
    expect(await validate('p3_session=abc')).toBeNull();
  });

  it('returns null on malformed user payload', async () => {
    mockFetchOnce(async () => new Response(JSON.stringify({ user: { id: 42 } })));
    const validate = createSessionValidator({ endpoint: ENDPOINT, timeoutMs: 2500 });
    expect(await validate('p3_session=abc')).toBeNull();
  });
});
