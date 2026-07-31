import type { BrushStroke, Color } from '@shared/stroke';
import type { RendererInstruction } from '../state/CanvasState';

/** One recolor message: `stroke:recolor` carries a single colour for the whole id set. */
export interface RecolorGroup {
  color: Color;
  ids: string[];
}

export interface HistoryBroadcast {
  deletes: string[];
  adds: BrushStroke[];
  recolors: RecolorGroup[];
}

/**
 * Network ops that reproduce one undo/redo step on peers and in the server journal.
 *
 * Undo/redo used to stop at the tab that pressed the keys: the step was applied to local state and
 * to the renderer and never left the client, so peers kept showing the undone stroke and a reload
 * replayed it straight back out of the journal. Every step is expressible with events the server
 * already has — the removes and adds as one atomic `stroke:batch`, colour changes as one
 * `stroke:recolor` per distinct colour.
 */
export function historyBroadcast(instructions: readonly RendererInstruction[]): HistoryBroadcast {
  const deletes: string[] = [];
  const adds: BrushStroke[] = [];
  const byColor = new Map<string, RecolorGroup>();
  for (const instruction of instructions) {
    if (instruction.action === 'add') adds.push(instruction.stroke);
    else if (instruction.action === 'remove') deletes.push(instruction.strokeId);
    else addToColorGroup(byColor, instruction.strokeId, instruction.color);
  }
  return { deletes, adds, recolors: [...byColor.values()] };
}

function addToColorGroup(groups: Map<string, RecolorGroup>, id: string, color: Color): void {
  const key = `${color.r},${color.g},${color.b},${color.a}`;
  const group = groups.get(key) ?? { color, ids: [] };
  group.ids.push(id);
  groups.set(key, group);
}
