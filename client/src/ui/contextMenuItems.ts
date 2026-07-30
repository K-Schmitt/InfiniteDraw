import type { ToolId } from '../tools/ToolManager';
import type { Toolbar } from './Toolbar';
import type { ZenMode } from './ZenMode';
import type { ContextMenuItem } from './ContextMenu';

/** The quick-menu rows. Goes through `Toolbar.selectTool` so the button highlight stays in sync. */
export function buildContextMenuItems(toolbar: Toolbar, zen: ZenMode): ContextMenuItem[] {
  const tool = (id: ToolId, label: string, hint: string): ContextMenuItem => ({
    label, hint, run: () => toolbar.selectTool(id),
  });
  return [
    tool('brush', 'Brush', 'B'),
    tool('line', 'Line', 'L'),
    tool('shape', 'Shape', 'R'),
    tool('eraser', 'Eraser', 'E'),
    tool('fill', 'Fill bucket', 'F'),
    tool('eyedropper', 'Eyedropper', 'I'),
    { label: 'Zen mode', hint: 'Z', run: () => void zen.toggle() },
  ];
}
