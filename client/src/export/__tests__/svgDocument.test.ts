import { describe, it, expect } from 'vitest';
import { buildSvgDocument } from '../svgDocument';
import { svgFilename } from '../downloadBlob';
import type { ExportScope } from '../exportScope';

const scope = (over: Partial<ExportScope> = {}): ExportScope => ({
  reference: { level: 0, cell: { x: 0n, y: 0n } },
  items: [{
    id: 'a',
    rings: [[0, 0, 10, 0, 10, 10, 0, 10]],
    color: { r: 255, g: 0, b: 0, a: 255 },
    zIndex: 0,
    isBackground: false,
  }],
  bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
  skipped: 0,
  ...over,
});

describe('buildSvgDocument', () => {
  it('emits a viewBox padded around the content bounds', () => {
    expect(buildSvgDocument(scope(), '#f5f0e8')).toContain('viewBox="-1 -1 12 12"');
  });

  it('emits one path per item with an even-odd fill rule', () => {
    const svg = buildSvgDocument(scope(), '#f5f0e8');
    expect(svg).toContain('fill-rule="evenodd"');
    expect(svg.match(/<path /g)).toHaveLength(1);
    expect(svg).toContain('fill="#ff0000"');
  });

  it('records the reference anchor and any skipped strokes as metadata', () => {
    const svg = buildSvgDocument(scope({ skipped: 3 }), '#f5f0e8');
    expect(svg).toContain('data-anchor-level="0"');
    expect(svg).toContain('data-skipped="3"');
  });

  it('emits a valid empty document when nothing is in range', () => {
    const empty = scope({ items: [], bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 } });
    const svg = buildSvgDocument(empty, '#f5f0e8');
    expect(svg).toContain('viewBox="-1 -1 2 2"');
    expect(svg).not.toContain('<path ');
  });

  it('applies per-stroke alpha as fill-opacity', () => {
    const half = scope();
    half.items[0]!.color.a = 128;
    expect(buildSvgDocument(half, '#f5f0e8')).toContain('fill-opacity="0.502"');
  });

  // Every fixture above uses minX/minY = 0, which makes `-PAD` and `bounds.minX - PAD`
  // indistinguishable. Real content never starts at exactly (0,0), so assert off-origin.
  it('aligns the background rect with the viewBox for off-origin content', () => {
    const shifted = scope({ bounds: { minX: 500, minY: -200, maxX: 600, maxY: -100 } });
    const svg = buildSvgDocument(shifted, '#f5f0e8');
    expect(svg).toContain('viewBox="499 -201 102 102"');
    expect(svg).toContain('<rect x="499" y="-201" width="102" height="102"');
  });
});

describe('svgFilename', () => {
  it('names the file with the given timestamp and an .svg extension', () => {
    expect(svgFilename(1)).toBe('infinityboard-1.svg');
  });
});
