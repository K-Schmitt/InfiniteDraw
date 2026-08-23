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

  // Live drawing fires one gate() call per write event (~120/s). Without dedup, every one of
  // them would kick off its own validator call while the first is still in flight.
  it('dedups concurrent revalidation into a single validator call', async () => {
    let resolveValidator!: (user: typeof USER) => void;
    const validator = vi.fn(
      () => new Promise<typeof USER>((resolve) => { resolveValidator = resolve; }),
    );
    const gate = createWriterGate({ validator, ttlMs: 10 });
    const s = socketWith({ user: USER, cookieHeader: 'c', validatedAt: Date.now() - 50 });
    const first = gate(s);
    const second = gate(s);
    resolveValidator(USER);
    expect(await first).toEqual(USER);
    expect(await second).toEqual(USER);
    expect(validator).toHaveBeenCalledTimes(1);
  });

  it('emits auth:expired exactly once for concurrent failing revalidation', async () => {
    let resolveValidator!: (user: null) => void;
    const validator = vi.fn(
      () => new Promise<null>((resolve) => { resolveValidator = resolve; }),
    );
    const gate = createWriterGate({ validator, ttlMs: 10 });
    const s = socketWith({ user: USER, cookieHeader: 'c', validatedAt: Date.now() - 50 });
    const first = gate(s);
    const second = gate(s);
    resolveValidator(null);
    expect(await first).toBeNull();
    expect(await second).toBeNull();
    expect(validator).toHaveBeenCalledTimes(1);
    expect(s.emitted).toEqual(['auth:expired']);
  });
});
