import { Container } from 'pixi.js';
import type { Color } from '@shared/stroke';
import type { Tool, ToolContext, ToolSettings, CanvasApi } from './Tool';

export type ColorSink = (color: Color) => void;

/** Eyedropper: picks the color of the topmost stroke under the cursor into the primary slot. */
export class EyedropperTool implements Tool {
  readonly preview = new Container(); // instant action — nothing to preview

  constructor(
    _settings: ToolSettings,
    private readonly api: CanvasApi,
    private readonly onPick: ColorSink,
  ) {}

  onDown(ctx: ToolContext): void {
    const color = this.api.pickColorAt(ctx.frame, ctx.projCamera);
    if (color) this.onPick({ ...color });
  }

  onMove(): void {}
  onUp(): void {}
  cancel(): void {}
  refreshPreview(): void {}
}
