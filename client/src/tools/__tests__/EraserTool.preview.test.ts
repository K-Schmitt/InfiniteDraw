import { describe, it, expect } from 'vitest';
import type { Graphics } from 'pixi.js';
import { StrokeType, type BrushStroke } from '@shared/stroke';
import { originAnchor, originBbox } from '@shared/anchor';
import { HierCamera } from '../../app/HierCamera';
import type { FrameCandidate } from '../../drawing/StrokeRenderer';
import { EraserTool } from '../EraserTool';
import type { CanvasApi, ToolContext, ToolSettings } from '../Tool';

const CAMERA = { level: 0, cell: { x: 0n, y: 0n }, sub: { x: 0, y: 0 } };

/** A 200×200 filled square — erasing its middle leaves an outer ring plus a carved hole. */
function square(): FrameCandidate {
  const stroke: BrushStroke = {
    id: 'sq',
    type: StrokeType.BRUSH,
    color: { r: 10, g: 20, b: 30, a: 255 },
    size: 1,
    points: [],
    pressures: [],
    layerId: 'default',
    createdAt: 0,
    anchor: originAnchor(),
    zIndex: 0,
    cellBbox: originBbox(),
    filled: true,
  };
  return { stroke, frameRings: [[0, 0, 200, 0, 200, 200, 0, 200]] };
}

function settings(): ToolSettings {
  return {
    primary: { r: 0, g: 0, b: 0, a: 255 },
    secondary: { r: 255, g: 255, b: 255, a: 255 },
    size: 20,
    shape: 'rectangle',
    layerId: 'default',
  };
}

function api(): CanvasApi {
  return {
    add: () => {},
    eraseTake: () => {},
    eraseCommit: () => {},
    strokesInFrame: () => [square()],
    pickColorAt: () => undefined,
    fillTarget: () => null,
    recolorMany: () => {},
  };
}

function contextAt(x: number, y: number): ToolContext {
  return { frame: { x, y }, projCamera: CAMERA, cameraScale: 1, pressure: 0.5 };
}

interface ShapePrimitive {
  shape: { type: string };
  holes?: readonly unknown[];
}

/** The fill primitives pixi will rasterize, with the holes it detected. */
function fillPrimitives(preview: Graphics): ShapePrimitive[] {
  const instructions = (preview.context as unknown as {
    instructions: { action: string; data: { path?: { shapePath: { shapePrimitives: ShapePrimitive[] } } } }[];
  }).instructions;
  const fill = instructions.find((i) => i.action === 'fill');
  return fill?.data.path?.shapePath.shapePrimitives ?? [];
}

describe('EraserTool preview', () => {
  it('renders the carved hole as a hole, not solid fill', () => {
    const tool = new EraserTool(settings(), api());
    tool.onDown(contextAt(100, 100)); // stamp lands in the middle of the square

    tool.refreshPreview(new HierCamera());

    const primitives = fillPrimitives(tool.preview);
    expect(primitives).toHaveLength(1); // one outer polygon…
    expect(primitives[0]!.holes).toHaveLength(1); // …with the erased middle punched out
  });
});
