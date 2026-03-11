# InfiniteDraw — Feature Implementation Notes

Detailed spec for every feature in scope. Read this when implementing a feature area.

---

## Canvas & Navigation

### Infinite Canvas
- No bounds on x/y coordinates. World space is unbounded `float`.
- **Camera** (`shared/types/camera.ts`): `{ x, y, zoom }`. Screen = (World − Camera.origin) × Camera.zoom.
- Pan: right-click + drag updates `Camera.x` / `Camera.y`.
- Zoom: scroll wheel; zoom toward the cursor (adjust origin to keep cursor world position fixed).
- Min zoom: 0.01 (1%), max zoom: 100 (10 000%).
- **Culling**: before rendering, compute `Viewport` in world space; skip strokes whose bounding box does not intersect it. Store a bounding box per `BrushStroke` (computed once on commit, cached).

### Bookmarks
- A `CameraBookmark` stores `{ id, label, camera: Camera }`.
- UI: bookmark list panel + keyboard shortcut to jump (e.g. `B` + index).
- Saved in `Project.bookmarks[]`, persisted in the binary file metadata.

### Zen Mode
- Keyboard shortcut (e.g. `Tab`) toggles visibility of all HTML/CSS UI panels.
- The PixiJS canvas always fills 100% of the viewport. In Zen mode, no overlapping elements.
- Restore on same shortcut.

---

## Input

### Stylus / Pointer Events
- Use `pointerdown`, `pointermove`, `pointerup` on the canvas element (not `mousedown`).
- `event.pressure` gives 0.0–1.0. Fall back to `0.5` for mouse (which reports 0 or 0.5 depending on browser).
- Pressure affects:
  - **Brush**: maps to stroke width via `perfect-freehand` `size` × pressure thinning.
  - **Eraser**: maps to eraser radius.
- Capture the pointer on `pointerdown` (`canvas.setPointerCapture(event.pointerId)`) to receive moves outside the element.

---

## Drawing Tools

### Freehand Brush
- On `pointermove`: append `{ x, y }` to current stroke's `points[]`, append `pressure` to `pressures[]`.
- Pass `points` + `pressures` to `getStroke()` from `perfect-freehand` to get outline polygon.
- Draw polygon with a single PixiJS `Graphics.poly().fill()` call per frame.
- On `pointerup`: finalise stroke (`BrushStroke` with `id`, `createdAt`, etc.), push to `CanvasState.strokes`, emit `stroke:commit` via Socket.io.

### Eraser
- Two modes: **stroke eraser** (removes whole strokes whose points fall within eraser radius) and **segment eraser** (splits strokes at the erased segment). Start with stroke eraser.
- Eraser is a `StrokeType.ERASER`; on commit, server records it like a stroke but the client resolves which strokes it cancels.

### Straight Line / Rectangle / Ellipse
- On `pointerdown`: record start point.
- On `pointermove`: preview shape in a temporary PixiJS layer.
- On `pointerup`: finalise as a `BrushStroke` with synthesised `points[]` (interpolated along the shape perimeter for vector fidelity).

### Eyedropper / Color Picker
- Read pixel color from the PixiJS renderer's canvas at the cursor position (`renderer.extract.pixel()`).
- Set as active brush color.

---

## Layers

- `Layer` has `id`, `name`, `blendMode`, `opacity`, `visible`, `locked`, `order`.
- Each layer renders to its own PixiJS `Container` with `blendMode` and `alpha` set.
- Layer containers stacked in the main PixiJS stage in `order` order.
- Blend modes map to PixiJS `BLEND_MODES`: `MULTIPLY`, `SCREEN`, `OVERLAY`, `DARKEN`, `LIGHTEN`, `ADD`.
- New strokes assigned to the currently active layer (`layerId`).
- Layer operations (add, remove, reorder) are local-only for now; sync via Socket.io in Step 4.

---

## Editing

### Stroke Selection (Rectangular + Lasso)
- **Rectangular**: drag to define an axis-aligned bounding box in world space. Any `BrushStroke` with bounding box overlapping the selection box is selected.
- **Lasso**: record free-form polygon path. A stroke is selected if its bounding box centroid is inside the lasso polygon (use ray-casting).
- Selected strokes are highlighted (e.g. tinted) in a separate PixiJS layer.

### Move
- On drag with selected strokes: offset all `points[]` in selected strokes by `(dx, dy)`.
- Recompute bounding boxes after move.
- Emit `stroke:commit` for each moved stroke with updated points after `pointerup`.

### Delete
- Remove selected `BrushStroke` objects from `CanvasState.strokes`.
- Emit `stroke:delete` for each deleted `strokeId`.

### Clipboard
- Copy: serialise selected strokes to `ClipboardData` (in-memory; no OS clipboard for now).
- Paste: deep-copy strokes with new `id` and `createdAt`; offset by a fixed delta (e.g. +10, +10) to avoid exact overlap.
- Cross-project paste: share `ClipboardData` via a browser `sessionStorage` or a dedicated socket event.

---

## Undo / Redo

- `CanvasState` maintains a `history: HistoryEntry[]` and `historyIndex: number`.
- Each `HistoryEntry` is a discriminated union: `{ type: 'add', stroke }`, `{ type: 'delete', stroke }`, `{ type: 'move', strokeId, before, after }`.
- `undo()`: apply inverse of `history[historyIndex]`, decrement index.
- `redo()`: apply `history[historyIndex + 1]`, increment index.
- Unlimited depth (no cap). In practice bounded by RAM.
- Undo/Redo is **local only** — does not broadcast to other users.

---

## Multiplayer

### Rooms
- `room:create` → server generates a `roomId` (short UUID), responds via callback.
- `room:join(roomId)` → server emits `project:state` with current strokes + layers.
- Server tracks `Map<roomId, Room>` where `Room = { strokes, layers, users }`.

### Live Preview
- While drawing: emit `stroke:preview({ id, points, pressures })` throttled to ~30Hz.
- Other clients render preview strokes in a separate "draft" layer (not committed to `CanvasState`).
- On `stroke:commit`: remove draft, add to committed strokes.

### Cursor Broadcast
- Emit `cursor:move({ x, y })` throttled to ~20Hz.
- Server broadcasts to all other clients in the room.
- Render remote cursors as small overlays with user colour.

---

## Save & Export

### Binary Format (Lorien-compatible)
See `server/src/storage/` for the serializer. Format summary:
```
u32   VERSION_NUMBER
pascal_string  metadata  (key=value,... — id, name, createdAt, modifiedAt)
[per stroke]:
  u8   type
  u8   r, g, b, a
  u16  size
  u16  pointCount
  [per point]: f32 x, f32 y, u8 pressure
```
Delta-append: server keeps the file open (or reopens in append mode) and writes only new stroke records. No full rewrite on every save.

### Screenshot Export
- User draws a rectangular selection zone over the canvas.
- Use `renderer.extract.canvas({ region })` to get that area as a canvas element.
- Convert to PNG or JPG via `canvas.toDataURL()`, trigger browser download.

### SVG Export
- Iterate all visible strokes in viewport order.
- For each stroke, call `getStroke()` to get outline polygon, emit as `<path d="..."/>`.
- Include layer `opacity` and blend mode as SVG `<g>` attributes where supported.

---

## UI & UX

### Context Menu (CTRL + Right-click)
- Intercept `contextmenu` event when `Ctrl` is held.
- Show a compact radial or list menu near the cursor: Brush, Eraser, Line, Rect, Ellipse, Eyedropper, Select.
- Regular right-click (no Ctrl): start canvas pan.

### Color Palettes
- A `Palette` is `{ id, name, colors: Color[] }`.
- Built-in palettes: basic 16-colour, grayscale, pastel.
- User can add/remove colours, rename palette, create new palette.
- Palettes saved in `localStorage` and in `Project.meta` (as JSON in the metadata pascal string).

---

## Open Questions
- [ ] Eraser mode: stroke-level vs segment-level? Start with stroke-level for Step 3.
- [ ] Cross-project clipboard: in-memory only (same browser session) or via server?
- [ ] Layer sync: broadcast layer changes in real time or only on reconnect?
- [ ] Palette storage: localStorage only, or persist in the project file metadata?
- [ ] Lasso selection: centroid test or any-point-inside test?
