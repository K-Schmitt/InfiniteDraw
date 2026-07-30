import { describe, it, expect } from 'vitest';
import { syncSnapshot } from '../snapshotSync';
import { RemoteStrokeQueue, type RemoteOpSink } from '../RemoteStrokeQueue';
import type { CanvasState } from '../../state/CanvasState';
import type { BrushStroke } from '@shared/stroke';

type FakeCanvasState = Pick<CanvasState, 'strokes' | 'loadSnapshot'>;

function fakeStroke(id: string): BrushStroke {
  return { id } as unknown as BrushStroke;
}

/**
 * Minimal CanvasState stand-in: a real mutable stroke list, mirroring exactly the one property
 * (`loadSnapshot` bulk-replaces `strokes` synchronously) that made the shipped bug possible — no
 * Pixi/renderer/undo-history baggage needed to reproduce it.
 */
function fakeState(): FakeCanvasState {
  let all: BrushStroke[] = [];
  return {
    get strokes(): readonly BrushStroke[] {
      return all;
    },
    loadSnapshot(strokes: readonly BrushStroke[]): void {
      all = [...strokes];
    },
  };
}

/** An isEcho-style sink mirroring PixiApp.applyRemoteAdd: skips `applyAdd` for an id `state`
 * already has, but `applyForceAdd` always renders. `rendered` records what actually got drawn. */
function isEchoSink(
  hasStroke: (id: string) => boolean,
): { sink: RemoteOpSink; rendered: string[] } {
  const rendered: string[] = [];
  const sink: RemoteOpSink = {
    hasStroke,
    applyAdd: (s) => {
      if (hasStroke(s.id)) return; // isEcho: "already rendered" — the exact v4.0.1 bug condition
      rendered.push(s.id);
    },
    applyForceAdd: (s) => {
      rendered.push(s.id);
    },
    applyDelete: () => {},
  };
  return { sink, rendered };
}

describe('syncSnapshot — the real PixiApp.loadSnapshot wiring', () => {
  it('renders every incoming stroke through the production function', () => {
    const state = fakeState();
    const { sink, rendered } = isEchoSink((id) => state.strokes.some((s) => s.id === id));
    const queue = new RemoteStrokeQueue(sink);
    const incoming = [fakeStroke('s1'), fakeStroke('s2'), fakeStroke('s3')];

    syncSnapshot(incoming, state, queue);
    queue.flush(100);

    // This calls the actual exported syncSnapshot — the same function PixiApp.loadSnapshot
    // delegates to. If that function's body is ever reverted to use enqueueAdd instead of
    // enqueueForceAdd, this assertion fails because the isEcho sink swallows every stroke.
    expect(rendered).toEqual(['s1', 's2', 's3']);
  });

  it('removes every stroke dropped from the previous room', () => {
    const state = fakeState();
    state.loadSnapshot([fakeStroke('old1'), fakeStroke('old2')]);
    const deletes: string[] = [];
    const sink: RemoteOpSink = {
      hasStroke: (id) => state.strokes.some((s) => s.id === id),
      applyAdd: () => {},
      applyForceAdd: () => {},
      applyDelete: (id) => deletes.push(id),
    };
    const queue = new RemoteStrokeQueue(sink);

    syncSnapshot([fakeStroke('new1')], state, queue);
    queue.flush(100);

    expect(deletes.sort()).toEqual(['old1', 'old2']);
  });

  it('reproduces the shipped bug when the call site uses enqueueAdd instead', () => {
    // Same state-then-enqueue ordering syncSnapshot uses internally, but deliberately calling
    // enqueueAdd — the exact one-line regression that shipped in v4.0.1: nothing renders.
    const state = fakeState();
    const { sink, rendered } = isEchoSink((id) => state.strokes.some((s) => s.id === id));
    const queue = new RemoteStrokeQueue(sink);
    const incoming = [fakeStroke('s1'), fakeStroke('s2'), fakeStroke('s3')];

    state.loadSnapshot(incoming); // mirrors syncSnapshot's own bulk-replace step
    for (const s of incoming) queue.enqueueAdd(s); // the WRONG call — what shipped
    queue.flush(100);

    expect(rendered).toEqual([]); // proves the bug: isEcho swallows every stroke
  });
});
