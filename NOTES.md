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

## Open Questions
- [ ] Should `pressures` fall back to a synthesized value when the device doesn't report pressure (mouse)?
- [ ] Undo/redo: local-only or collaborative? (Current plan: local-only; server has authoritative history)
- [ ] Layer blend modes: PixiJS BLEND_MODES or CSS compositing? (depends on renderer choice)
- [ ] Authentication: anonymous tokens per session, or named accounts?

## Lessons Learned
_(fill in as the project evolves)_
