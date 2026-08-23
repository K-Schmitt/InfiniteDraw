import { describe, it, expect, vi } from 'vitest';
import { createWriterGate, type GateSocket } from '../auth/writerGate.js';

const USER = { id: 'u1', name: 'K' };

function socketWith(auth: GateSocket['data']['auth']): GateSocket & { emitted: string[] } {
  const emitted: string[] = [];
  return { data: { auth }, emit: (ev: 'auth:expired') => (emitted.push(ev), true), emitted };
}

describe('createWriterGate', () => {
  it('returns null for a spectator without revalidating', async () => {
    const validator = vi.fn();
    const gate = createWriterGate({ validator, ttlMs: 1000 });
    const s = socketWith({ user: null, cookieHeader: undefined, validatedAt: Date.now() });
    expect(await gate(s)).toBeNull();
    expect(validator).not.toHaveBeenCalled();
  });

  it('returns the cached user while the TTL is fresh', async () => {
    const validator = vi.fn();
    const gate = createWriterGate({ validator, ttlMs: 60_000 });
    const s = socketWith({ user: USER, cookieHeader: 'c', validatedAt: Date.now() });
    expect(await gate(s)).toEqual(USER);
    expect(validator).not.toHaveBeenCalled();
  });

  it('revalidates after TTL expiry and refreshes validatedAt', async () => {
    const validator = vi.fn(async () => USER);
    const gate = createWriterGate({ validator, ttlMs: 10 });
    const s = socketWith({ user: USER, cookieHeader: 'c', validatedAt: Date.now() - 50 });
    expect(await gate(s)).toEqual(USER);
    expect(validator).toHaveBeenCalledWith('c');
    expect(Date.now() - s.data.auth.validatedAt).toBeLessThan(1000);
  });

  it('demotes to spectator and emits auth:expired when revalidation fails', async () => {
    const validator = vi.fn(async () => null);
    const gate = createWriterGate({ validator, ttlMs: 10 });
    const s = socketWith({ user: USER, cookieHeader: 'c', validatedAt: Date.now() - 50 });
    expect(await gate(s)).toBeNull();
    expect(s.data.auth.user).toBeNull();
    expect(s.emitted).toEqual(['auth:expired']);
  });
});
