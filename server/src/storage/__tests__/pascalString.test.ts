import { describe, it, expect } from 'vitest';
import { writePascalString, readPascalString } from '../pascalString.js';

describe('pascalString', () => {
  it('round-trips a string', () => {
    const buf = writePascalString('hello');
    const { value, next } = readPascalString(buf, 0);
    expect(value).toBe('hello');
    expect(next).toBe(buf.length);
  });

  it('round-trips unicode and empty', () => {
    for (const text of ['', 'héllo ✏️']) {
      const { value } = readPascalString(writePascalString(text), 0);
      expect(value).toBe(text);
    }
  });
});
