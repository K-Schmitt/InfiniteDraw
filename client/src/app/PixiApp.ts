import { Application } from 'pixi.js';
import type { BrushStroke, Color } from '@shared/stroke';
import { HierCamera } from './HierCamera';
import { GridBackground } from './GridBackground';
import { StrokeRenderer } from '../drawing/StrokeRenderer';
import { CanvasState, type RendererInstruction } from '../state/CanvasState';
import { ToolManager, type ToolId } from '../tools/ToolManager';
import type { ToolSettings, ToolContext, CanvasApi } from '../tools/Tool';
import { Toolbar } from '../ui/Toolbar';

const ZOOM_FACTOR = 1.12;

const SHORTCUTS: Record<string, ToolId> = {
  b: 'brush',
  l: 'line',
  r: 'shape',
  e: 'eraser',
  f: 'fill',
  i: 'eyedropper',
};

function defaultSettings(): ToolSettings {
  return {
    primary: { r: 20, g: 20, b: 20, a: 255 },
    secondary: { r: 255, g: 255, b: 255, a: 255 },
    size: 8,
    shape: 'rectangle',
    layerId: 'default',
  };
}

export class PixiApp {
  private app!: Application;
  private camera!: HierCamera;
  private grid!: GridBackground;
  private state!: CanvasState;
  private renderer!: StrokeRenderer;
  private tools!: ToolManager;
  private toolbar!: Toolbar;
  private zoomHud!: HTMLElement;
  private readonly settings = defaultSettings();

  private isPanning = false;
  private lastPanX = 0;
  private lastPanY = 0;

  async init(container: HTMLElement): Promise<void> {
    this.app = new Application();
    // ≥2× device pixels: fixes blur on Linux where the browser under-reports devicePixelRatio
    const renderResolution = Math.max(window.devicePixelRatio || 1, 2);
    await this.app.init({
      resizeTo: window,
      backgroundColor: 0xf5f0e8,
      antialias: true,
      preference: 'webgl',
      resolution: renderResolution,
      autoDensity: true,
    });
    container.appendChild(this.app.canvas as HTMLCanvasElement);

    this.camera = new HierCamera();
    this.state = new CanvasState();
    this.zoomHud = document.getElementById('hud')!;

    this.grid = new GridBackground();
    this.app.stage.addChild(this.grid.graphics);
    this.renderer = new StrokeRenderer();
    this.app.stage.addChild(this.renderer.container);

    this.tools = new ToolManager(this.settings, this.createCanvasApi(), (c) => this.applyPick(c));
    this.app.stage.addChild(this.tools.previewLayer);
    this.toolbar = new Toolbar(this.settings, this.tools);
    document.body.appendChild(this.toolbar.root);

    this.setupInput(this.app.canvas as HTMLCanvasElement);
    this.app.ticker.add(() => this.tick());
  }

  private createCanvasApi(): CanvasApi {
    return {
      add: (stroke) => this.commit(stroke),
      eraseLive: (removeIds, additions) => this.eraseLive(removeIds, additions),
      eraseEnd: () => this.state.commitErase(),
      strokesInFrame: (box, camera) => this.renderer.strokesInFrame(box, camera),
      pickColorAt: (frame, camera) => this.renderer.pickColorAt(frame, camera),
      fillTarget: (frame, camera, color) => this.renderer.fillTarget(frame, camera, color),
      recolorMany: (ids, color) => this.recolorMany(ids, color),
    };
  }

  private recolorMany(ids: readonly string[], color: Color): void {
    this.state.recolorMany(ids, color);
    for (const id of ids) this.renderer.recolorStroke(id, color);
  }

  private commit(stroke: BrushStroke): void {
    if (!isDrawable(stroke)) return; // reject degenerate strokes made past float64-safe zoom
    this.state.addStroke(stroke);
    this.renderer.addStroke(stroke);
  }

  private eraseLive(removeIds: readonly string[], additions: readonly BrushStroke[]): void {
    this.state.liveErase(removeIds, additions);
    for (const id of removeIds) this.renderer.removeStroke(id);
    for (const stroke of additions) this.renderer.addStroke(stroke);
  }

  private applyPick(color: Color): void {
    this.settings.primary = color;
    this.toolbar.syncColors();
  }

  private tick(): void {
    const { width, height } = this.app.screen;
    this.grid.draw(this.camera.toLegacyCamera(), width, height);
    this.renderer.redraw(this.camera.projCamera, this.camera.frameScale, width, height);
    this.tools.refreshPreview(this.camera);
    this.zoomHud.textContent = formatZoom(this.camera.logZoom);
  }

  private setupInput(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('pointerdown', (e) => this.handlePointerDown(e, canvas));
    canvas.addEventListener('pointermove', (e) => this.handlePointerMove(e, canvas));
    canvas.addEventListener('pointerup', (e) => this.handlePointerUp(e, canvas));
    canvas.addEventListener('pointercancel', () => this.handleCancel());
    canvas.addEventListener('wheel', (e) => this.handleWheel(e, canvas), { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => this.handleKeyDown(e));
  }

  // right button pans; any other button drives the active tool
  private handlePointerDown(e: PointerEvent, canvas: HTMLCanvasElement): void {
    if (e.button === 2) {
      this.isPanning = true;
      this.lastPanX = e.clientX;
      this.lastPanY = e.clientY;
      canvas.style.cursor = 'grabbing';
      return;
    }
    canvas.setPointerCapture(e.pointerId);
    this.tools.active.onDown(this.context(e, canvas.getBoundingClientRect()));
  }

  private handlePointerMove(e: PointerEvent, canvas: HTMLCanvasElement): void {
    if (this.isPanning) {
      this.camera.panPixels(e.clientX - this.lastPanX, e.clientY - this.lastPanY);
      this.lastPanX = e.clientX;
      this.lastPanY = e.clientY;
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const events = e.getCoalescedEvents?.() ?? [e];
    for (const ev of events) this.tools.active.onMove(this.context(ev, rect));
  }

  private handlePointerUp(e: PointerEvent, canvas: HTMLCanvasElement): void {
    if (e.button === 2) {
      this.isPanning = false;
      canvas.style.cursor = '';
      return;
    }
    this.tools.active.onUp(this.context(e, canvas.getBoundingClientRect()));
  }

  private handleCancel(): void {
    this.isPanning = false;
    this.tools.active.cancel();
  }

  private handleWheel(e: WheelEvent, canvas: HTMLCanvasElement): void {
    e.preventDefault();
    const factor = e.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
    const rect = canvas.getBoundingClientRect();
    const pivot = this.camera.screenToFrame(e.clientX - rect.left, e.clientY - rect.top);
    this.camera.zoomBy(Math.log2(factor), pivot.x, pivot.y);
  }

  private handleKeyDown(e: KeyboardEvent): void {
    const key = e.key.toLowerCase();
    const mod = e.ctrlKey || e.metaKey;
    if (mod && key === 'z' && !e.shiftKey) return this.run(this.state.undo());
    if (mod && (key === 'y' || (key === 'z' && e.shiftKey))) return this.run(this.state.redo());
    if (isTypingTarget(e.target)) return;
    if (key === 'x') return this.toolbar.swap();
    const tool = SHORTCUTS[key];
    if (tool) this.toolbar.selectTool(tool);
  }

  private run(instructions: RendererInstruction[]): void {
    for (const instruction of instructions) {
      if (instruction.action === 'add') this.renderer.addStroke(instruction.stroke);
      else if (instruction.action === 'remove') this.renderer.removeStroke(instruction.strokeId);
      else this.renderer.recolorStroke(instruction.strokeId, instruction.color);
    }
  }

  private context(e: PointerEvent, rect: DOMRect): ToolContext {
    const frame = this.camera.screenToFrame(e.clientX - rect.left, e.clientY - rect.top);
    return {
      frame,
      projCamera: this.camera.projCamera,
      cameraScale: this.camera.scale,
      pressure: e.pressure,
    };
  }
}

function formatZoom(logZoom: number): string {
  const log10 = logZoom / Math.LN10;
  if (Math.abs(log10) < 3) {
    const zoom = Math.exp(logZoom);
    if (zoom >= 100) return `${Math.round(zoom)}×`;
    if (zoom >= 1) return `${zoom.toFixed(1)}×`;
    return `${zoom.toFixed(3)}×`;
  }
  return `10^${Math.round(log10)}`;
}

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

// past ~×8e9 the world size underflows and points collapse below float64 resolution
const MIN_WORLD_SIZE = 1e-9;

function isDrawable(stroke: BrushStroke): boolean {
  if (!(stroke.size >= MIN_WORLD_SIZE) || stroke.points.length < 2) return false;
  for (const p of stroke.points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;
  }
  return true;
}
