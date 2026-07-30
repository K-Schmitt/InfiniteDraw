# InfiniteDraw — Decision Log

## Academic Contract Summary
- **Official title:** InfinityBoard: Real-Time Vector Infinite Canvas
- **Author:** Kylian Schmitt
- **Start:** 2026-04-30 · **Deadline:** 2026-06-21 · **Credits:** 4
- **Required stack (per contract):** Vite TypeScript, Socket.io, perfect-freehand, PixiJS + WebGL

### Milestone Timeline
| Milestone | Days | Cumulative |
|-----------|------|------------|
| 1 — Architecture + camera | 5d | 5d |
| 2 — Drawing tools | 4d | 9d |
| 3 — Serialization + undo | 4d | 13d |
| 4 — Real-time collab | 5d | 18d |
| 5 — Polish + export | 3d | 21d |

## Architecture Decisions

### Monorepo without workspaces
**Decision:** `client/` and `server/` are separate npm projects under a root coordinator. No npm workspaces hoisting.
**Rationale:** Simpler dependency isolation; avoids hoisting conflicts between browser-only (PixiJS) and Node-only (Express) packages. A single `npm run dev` at root uses `concurrently`.

### Shared types via tsconfig path aliases
**Decision:** `shared/types/*.ts` consumed directly via `@shared/*` alias. No build step for shared code.
**Rationale:** Zero overhead — types are compile-time only. `vite-tsconfig-paths` resolves them in the client; `tsx` resolves them natively on the server. No need to publish or link a local package.

### PixiJS v8 over Canvas2D API
**Decision:** PixiJS 8 for rendering.
**Rationale:** WebGL-accelerated renderer, built-in scene graph for layers, mature stroke batching. Canvas2D would require manual batching for thousands of strokes. PixiJS 8 is async-initialized and supports WebGPU via `preference: 'webgpu'`.

### perfect-freehand for stroke math
**Decision:** `perfect-freehand` library for converting raw pointer events into smooth outline polygons.
**Rationale:** Handles pressure-sensitive thinning, streamlining, and end caps correctly. Output is a `[x, y][]` polygon that can be filled with a single PixiJS Graphics call.

### Binary file format (Lorien-compatible)
**Decision:** Custom binary format inspired by the Lorien GDScript serializer. Per-stroke binary layout:
- `u8` type, `u8` r, `u8` g, `u8` b, `u8` a, `u16` size, `u16` pointCount
- Per point: `f32` x, `f32` y, `u8` pressure (0–255)
**Rationale:** Compact. A 1000-point stroke = 8 + 1000 × 9 = 9008 bytes. Compare to JSON (~50KB for same data). Server appends stroke records without rewriting the file (delta append mode).

### Socket.io over raw WebSockets
**Decision:** Socket.io 4 for real-time communication.
**Rationale:** Built-in rooms, typed events, reconnection, and fallback transport. Raw WebSockets would require reimplementing rooms and broadcast logic.

### Flat file storage, no database
**Decision:** Single `.lorien` binary file per room. No relational DB.
**Rationale:** Matches Lorien's design. Stroke data is append-only (undo is client-side only). Eliminates operational overhead of a DB. Future migration to SQLite or S3 is straightforward.

### Binary format instead of JSON (diverges from contract)
**Decision:** Custom binary format instead of the "highly compressed JSON" mentioned in the contract.
**Rationale:** The contract says "highly compressed JSON" but a proper binary layout (u8/u16/f32 fields) is 5–10× smaller and faster to parse. The deliverable requirement (lightweight, fast-loading stroke storage) is fully met — the implementation just exceeds the spec. Will document this choice if asked by the professor.

### Infinite-zoom rendering — LOD tile pyramid + camera-origin vectors
**Decision:** Two rendering regimes sharing one `StrokeStore` (flat indexed stroke list).
- **Vector mode** (`zoom ≥ 0.5`): one PixiJS `Graphics` per stroke, projected each frame
  relative to the **camera origin** (`(world − camera)·zoom`). The camera is the floating
  origin, so visible coordinates stay small — float32-safe, crisp, jitter-free — and strokes
  grow without bound on zoom-in. Culled by cached bbox + on-screen size.
- **Tile mode** (`zoom < 0.5`): an adaptive **LOD tile pyramid** (`client/src/drawing/lod/`).
  Tile world-size scales with zoom (`level = round(log2(TILE_PX/(BASE·zoom)))`), so the
  on-screen tile size — and therefore the visible tile *count* — is bounded at every zoom.
  Each tile is baked once into a 256² `RenderTexture` (one sprite = one draw call), cached
  with a hard LRU cap (`MAX_TILES=192` ≈ 50 MB GPU), and baked ≤3/frame (amortized).

**Rationale:** A single coordinate frame can't span infinite zoom (float precision + GPU
float32). The earlier fixed-size chunk system baked a full texture per chunk regardless of
on-screen size → at extreme dezoom it allocated hundreds of textures in one frame → GPU OOM
freeze past 10⁻³. Tying tile size to zoom makes per-frame cost **constant at any zoom**.

**Deviation from plan:** the plan proposed a *per-stroke* local origin for vector mode; during
implementation that proved to introduce float32 jitter for large strokes whose anchor sits far
off-screen. The **camera origin** is the precision-optimal floating origin and is used instead.

**Honest limits (documented in code):**
- Dezoom: effectively unbounded — constant per-frame cost (bounded tiles + capped bakes + LRU).
- Zoom-in: unbounded *growth* (no premature vanish below the ~10³³ float32 guard). Absolute
  placement precision is bounded by float64 storage of stroke coords (~10¹² near origin, less
  if panned astronomically far first). Truly unbounded zoom-in for arbitrary coords would need
  a nested-frame data model — out of scope.
- Pathological density (100k+ strokes in one coarse tile): bake is O(strokes-in-tile);
  child-tile downsampling (mipmap compositing) is the future optimization.

## Known Issues / Tech Debt
_Ordered by priority to revisit. Two acted-upon at the F2 audit (2026-07-23), two still open._

### RESOLVED — Fill targeted the wrong (parent) shape

Two independent defects, both fixed.
1. **Precedence.** `fillTarget()` asked "is a stroke under the cursor?" before "is the cursor
   inside an enclosed region?", so once shape A was filled, A's own background fill covered every
   later click inside it and shape B could never be filled. The decision now lives in
   `client/src/drawing/fillDecision.ts` and is region-first; a direct stroke hit is the fallback.
2. **Conditioning.** `enclosedRegionAt` normalized *every* visible stroke into one shared
   [0,1000] box, so an extreme scale ratio in view collapsed small shapes below the clipper's
   epsilon — the "nothing fills at all" case. Replaced by a two-stage pipeline
   (`client/src/drawing/fill/`): a raster flood in bounded screen space identifies the region and
   the strokes bounding it, then the exact reconstruction runs against those strokes only,
   normalized around the region alone. Conditioning is now independent of what else is on screen.

Fill success across the zoom matrix (8 cases × 5 zoom levels): <fill in from Task 17 step 8>.

### RESOLVED — Eraser remnant explosion flooded peers

Root cause: the eraser committed and broadcast fresh remnant strokes on *every* drag step.
Fixed at the source — `client/src/tools/EraserSession.ts` buffers the whole gesture in camera-frame
coordinates and anchors once on pointer-up; the gesture crosses the wire as a single
`stroke:batch`, and remnant rings are simplified before commit.

Measured, one long erase pass across five freehand strokes:

| | before | after |
|---|---|---|
| strokes emitted | <fill in> | <fill in> |
| socket messages | <fill in> | 1 |
| peer longest task | 15,432 ms | <fill in> |
| journal growth | <fill in> | <fill in> |

The receiver-side `RemoteStrokeQueue` batching stays in place as defence in depth.

### KNOWN LIMITATION — residual camera drift past ~2^-60 zoom-out

Bounded and measured, not open-ended. `client/src/drawing/__tests__/zoomAcceptance.test.ts`
pins six named invariants across seven zoom levels, 2^120 down to 2^-120 (≈ 10^±36 — the *tested*
range, not the architectural limit, which is unbounded by construction):

1. a committed gesture round-trips within one pixel
2. an origin-straddling gesture still anchors and terminates
3. the paint bucket's pure stages are invariant under `frameScale`
4. a symmetric zoom round trip returns to level 0 within one pixel of total drift
5. a stroke drawn at the camera level is never culled at that level
6. pan → zoom → pan-back lands within one pixel

Failing combinations: CASE 4 / level 20, CASE 4 / level 60, CASE 4 / level 120, CASE 4 / level -20,
CASE 4 / level -60, CASE 4 / level -120. Documented failures are `it.fails`, so they flip the suite
red again if they ever start passing.

Not covered by these six: the eraser, undo/redo, a collab round trip of a deep-zoom stroke, and
render-placement mode transitions (`baked` → `frame` → `bleed`).

`RENDER_LOG_LIMIT = 600` is **not** a zoom clamp on anything tested here: it is in ln units
(e^600 ≈ 10^260) and applies only inside `toLegacyCamera()`, whose sole consumer is
`GridBackground`. `StrokeRenderer`, `projectToFrame` and the fill mask all see the unclamped
camera.

Root cause of the CASE 4 failures: `normaliseLevel`'s `HYSTERESIS` dead-band crosses a level
upward only at `frac >= 1.05` but downward at `frac < -0.05`, so N unit-magnitude `zoomBy` calls in
one direction cross one fewer level boundary than N calls in the other — a symmetric round trip
ends one level off, with the missing crossing's pivot shift stranded in `sub` as ~200-unit drift
(not sub-pixel). This reproduces at every nonzero tested level, not just the deep end, and is
independent of the Q64 sub-cell erosion mechanism below. A full fix means touching
`normaliseLevel`'s dead-band thresholds, which is locked-invariant camera code — out of scope for
this task; carrying only the `carry()` divmod hardening was approved.

Root cause of the deep zoom-out cases in general: `HierCamera`'s Q64 fixed-point sub-cell offset
erodes one fractional bit per level crossing (`rescaleCell`'s `>>1`), so a round trip through more
than ~64 levels genuinely underflows. That is a property of the representation, not a bug in it —
the point is sub-pixel and invisible at that depth either way. A full fix means a world-anchored
camera redesign, which is out of scope for v4.0.

### ACTED — F2 bug 1 (deep-zoom flicker) · **fixed** (commit `966f9c2`)

Float32 GPU-transform cancellation at large gap. Fixed via per-vertex float64 frame projection +
bleed routing past the float32 span limit. Closed.

### ACTED — F2 bug 2 (deep zoom-out drift) · **improved, PASS PARTIEL** (commit `1a62e2c`)

BigInt Q64 sub-cell offset removes the exponential cell corruption. Residual linear pan drift
remains (see the OPEN zoom-out item above). Debt: world-anchored camera for full precision.

### Deferred debt (pre-existing, lower priority)

- v2→v3 data migration (old world-coord strokes → anchored).
- `SpatialIndex` bucketing (currently O(N) viewport scan; `BUCKET_LEVEL=8` noted).
- Width margin on `cellBbox` (stroke half-width can cross the anchor cell edge).
- Remove the disabled LOD `TileLayer` (vector-always since F2) or re-anchor it.
- Reconnect discards local undo history and any strokes drawn while offline: peers committed
  strokes with server-assigned `zIndex` in the meantime, and there is no way to interleave the
  local history with them consistently. Offline edit buffering would need per-stroke causality
  (a Lamport clock or CRDT), which is out of scope.
- Live brush preview still emits one `stroke:point` per pointer sample. Same "many small messages"
  shape Phase 4 fixed for the eraser, at a much smaller per-message scale; batching it is deferred.
- No server-side rate or size limit on any socket handler. Every throttle today is client-side
  (`CURSOR_THROTTLE_MS`, the eraser's `minStep`) and therefore bypassable by a scripted client.
  Accepted for a single-room academic app; it is not an abuse-resistant server.
- `stroke:batch` rides Socket.IO's default 1 MB `maxHttpBufferSize` with no per-gesture piece cap.
  A pathological erase across many tangled strokes could in principle be disconnected by Socket.IO
  itself. Considered and accepted — realistic gestures are orders of magnitude below it.
- The journal never compacts, and `recolorStrokes` appends a full stroke record per recolor, so
  replay cost is O(all-events-ever) rather than O(live-strokes). Slower-growing than the eraser
  bug Phase 4 fixed, same shape; compaction is out of a 21-day scope.
- Pan and the context menu are keyed off `e.button === 2`, which has no touch equivalent — so
  touch-only devices can draw but cannot pan or open the menu, despite the stylus-support goal.

## Open Questions
- [ ] Should `pressures` fall back to a synthesized value when the device doesn't report pressure (mouse)?
- [ ] Undo/redo: local-only or collaborative? (Current plan: local-only; server has authoritative history)
- [ ] Layer blend modes: PixiJS BLEND_MODES or CSS compositing? (depends on renderer choice)
- [ ] Authentication: anonymous tokens per session, or named accounts?

## Lessons Learned
_(fill in as the project evolves)_
