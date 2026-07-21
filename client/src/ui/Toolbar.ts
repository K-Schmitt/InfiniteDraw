import type { Color } from '@shared/stroke';
import type { ToolSettings } from '../tools/Tool';
import type { ToolId, ToolManager } from '../tools/ToolManager';
import type { ShapeKind } from '../tools/shapeGeometry';
import { PALETTE, colorToHex, hexToColor, cssColor } from './colors';

interface ToolButton {
  id: ToolId;
  icon: string;
  title: string;
}

const TOOL_BUTTONS: readonly ToolButton[] = [
  { id: 'brush', icon: '✏️', title: 'Brush (B)' },
  { id: 'line', icon: '／', title: 'Line (L)' },
  { id: 'shape', icon: '▭', title: 'Shape (R)' },
  { id: 'eraser', icon: '🧽', title: 'Eraser (E)' },
  { id: 'fill', icon: '🪣', title: 'Fill bucket (F)' },
  { id: 'eyedropper', icon: '💧', title: 'Eyedropper (I)' },
];

const SHAPE_BUTTONS: readonly { kind: ShapeKind; icon: string }[] = [
  { kind: 'rectangle', icon: '▭' },
  { kind: 'ellipse', icon: '◯' },
  { kind: 'triangle', icon: '△' },
];

/** Floating toolbar: tool selection, shape picker, size, and the two-color palette. */
export class Toolbar {
  readonly root = document.createElement('div');
  private readonly toolButtons = new Map<ToolId, HTMLButtonElement>();
  private readonly shapeButtons = new Map<ShapeKind, HTMLButtonElement>();
  private readonly shapeRow = document.createElement('div');
  private readonly primarySwatch = document.createElement('button');
  private readonly secondarySwatch = document.createElement('button');
  private readonly primaryInput = document.createElement('input');
  private readonly secondaryInput = document.createElement('input');

  constructor(
    private readonly settings: ToolSettings,
    private readonly manager: ToolManager,
  ) {
    this.root.id = 'toolbar';
    this.root.append(
      this.buildToolGroup(),
      this.buildShapeRow(),
      this.buildSizeRow(),
      this.buildColorGroup(),
      this.buildPalette(),
    );
    this.selectShape(this.settings.shape);
    this.selectTool('brush');
    this.syncColors();
  }

  selectTool(id: ToolId): void {
    this.manager.setActive(id);
    for (const [tid, btn] of this.toolButtons) btn.classList.toggle('active', tid === id);
    this.shapeRow.style.display = id === 'shape' ? 'flex' : 'none';
  }

  swap(): void {
    const previousPrimary = this.settings.primary;
    this.settings.primary = this.settings.secondary;
    this.settings.secondary = previousPrimary;
    this.syncColors();
  }

  syncColors(): void {
    this.primarySwatch.style.background = cssColor(this.settings.primary);
    this.secondarySwatch.style.background = cssColor(this.settings.secondary);
    this.primaryInput.value = colorToHex(this.settings.primary);
    this.secondaryInput.value = colorToHex(this.settings.secondary);
  }

  private buildToolGroup(): HTMLElement {
    const group = makeGroup();
    for (const tool of TOOL_BUTTONS) {
      const btn = makeIconButton(tool.icon, tool.title);
      btn.addEventListener('click', () => this.selectTool(tool.id));
      this.toolButtons.set(tool.id, btn);
      group.appendChild(btn);
    }
    return group;
  }

  private buildShapeRow(): HTMLElement {
    this.shapeRow.className = 'group shape-row';
    for (const shape of SHAPE_BUTTONS) {
      const btn = makeIconButton(shape.icon, shape.kind);
      btn.addEventListener('click', () => this.selectShape(shape.kind));
      this.shapeButtons.set(shape.kind, btn);
      this.shapeRow.appendChild(btn);
    }
    return this.shapeRow;
  }

  private selectShape(kind: ShapeKind): void {
    this.settings.shape = kind;
    for (const [k, btn] of this.shapeButtons) btn.classList.toggle('active', k === kind);
  }

  private buildSizeRow(): HTMLElement {
    const group = makeGroup();
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '1';
    slider.max = '64';
    slider.value = String(this.settings.size);
    slider.className = 'size-slider';
    const label = document.createElement('span');
    label.className = 'size-label';
    label.textContent = slider.value;
    slider.addEventListener('input', () => {
      this.settings.size = Number(slider.value);
      label.textContent = slider.value;
    });
    group.append(slider, label);
    return group;
  }

  private buildColorGroup(): HTMLElement {
    const group = makeGroup();
    this.primarySwatch.className = 'swatch primary';
    this.secondarySwatch.className = 'swatch secondary';
    this.primarySwatch.title = 'Primary color — click to customize';
    this.secondarySwatch.title = 'Secondary color — click to customize';
    configureColorInput(this.primaryInput);
    configureColorInput(this.secondaryInput);
    this.primarySwatch.addEventListener('click', () => this.primaryInput.click());
    this.secondarySwatch.addEventListener('click', () => this.secondaryInput.click());
    this.primaryInput.addEventListener('input', () => this.applyCustom('primary', this.primaryInput));
    this.secondaryInput.addEventListener('input', () => this.applyCustom('secondary', this.secondaryInput));

    const swap = makeIconButton('⇄', 'Swap colors (X)');
    swap.addEventListener('click', () => this.swap());
    const pair = document.createElement('div');
    pair.className = 'swatch-pair';
    pair.append(this.secondarySwatch, this.primarySwatch);
    group.append(pair, swap, this.primaryInput, this.secondaryInput);
    return group;
  }

  private applyCustom(slot: 'primary' | 'secondary', input: HTMLInputElement): void {
    this.settings[slot] = hexToColor(input.value);
    this.syncColors();
  }

  private buildPalette(): HTMLElement {
    const grid = document.createElement('div');
    grid.className = 'palette';
    for (const color of PALETTE) {
      const btn = document.createElement('button');
      btn.className = 'palette-swatch';
      btn.style.background = cssColor(color);
      btn.title = 'Left click → color 1 · Right click → color 2';
      btn.addEventListener('click', () => this.pick('primary', color));
      btn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.pick('secondary', color);
      });
      grid.appendChild(btn);
    }
    return grid;
  }

  private pick(slot: 'primary' | 'secondary', color: Color): void {
    this.settings[slot] = { ...color };
    this.syncColors();
  }
}

function makeGroup(): HTMLDivElement {
  const div = document.createElement('div');
  div.className = 'group';
  return div;
}

function makeIconButton(icon: string, title: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'icon-btn';
  btn.textContent = icon;
  btn.title = title;
  return btn;
}

function configureColorInput(input: HTMLInputElement): void {
  input.type = 'color';
  input.className = 'hidden-input';
}
