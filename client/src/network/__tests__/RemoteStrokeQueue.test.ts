import { describe, it, expect, vi } from 'vitest';
import { RemoteStrokeQueue, type RemoteOpSink } from '../RemoteStrokeQueue';
import type { BrushStroke } from '@shared/stroke';

function fakeStroke(id: string): BrushStroke {
  return { id } as unknown as BrushStroke;
}

/** A sink recording calls; `hasStroke` returns true only for ids listed as already committed. */
function makeSink(committed: readonly string[] = []): {
  sink: RemoteOpSink; adds: string[]; deletes: string[];
} {
  const adds: string[] = [];
  const deletes: string[] = [];
  const sink: RemoteOpSink = {
    hasStroke: (id) => committed.includes(id),
    applyAdd: (s) => { adds.push(s.id); },
    applyDelete: (id) => { deletes.push(id); },
  };
  return { sink, adds, deletes };
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
    const { sink, adds, deletes } = makeSink(['a']); // 'a' already in state (own echo / prior batch)
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
});
