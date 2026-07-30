# InfinityBoard — Real-Time Vector Infinite Canvas

A collaborative drawing canvas with **genuinely unbounded zoom**. Strokes are stored as point
arrays, not pixels, so a drawing stays sharp at any magnification — and there is no zoom limit,
because there are no world coordinates to run out of precision.

Live: <your Coolify URL>

## Why "unbounded" is a real claim here

Figma, Excalidraw and tldraw all store coordinates as floats in one flat space, so they cap out
when the exponent runs out. This canvas has no flat space. Every stroke is addressed by a
**hierarchical anchor**: a quadtree `level` plus a `BigInt` cell, with its points stored local to
that cell in `[0, 65536)`. The camera is the same shape — integer level, BigInt cell, and a Q64
fixed-point sub-cell offset — and rendering projects anchors into a small-float "camera frame"
around the viewport, culling in BigInt before any float is touched.

Consequences you can check yourself:

- Zoom in ~40 wheel notches, draw a detail, press **Shift+C**, and share the link. It opens at
  that exact depth. The URL *is* `level` + cell + sub-offset — there is no other way to write
  the address down.
- Draw a mark, zoom in 10^12×, draw another mark inside it, zoom back out. Both are still there,
  both still crisp.
- Deep-zoom behaviour is pinned by `client/src/drawing/__tests__/zoomAcceptance.test.ts`:
  six named invariants across seven zoom levels, 2^120 down to 2^-120.

## Features

- Infinite canvas, right-click pan, wheel zoom, deep-zoom permalinks
- Pressure-sensitive freehand brush (`perfect-freehand`), line, rectangle, ellipse, triangle
- Vector eraser — subtracts area from stroke geometry, not pixels
- Paint bucket — raster region location plus exact geometric reconstruction, works at any zoom
- Eyedropper, two-colour palette, size slider
- Unlimited undo/redo
- Real-time collaboration over Socket.io: live stroke previews, ghost cursors, atomic batched
  edits, resync on reconnect
- SVG export (true vector), Zen mode, Ctrl+right-click quick menu
- Append-only binary journal on the server — deltas, never a full rewrite

## Run it

    npm ci --prefix client && npm ci --prefix server
    npm run dev        # client :5173, server :3000

    npm run test       # Vitest, client + server
    npm run lint       # tsc --noEmit, both packages
    npm run build      # production bundles

Deployment: see [docs/deployment.md](docs/deployment.md).

## Keyboard

| Key | Action |
|-----|--------|
| `B` `L` `R` `E` `F` `I` | brush · line · shape · eraser · fill · eyedropper |
| `X` | swap colours |
| `Z` | Zen mode |
| `Shift+C` | copy a deep-zoom permalink |
| `Ctrl+Z` / `Ctrl+Y` | undo / redo |
| Right-drag | pan · **Ctrl+right-click** quick menu |

## Architecture

| Directory | Responsibility |
|-----------|----------------|
| `shared/types/` | interfaces used by both sides; no build step (`@shared/*` path alias) |
| `client/src/coords/` | anchor ↔ camera-frame projection, BigInt culling, `ldexp` |
| `client/src/app/` | Pixi bootstrap, `HierCamera`, grid, permalinks |
| `client/src/drawing/` | stroke geometry, renderer, hit-testing, `fill/` bucket pipeline |
| `client/src/tools/` | one file per tool; all receive camera-frame coordinates |
| `client/src/export/` | SVG export |
| `client/src/network/` | Socket.io client, remote-op queue, reconnect policy |
| `server/src/` | Socket.io relay, global room, append-only binary journal |

Design decisions and their rationale, including the honest limits: [NOTES.md](NOTES.md).
