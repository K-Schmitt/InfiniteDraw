import { describe, it, expect, vi } from 'vitest';
import { applyDevBypass, assertDevUserSafety } from '../auth/devBypass.js';

const never = vi.fn(async () => null);

describe('applyDevBypass', () => {
  it('fabricates a session in non-production when DEV_USER is set', async () => {
    const validate = applyDevBypass(never, { DEV_USER: 'kylian', NODE_ENV: 'development' });
    expect(await validate(undefined)).toEqual({ id: 'dev-kylian', name: 'kylian' });
    expect(never).not.toHaveBeenCalled();
  });

  it('delegates to the inner validator when DEV_USER is unset', async () => {
    const inner = vi.fn(async () => ({ id: 'u1', name: 'Real' }));
    const validate = applyDevBypass(inner, { NODE_ENV: 'development' });
    expect(await validate('p3_session=x')).toEqual({ id: 'u1', name: 'Real' });
  });

  it('never bypasses in production even if DEV_USER leaks', async () => {
    const validate = applyDevBypass(never, { DEV_USER: 'kylian', NODE_ENV: 'production' });
    expect(await validate('p3_session=x')).toBeNull();
  });
});

describe('assertDevUserSafety', () => {
  it('throws when DEV_USER is set in production', () => {
    expect(() => assertDevUserSafety({ DEV_USER: 'x', NODE_ENV: 'production' })).toThrow();
  });
  it('passes otherwise', () => {
    expect(() => assertDevUserSafety({ NODE_ENV: 'production' })).not.toThrow();
    expect(() => assertDevUserSafety({ DEV_USER: 'x', NODE_ENV: 'development' })).not.toThrow();
  });
});
