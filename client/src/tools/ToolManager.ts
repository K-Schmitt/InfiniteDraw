import { Container } from 'pixi.js';
import type { HierCamera } from '../app/HierCamera';
import type { Color } from '@shared/stroke';
import type { Tool, ToolSettings, CanvasApi } from './Tool';
import { BrushTool } from './BrushTool';
import { LineTool } from './LineTool';
import { ShapeTool } from './ShapeTool';
import { EraserTool } from './EraserTool';
import { FillTool } from './FillTool';
import { EyedropperTool } from './EyedropperTool';

export type ToolId = 'brush' | 'line' | 'shape' | 'eraser' | 'fill' | 'eyedropper';

/** Owns every tool, tracks the active one, and aggregates their preview overlays. */
export class ToolManager {
  readonly previewLayer = new Container();
  private readonly tools: Record<ToolId, Tool>;
  private current: ToolId = 'brush';

  constructor(settings: ToolSettings, api: CanvasApi, onPick: (color: Color) => void) {
    this.tools = {
      brush: new BrushTool(settings, api),
      line: new LineTool(settings, api),
      shape: new ShapeTool(settings, api),
      eraser: new EraserTool(settings, api),
      fill: new FillTool(settings, api),
      eyedropper: new EyedropperTool(settings, api, onPick),
    };
    for (const tool of Object.values(this.tools)) this.previewLayer.addChild(tool.preview);
  }

  get active(): Tool {
    return this.tools[this.current];
  }

  get activeId(): ToolId {
    return this.current;
  }

  setActive(id: ToolId): void {
    if (id === this.current) return;
    this.active.cancel();
    this.current = id;
  }

  refreshPreview(camera: HierCamera): void {
    this.active.refreshPreview(camera);
  }
}
