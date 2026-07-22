import { it, expect } from 'vitest';
import { workingSet } from '../workingSet';

it('sorts ids by zIndex ascending, independent of input order', () => {
  const hits = [
    { id: 'c', zIndex: 30 },
    { id: 'a', zIndex: 10 },
    { id: 'b', zIndex: 20 },
  ];
  expect(workingSet(hits)).toEqual(['a', 'b', 'c']);
});
