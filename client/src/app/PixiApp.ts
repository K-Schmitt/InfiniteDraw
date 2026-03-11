import { Application, Container } from 'pixi.js';
import { CameraController } from './Camera';
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
 *     └── worldContainer  (camera transform applied every tick)
 *           ├── renderer.container  (committed strokes)
 *           └── brushTool.previewGraphics  (live preview)
 */
export class PixiApp {
  private app!: Application;
  private worldContainer!: Container;
  private camera!: CameraController;
  private state!: CanvasState;
  private renderer!: StrokeRenderer;
  private brushTool!: BrushTool;

  private isPanning = false;
  private lastPanX = 0;
  private lastPanY = 0;

  async init(container: HTMLElement): Promise<void> {
    this.app = new Application();
    await this.app.init({
      resizeTo: container,
      backgroundColor: 0xf5f5f0,
      antialias: true,
      preference: 'webgl',
      resolution: window.devicePixelRatio,
      autoDensity: true,
    });

    container.appendChild(this.app.canvas as HTMLCanvasElement);

    this.camera = new CameraController();
    this.state = new CanvasState();

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
    applyCameraToContainer(this.worldContainer, this.camera);

    const viewport = this.camera.getViewport(
      this.app.screen.width,
      this.app.screen.height,
    );
    this.renderer.updateCulling(viewport, this.state.strokes);
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

    // Use coalesced events for smoother strokes at high pointer speed.
    const events = e.getCoalescedEvents?.() ?? [e];
    for (const ev of events) {
      const world = this.toWorld(ev, canvas);
      this.brushTool.onPointerMove(world.x, world.y, ev.pressure);
    }
  }

  private handlePointerUp(e: PointerEvent): void {
    if (e.button === 2) {
      this.isPanning = false;
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

  /** Converts a pointer event's client position to world-space coordinates. */
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

function applyCameraToContainer(container: Container, camera: CameraController): void {
  container.scale.set(camera.zoom);
  container.x = -camera.x * camera.zoom;
  container.y = -camera.y * camera.zoom;
}
