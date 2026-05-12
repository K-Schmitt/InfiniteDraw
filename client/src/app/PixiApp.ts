import { Application, Container } from 'pixi.js';
import { CameraController } from './Camera';
import { GridBackground } from './GridBackground';
import { StrokeRenderer } from '../drawing/StrokeRenderer';
import { BrushTool } from '../tools/BrushTool';
import { CanvasState } from '../state/CanvasState';

const ZOOM_FACTOR = 1.12;

/**
 * Root application class. Wires together:
 *   PixiJS (rendering) ← CameraController (transform) ← pointer/wheel events
 *   BrushTool (input) → CanvasState (data) → StrokeRenderer (display)
 *
 * Stage hierarchy:
 *   app.stage
 *     ├── grid.graphics          (screen-space dot grid, redrawn each frame)
 *     └── worldContainer         (camera transform applied every tick)
 *           ├── renderer.container   (committed strokes)
 *           └── brushTool.previewGraphics  (live preview)
 */
export class PixiApp {
  private app!: Application;
  private worldContainer!: Container;
  private camera!: CameraController;
  private grid!: GridBackground;
  private state!: CanvasState;
  private renderer!: StrokeRenderer;
  private brushTool!: BrushTool;
  private zoomHud!: HTMLElement;

  private isPanning = false;
  private lastPanX = 0;
  private lastPanY = 0;

  async init(container: HTMLElement): Promise<void> {
    this.app = new Application();
    await this.app.init({
      resizeTo: container,
      backgroundColor: 0xf5f0e8,
      antialias: true,
      preference: 'webgl',
      resolution: window.devicePixelRatio,
      autoDensity: true,
    });

    container.appendChild(this.app.canvas as HTMLCanvasElement);

    this.camera = new CameraController();
    this.state = new CanvasState();
    this.zoomHud = document.getElementById('hud')!;

    this.grid = new GridBackground();
    this.app.stage.addChild(this.grid.graphics);

    this.worldContainer = new Container();
    this.app.stage.addChild(this.worldContainer);

    this.renderer = new StrokeRenderer();
    this.worldContainer.addChild(this.renderer.container);

    this.brushTool = new BrushTool((stroke) => {
      this.state.addStroke(stroke);
      this.renderer.addStroke(stroke);
    });
    this.worldContainer.addChild(this.brushTool.previewGraphics);

    this.setupInput(this.app.canvas as HTMLCanvasElement);
    this.app.ticker.add(() => this.tick());
  }

  private tick(): void {
    const { width, height } = this.app.screen;

    this.grid.draw(this.camera.getSnapshot(), width, height);

    this.worldContainer.scale.set(this.camera.zoom);
    this.worldContainer.x = -this.camera.x * this.camera.zoom;
    this.worldContainer.y = -this.camera.y * this.camera.zoom;

    const viewport = this.camera.getViewport(width, height);
    this.renderer.updateCulling(viewport, this.state.strokes);

    this.zoomHud.textContent = `${Math.round(this.camera.zoom * 100)}%`;
  }

  private setupInput(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('pointerdown', (e) => this.handlePointerDown(e, canvas));
    canvas.addEventListener('pointermove', (e) => this.handlePointerMove(e, canvas));
    canvas.addEventListener('pointerup', (e) => this.handlePointerUp(e));
    canvas.addEventListener('pointercancel', () => {
      this.isPanning = false;
      this.brushTool.cancel();
    });
    canvas.addEventListener('wheel', (e) => this.handleWheel(e, canvas), { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => this.handleKeyDown(e));
  }

  private handlePointerDown(e: PointerEvent, canvas: HTMLCanvasElement): void {
    if (e.button === 2) {
      this.isPanning = true;
      this.lastPanX = e.clientX;
      this.lastPanY = e.clientY;
      canvas.style.cursor = 'grabbing';
      return;
    }

    canvas.setPointerCapture(e.pointerId);
    const world = this.toWorld(e, canvas);
    this.brushTool.onPointerDown(world.x, world.y, e.pressure);
  }

  private handlePointerMove(e: PointerEvent, canvas: HTMLCanvasElement): void {
    if (this.isPanning) {
      this.camera.pan(e.clientX - this.lastPanX, e.clientY - this.lastPanY);
      this.lastPanX = e.clientX;
      this.lastPanY = e.clientY;
      return;
    }

    const events = e.getCoalescedEvents?.() ?? [e];
    for (const ev of events) {
      const world = this.toWorld(ev, canvas);
      this.brushTool.onPointerMove(world.x, world.y, ev.pressure);
    }
  }

  private handlePointerUp(e: PointerEvent): void {
    if (e.button === 2) {
      this.isPanning = false;
      (e.target as HTMLCanvasElement).style.cursor = '';
      return;
    }
    this.brushTool.onPointerUp();
  }

  private handleWheel(e: WheelEvent, canvas: HTMLCanvasElement): void {
    e.preventDefault();
    const factor = e.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
    const rect = canvas.getBoundingClientRect();
    this.camera.zoomAt(factor, e.clientX - rect.left, e.clientY - rect.top);
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
      applyRendererInstruction(this.state.undo(), this.renderer);
    }
    if (e.ctrlKey && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
      applyRendererInstruction(this.state.redo(), this.renderer);
    }
  }

  private toWorld(e: PointerEvent, canvas: HTMLCanvasElement): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    return this.camera.toWorld(e.clientX - rect.left, e.clientY - rect.top);
  }
}

function applyRendererInstruction(
  instruction: ReturnType<CanvasState['undo']>,
  renderer: StrokeRenderer,
): void {
  if (!instruction) return;
  if (instruction.action === 'add') {
    renderer.addStroke(instruction.stroke);
  } else {
    renderer.removeStroke(instruction.strokeId);
  }
}
