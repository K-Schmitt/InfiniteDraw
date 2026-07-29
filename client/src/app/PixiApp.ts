import { Application } from 'pixi.js';
import type { BrushStroke, Color } from '@shared/stroke';
import { HierCamera } from './HierCamera';
import { GridBackground } from './GridBackground';
import { StrokeRenderer } from '../drawing/StrokeRenderer';
import { CanvasState, type RendererInstruction } from '../state/CanvasState';
import { ToolManager, type ToolId } from '../tools/ToolManager';
import type { ToolSettings, ToolContext, CanvasApi } from '../tools/Tool';
import { Toolbar } from '../ui/Toolbar';
import { ZenMode } from '../ui/ZenMode';
import type { StrokeBeginPayload } from '@shared/socket-events';
import { CollabClient, type CollabDelegate } from '../network/CollabClient';
import { RemoteStrokeQueue, type RemoteOpSink } from '../network/RemoteStrokeQueue';
import type { ProjCamera } from '../coords/viewProject';
import { log, logThrottled, installDebugApi, SESSION_ID } from '../debug/logger';
import { installErrorHooks, guarded } from '../debug/installErrorHooks';

const ZOOM_FACTOR = 1.12;

// Per-frame wall-clock budget for draining remote stroke ops. Kept small so a peer's flood yields
// the main thread back to the local user's own drawing well within a 60fps frame (~16ms).
const REMOTE_DRAIN_BUDGET_MS = 3;

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
  private zen!: ZenMode;
  private collabClient!: CollabClient;
  private remoteQueue!: RemoteStrokeQueue;
  private zoomHud!: HTMLElement;
  private readonly settings = defaultSettings();

  private isPanning = false;
  private lastPanX = 0;
  private lastPanY = 0;

  async init(container: HTMLElement): Promise<void> {
    installDebugApi();
    log('life', 'PixiApp.init start', {
      session: SESSION_ID,
      dpr: window.devicePixelRatio,
      screen: { w: window.innerWidth, h: window.innerHeight },
      ua: navigator.userAgent,
    });
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
    installErrorHooks(this.app.canvas as HTMLCanvasElement);
    log('gl', 'renderer ready', {
      type: this.app.renderer.type,
      resolution: this.app.renderer.resolution,
      size: { w: this.app.screen.width, h: this.app.screen.height },
    });

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
    this.zen = new ZenMode(document.body);

    const delegate: CollabDelegate = {
      loadSnapshot: (strokes) => {
        // Reset local state and renderer to match the room snapshot.
        // Simplest approach: remove all rendered strokes, then re-add.
        const current = [...this.state.strokes];
        log('state', 'loadSnapshot', { dropping: current.length, incoming: strokes.length });
        for (const s of current) this.renderer.removeStroke(s.id);
        this.state.loadSnapshot(strokes);
        for (const s of strokes) this.renderer.addStroke(s);
        log('state', 'loadSnapshot done', { strokes: strokes.length });
      },
      // Socket callbacks only enqueue; the actual state/renderer work is drained under a per-frame
      // time budget in tick(). A peer flooding thousands of ops can no longer block this thread.
      remoteStrokeAdded: (stroke) => this.remoteQueue.enqueueAdd(stroke),
      remoteStrokeDeleted: (id) => this.remoteQueue.enqueueDelete(id),
      remoteStrokesRecolored: (ids, color) => this.applyRemoteRecolor(ids, color),
    };
    this.remoteQueue = new RemoteStrokeQueue(this.remoteOpSink());
    this.collabClient = new CollabClient('http://localhost:3000', delegate);
    this.app.stage.addChild(this.collabClient.remoteLayer);

    this.setupInput(this.app.canvas as HTMLCanvasElement);
    this.app.ticker.add(() => this.tick());
  }

  private remoteOpSink(): RemoteOpSink {
    return {
      hasStroke: (id) => this.state.hasStroke(id),
      applyAdd: (stroke) => this.applyRemoteAdd(stroke),
      applyDelete: (id) => this.applyRemoteDelete(id),
    };
  }

  // The server echoes an author's own commit back. Adopt the authoritative paint order without
  // rebuilding geometry — a fresh Graphics here would duplicate the one already on screen.
  private applyRemoteAdd(stroke: BrushStroke): void {
    const isEcho = this.state.hasStroke(stroke.id);
    log('state', isEcho ? 'own commit echoed back' : 'remote stroke added', {
      id: stroke.id, isEcho, zIndex: stroke.zIndex, ownerId: stroke.ownerId,
      type: stroke.type, color: stroke.color, points: stroke.points.length,
      anchorLevel: stroke.anchor.level, total: this.state.strokes.length,
    });
    if (isEcho) {
      this.state.adoptServerOrder(stroke);
      this.renderer.setPaintOrder(stroke.id, stroke.zIndex);
      return;
    }
    this.state.addRemoteStroke(stroke);
    this.renderer.addStroke(stroke);
  }

  private applyRemoteDelete(id: string): void {
    log('state', 'remote stroke deleted', { id, total: this.state.strokes.length });
    this.state.removeRemoteStroke(id);
    this.renderer.removeStroke(id);
  }

  private createCanvasApi(): CanvasApi {
    return {
      add: (stroke) => this.commit(stroke),
      eraseLive: (removeIds, additions) => this.eraseLive(removeIds, additions),
      eraseEnd: () => {
        const txn = this.state.commitErase();
        if (txn) {
          for (const id of txn.removed) this.collabClient.sendStrokeDelete(id);
          for (const stroke of txn.added) this.collabClient.sendStrokeCommit(stroke);
        }
      },
      strokesInFrame: (box, camera) => this.renderer.strokesInFrame(box, camera),
      pickColorAt: (frame, camera) => this.renderer.pickColorAt(frame, camera),
      fillTarget: (frame, camera, color) => this.renderer.fillTarget(frame, camera, color),
      recolorMany: (ids, color) => this.recolorMany(ids, color),
    };
  }

  private recolorMany(ids: readonly string[], color: Color): void {
    this.state.recolorMany(ids, color);
    for (const id of ids) this.renderer.recolorStroke(id, color);
    if (ids.length > 0) this.collabClient.sendStrokeRecolor(ids, color);
  }

  // Remote paint-bucket recolor: apply to state (no local history) + renderer, no rebroadcast.
  private applyRemoteRecolor(ids: readonly string[], color: Color): void {
    log('state', 'remote strokes recolored', { ids: ids.length, color });
    this.state.recolorManyRemote(ids, color);
    for (const id of ids) this.renderer.recolorStroke(id, color);
  }

  private commit(stroke: BrushStroke): void {
    const drawable = isDrawable(stroke);
    log('state', drawable ? 'commit stroke' : 'commit REJECTED (degenerate)', {
      id: stroke.id, type: stroke.type, drawable,
      color: stroke.color, size: stroke.size,
      points: stroke.points.length, holes: stroke.holes?.length ?? 0, filled: !!stroke.filled,
      anchor: { level: stroke.anchor.level, cell: anchorCellText(stroke) },
      total: this.state.strokes.length,
    });
    if (!drawable) return; // reject degenerate strokes made past float64-safe zoom
    this.state.addStroke(stroke);
    this.renderer.addStroke(stroke);
    this.collabClient.sendStrokeCommit(stroke);
  }

  private eraseLive(removeIds: readonly string[], additions: readonly BrushStroke[]): void {
    log('state', 'eraseLive', {
      removing: removeIds.length, adding: additions.length,
      removeIds: removeIds.slice(0, 10), total: this.state.strokes.length,
    });
    this.state.liveErase(removeIds, additions);
    for (const id of removeIds) {
      this.renderer.removeStroke(id);
    }
    for (const stroke of additions) {
      this.renderer.addStroke(stroke);
    }
  }

  private applyPick(color: Color): void {
    this.settings.primary = color;
    this.toolbar.syncColors();
  }

  private tick(): void {
    const t0 = performance.now();
    const { width, height } = this.app.screen;
    // Drain buffered remote ops first, under a time budget, so they render this frame — but never
    // for longer than REMOTE_DRAIN_BUDGET_MS, leaving the rest of the frame for the local user.
    this.remoteQueue.flush(REMOTE_DRAIN_BUDGET_MS);
    // A non-empty backlog after the budget means a peer flood is being spread across frames — the
    // signal to look for in the trace when verifying local drawing stays fluid during a flood.
    const backlog = this.remoteQueue.size;
    if (backlog > 0) {
      logThrottled('remote-backlog', 500, () => ({
        cat: 'net', msg: 'remote backlog draining', data: { backlog },
      }));
    }
    this.grid.draw(this.camera.toLegacyCamera(), width, height);
    this.renderer.redraw(this.camera.projCamera, this.camera.frameScale, width, height);
    this.tools.refreshPreview(this.camera);
    this.collabClient.refresh(this.camera);
    this.zoomHud.textContent = formatZoom(this.camera.logZoom);
    const dt = performance.now() - t0;
    if (dt >= 32) log('error', `SLOW frame ${dt.toFixed(1)}ms`, { strokes: this.state.strokes.length });
    else logThrottled('tick', 1000, () => ({
      cat: 'render', msg: 'frame',
      data: { ms: +dt.toFixed(2), strokes: this.state.strokes.length, level: this.camera.projCamera.level },
    }));
  }

  private setupInput(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('pointerdown', guarded('pointerdown', (e: PointerEvent) => {
      this.handlePointerDown(e, canvas);
    }));
    canvas.addEventListener('pointermove', guarded('pointermove', (e: PointerEvent) => {
      this.handlePointerMove(e, canvas);
    }));
    canvas.addEventListener('pointerup', guarded('pointerup', (e: PointerEvent) => {
      this.handlePointerUp(e, canvas);
    }));
    canvas.addEventListener('pointercancel', guarded('pointercancel', () => this.handleCancel()));
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
      log('camera', 'pan start', { x: e.clientX, y: e.clientY });
      return;
    }
    canvas.setPointerCapture(e.pointerId);
    const ctx = this.context(e, canvas.getBoundingClientRect());
    log('tool', `${this.tools.activeId} onDown`, {
      frame: ctx.frame, pressure: +ctx.pressure.toFixed(3),
      pointerType: e.pointerType, button: e.button,
      screen: { x: e.clientX, y: e.clientY },
      color: this.settings.primary, size: this.settings.size, shape: this.settings.shape,
      level: ctx.projCamera.level, cameraScale: ctx.cameraScale,
      strokes: this.state.strokes.length,
    });
    this.tools.active.onDown(ctx);
    const tentativeId = this.tools.active.tentativeStrokeId;
    if (tentativeId) {
      this.collabClient.sendStrokeBegin({
        tentativeId,
        color: this.settings.primary,
        size: this.settings.size,
        camera: serializableCamera(this.camera.projCamera),
      });
    }
  }

  private handlePointerMove(e: PointerEvent, canvas: HTMLCanvasElement): void {
    if (this.isPanning) {
      const dx = e.clientX - this.lastPanX;
      const dy = e.clientY - this.lastPanY;
      this.camera.panPixels(dx, dy);
      this.lastPanX = e.clientX;
      this.lastPanY = e.clientY;
      logThrottled('pan', 100, () => ({
        cat: 'camera', msg: 'panning',
        data: { dx, dy, level: this.camera.projCamera.level, zoom: this.camera.logZoom },
      }));
      return;
    }
    const t0 = performance.now();
    const rect = canvas.getBoundingClientRect();
    const events = e.getCoalescedEvents?.() ?? [e];
    const tool = this.tools.active;
    for (const ev of events) tool.onMove(this.context(ev, rect));
    const frame = this.camera.screenToFrame(e.clientX - rect.left, e.clientY - rect.top);
    const tentativeId = tool.tentativeStrokeId;
    if (tentativeId) {
      this.collabClient.sendStrokePoint({ tentativeId, point: frame });
    }
    this.collabClient.broadcastCursor(frame.x, frame.y, serializableCamera(this.camera.projCamera));
    const dt = performance.now() - t0;
    // Buffer-only at normal speed; a slow move is the stall we are hunting, so it is loud.
    if (dt >= 30) {
      log('error', `SLOW pointermove ${dt.toFixed(1)}ms`, {
        tool: this.tools.activeId, coalesced: events.length,
        frame, strokes: this.state.strokes.length,
      });
    } else {
      logThrottled('pmove', 50, () => ({
        cat: 'pointer', msg: `${this.tools.activeId} onMove`,
        data: {
          frame, pressure: +e.pressure.toFixed(3), coalesced: events.length,
          ms: +dt.toFixed(2), buttons: e.buttons,
        },
      }));
    }
  }

  private handlePointerUp(e: PointerEvent, canvas: HTMLCanvasElement): void {
    if (e.button === 2) {
      this.isPanning = false;
      canvas.style.cursor = '';
      log('camera', 'pan end', { level: this.camera.projCamera.level });
      return;
    }
    const t0 = performance.now();
    const ctx = this.context(e, canvas.getBoundingClientRect());
    log('tool', `${this.tools.activeId} onUp`, { frame: ctx.frame, pressure: e.pressure });
    // Read tentativeStrokeId BEFORE onUp() — BrushTool.onUp nulls current stroke.
    // BrushTool.onUp() calls commit() which emits stroke:commit.
    // Instant-commit tools (tentativeId is null) commit inside own onUp() —
    // they never sent stroke:begin, so no separate emit needed.
    this.tools.active.onUp(ctx);
    log('tool', `${this.tools.activeId} onUp done`, {
      ms: +(performance.now() - t0).toFixed(2), strokes: this.state.strokes.length,
    });
  }

  private handleCancel(): void {
    log('tool', `${this.tools.activeId} cancel`, { wasPanning: this.isPanning });
    this.isPanning = false;
    this.tools.active.cancel();
  }

  private handleWheel(e: WheelEvent, canvas: HTMLCanvasElement): void {
    e.preventDefault();
    const factor = e.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
    const rect = canvas.getBoundingClientRect();
    const pivot = this.camera.screenToFrame(e.clientX - rect.left, e.clientY - rect.top);
    const before = this.camera.projCamera.level;
    this.camera.zoomBy(Math.log2(factor), pivot.x, pivot.y);
    const after = this.camera.projCamera;
    log('camera', 'zoom', {
      deltaY: e.deltaY, factor: +factor.toFixed(4), pivot,
      level: after.level, levelChanged: before !== after.level,
      sub: after.sub, frameScale: this.camera.frameScale, logZoom: this.camera.logZoom,
    });
  }

  private handleKeyDown(e: KeyboardEvent): void {
    const key = e.key.toLowerCase();
    const mod = e.ctrlKey || e.metaKey;
    if (mod && key === 'z' && !e.shiftKey) {
      log('state', 'undo requested');
      return this.run(this.state.undo());
    }
    if (mod && (key === 'y' || (key === 'z' && e.shiftKey))) {
      log('state', 'redo requested');
      return this.run(this.state.redo());
    }
    if (isTypingTarget(e.target)) return;
    if (key === 'escape') return this.zen.show();
    if (key === 'z' && !mod) return void this.zen.toggle();
    if (key === 'x') return this.toolbar.swap();
    const tool = SHORTCUTS[key];
    if (tool) {
      log('tool', 'tool selected by shortcut', { key, tool, from: this.tools.activeId });
      this.toolbar.selectTool(tool);
    }
  }

  private run(instructions: RendererInstruction[]): void {
    log('state', 'applying history instructions', {
      count: instructions.length,
      actions: instructions.map((i) => i.action),
    });
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

function serializableCamera(c: ProjCamera): StrokeBeginPayload['camera'] {
  return {
    level: c.level,
    cellX: c.cell.x.toString(),
    cellY: c.cell.y.toString(),
    subX: c.sub.x,
    subY: c.sub.y,
  };
}

/** BigInt cell as text — logs must stay JSON-serializable. */
function anchorCellText(stroke: BrushStroke): string {
  return `${stroke.anchor.cell.x},${stroke.anchor.cell.y}`;
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
