import { describe, it, expect, vi } from 'vitest';
import { RemoteStrokeQueue, type RemoteOpSink } from '../RemoteStrokeQueue';
import type { BrushStroke } from '@shared/stroke';

function fakeStroke(id: string): BrushStroke {
  return { id } as unknown as BrushStroke;
}

/** A sink recording calls; `hasStroke` returns true only for ids listed as already committed. */
function makeSink(committed: readonly string[] = []): {
  sink: RemoteOpSink; adds: string[]; forceAdds: string[]; deletes: string[];
} {
  const adds: string[] = [];
  const forceAdds: string[] = [];
  const deletes: string[] = [];
  const sink: RemoteOpSink = {
    hasStroke: (id) => committed.includes(id),
    applyAdd: (s) => { adds.push(s.id); },
    applyForceAdd: (s) => { forceAdds.push(s.id); },
    applyDelete: (id) => { deletes.push(id); },
  };
  return { sink, adds, forceAdds, deletes };
}

describe('RemoteStrokeQueue coalescing', () => {
  it('cancels an add then delete of the same uncommitted id — no Graphics built', () => {
    const { sink, adds, deletes } = makeSink();
    const q = new RemoteStrokeQueue(sink);
    q.enqueueAdd(fakeStroke('a'));
    q.enqueueDelete('a');
    expect(q.size).toBe(0);
    q.flush(100);
    expect(adds).toEqual([]);
    expect(deletes).toEqual([]);
  });

  it('keeps a delete of an already-committed stroke even with a queued echo add', () => {
    const { sink, deletes } = makeSink(['a']); // 'a' already in state (own echo / prior batch)
    const q = new RemoteStrokeQueue(sink);
    q.enqueueAdd(fakeStroke('a'));
    q.enqueueDelete('a');
    q.flush(100);
    expect(deletes).toEqual(['a']);
  });

  it('applies a plain add and a plain delete of distinct ids', () => {
    const { sink, adds, deletes } = makeSink(['b']);
    const q = new RemoteStrokeQueue(sink);
    q.enqueueAdd(fakeStroke('a'));
    q.enqueueDelete('b');
    q.flush(100);
    expect(adds).toEqual(['a']);
    expect(deletes).toEqual(['b']);
  });

  it('coalesces repeat adds of one id to a single apply', () => {
    const { sink, adds } = makeSink();
    const q = new RemoteStrokeQueue(sink);
    q.enqueueAdd(fakeStroke('a'));
    q.enqueueAdd(fakeStroke('a'));
    expect(q.size).toBe(1);
    q.flush(100);
    expect(adds).toEqual(['a']);
  });
});

describe('RemoteStrokeQueue time budget', () => {
  it('stops draining once the budget elapses and resumes next flush', () => {
    const { sink, adds } = makeSink();
    const q = new RemoteStrokeQueue(sink);
    q.enqueueAdd(fakeStroke('a'));
    q.enqueueAdd(fakeStroke('b'));
    q.enqueueAdd(fakeStroke('c'));
    // Stub the clock so each applied op "costs" 4ms — deterministic, no CPU spin that would
    // perturb sibling perf benchmarks. Sequence: start=0, then +4 after each op is applied.
    const times = [0, 4, 8, 12];
    let i = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => times[Math.min(i++, times.length - 1)]);
    q.flush(3); // start 0, after first op now=4 ≥ 3 → stop
    expect(adds.length).toBe(1);
    expect(q.size).toBe(2);
    vi.restoreAllMocks();
    q.flush(100); // real clock, drain the rest
    expect(adds.length).toBe(3);
    expect(q.size).toBe(0);
  });

  it('drains a reconnect snapshot across multiple tick()-style flushes, not one', () => {
    // Stands in for PixiApp.loadSnapshot enqueueing a whole room (N strokes) on reconnect: the
    // queue must spread that across frames instead of committing it all inside one flush call.
    const ids = ['s1', 's2', 's3', 's4', 's5'];
    const { sink, forceAdds } = makeSink(ids); // state already has every id (post-loadSnapshot)
    const q = new RemoteStrokeQueue(sink);
    for (const id of ids) q.enqueueForceAdd(fakeStroke(id));
    // Each applied op "costs" 4ms — deterministic, no CPU spin.
    const times = [0, 4, 8, 12, 16, 20];
    let i = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => times[Math.min(i++, times.length - 1)]);
    q.flush(3); // one "tick": budget exceeded after the first op
    expect(forceAdds.length).toBeLessThan(ids.length);
    expect(q.size).toBeGreaterThan(0);
    vi.restoreAllMocks();
    q.flush(100); // a later "tick" drains the remainder
    expect(forceAdds.length).toBe(ids.length);
    expect(q.size).toBe(0);
  });
});

describe('RemoteStrokeQueue snapshot resync (regression)', () => {
  // Reproduces the v4.0.1 bug: PixiApp.loadSnapshot calls state.loadSnapshot(strokes) — a
  // synchronous bulk replace — BEFORE enqueueing the incoming strokes. By the time the queue
  // drains (later, possibly next frame), hasStroke() already returns true for every snapshot
  // stroke. An isEcho-style sink (mirroring PixiApp.applyRemoteAdd) treats that as "this is my
  // own commit echoed back, geometry already exists" and skips rendering — for every stroke in
  // the snapshot. This is the exact bug: a joining/reconnecting client's canvas renders blank.
  function isEchoSink(committed: readonly string[]): {
    sink: RemoteOpSink; rendered: string[];
  } {
    const rendered: string[] = [];
    const sink: RemoteOpSink = {
      hasStroke: (id) => committed.includes(id),
      applyAdd: (s) => {
        if (sink.hasStroke(s.id)) return; // isEcho: "already rendered" — skips building Graphics
        rendered.push(s.id);
      },
      applyForceAdd: (s) => { rendered.push(s.id); },
      applyDelete: () => {},
    };
    return { sink, rendered };
  }

  it('BUG (ordinary enqueueAdd): renders nothing once state already holds every snapshot id', () => {
    const ids = ['s1', 's2', 's3'];
    const { sink, rendered } = isEchoSink(ids); // state already bulk-replaced, as loadSnapshot does
    const q = new RemoteStrokeQueue(sink);
    for (const id of ids) q.enqueueAdd(fakeStroke(id));
    q.flush(100);
    expect(rendered).toEqual([]); // the bug: not one snapshot stroke got rendered
  });

  it('FIX (enqueueForceAdd): renders every snapshot stroke despite state already holding it', () => {
    const ids = ['s1', 's2', 's3'];
    const { sink, rendered } = isEchoSink(ids); // same precondition as the bug case above
    const q = new RemoteStrokeQueue(sink);
    for (const id of ids) q.enqueueForceAdd(fakeStroke(id));
    q.flush(100);
    expect(rendered).toEqual(ids); // every snapshot stroke is rendered, none silently skipped
  });

  it('a real delete racing a queued force-add still removes the stroke, not just skips it', () => {
    // A snapshot stroke that gets deleted by another peer before this client's queue has drained
    // it: state already has the id (from loadSnapshot), so this is a genuine delete, not the
    // add/delete-in-one-batch cancellation used for eraser remnants.
    const { sink, adds, forceAdds, deletes } = makeSink(['s1']);
    const q = new RemoteStrokeQueue(sink);
    q.enqueueForceAdd(fakeStroke('s1'));
    q.enqueueDelete('s1');
    q.flush(100);
    expect(forceAdds).toEqual([]); // superseded by the delete, never rendered
    expect(adds).toEqual([]);
    expect(deletes).toEqual(['s1']);
  });
});
