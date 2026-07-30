export interface ReconnectState {
  readonly hasJoinedBefore: boolean;
  readonly attempts: number;
}

/**
 * What a fresh socket connection should do.
 *
 * A reconnect always resyncs rather than replaying buffered local edits: while this client was
 * offline, peers committed strokes whose server-assigned `zIndex` cannot be interleaved with the
 * local history, so the authoritative snapshot is the only consistent state. Local undo history
 * is discarded with it — that is a deliberate trade, documented in NOTES.md.
 */
export function nextReconnectAction(state: ReconnectState): 'join' | 'resync' {
  return state.hasJoinedBefore ? 'resync' : 'join';
}
