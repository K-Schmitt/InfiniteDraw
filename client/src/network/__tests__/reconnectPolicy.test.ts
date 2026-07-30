import { describe, it, expect } from 'vitest';
import { nextReconnectAction } from '../reconnectPolicy';

describe('nextReconnectAction', () => {
  it('joins on the first connect', () => {
    expect(nextReconnectAction({ hasJoinedBefore: false, attempts: 0 })).toBe('join');
  });

  it('resyncs on every reconnect', () => {
    expect(nextReconnectAction({ hasJoinedBefore: true, attempts: 1 })).toBe('resync');
    expect(nextReconnectAction({ hasJoinedBefore: true, attempts: 9 })).toBe('resync');
  });
});
