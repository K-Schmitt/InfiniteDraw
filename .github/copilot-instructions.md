# InfiniteDraw

Collaborative infinite vector drawing app. Strokes are point+pressure arrays (not pixels), enabling lossless zoom and tiny files. Real-time multiplayer via WebSockets. Inspired by Lorien (GDScript).

## Tech Stack

### Client
- TypeScript 5.7 (strict mode, no `any`)
- Vite 7 (bundler), PixiJS 8 (WebGL rendering)
- perfect-freehand 1.2.3 (stroke outline math)
- socket.io-client 4.8 (real-time sync)

### Server
- Node.js 24, Express, Socket.io 4.8
- Binary flat-file storage (custom format, zlib deflate)
- tsx (TypeScript dev runner, no compile step)

### Testing
- Vitest 3 (client unit tests)

### Tooling
- concurrently (root dev script)
- tsconfig path aliases: `@shared/*` → `shared/types/*`

## Coding Guidelines
- One function = one action. No multi-purpose functions.
- Keep files short and focused. Split when responsibilities diverge.
- Keep functions short. A function needing section comments is too long.
- No god objects, no god functions, no kitchen-sink modules.
- TypeScript strict: no `any`, no non-null assertions without justification.
- All business logic must have unit tests (Vitest).
- Conventional Commits: `<type>[scope]: <description>` — max 72 chars
- Never commit half-done work. One commit = one complete, tested feature.

## Project Structure
- `shared/types/`         : Interfaces for BrushStroke, Layer, Project, socket events
- `client/src/app/`       : PixiJS app init, Camera (infinite pan/zoom)
- `client/src/drawing/`   : StrokeRecorder (pointer events → BrushStroke), StrokeRenderer, Culling
- `client/src/tools/`     : Tool implementations: BrushTool, EraserTool, shapes
- `client/src/state/`     : CanvasState (undo/redo stack, layers, strokes)
- `client/src/network/`   : SocketClient wrapper
- `server/src/rooms/`     : RoomManager (lobby + user tracking)
- `server/src/storage/`   : FileStore binary serializer (Lorien-compatible format)

## Complete Feature Scope
All features below are in-scope. Do not skip or stub any of them in final code.

- **Infinite canvas** — limitless, smooth zoom + right-click pan, viewport culling
- **Stylus pressure** — Pointer Events API; pressure → thickness/opacity (Wacom, iPad…)
- **Tools** — freehand brush, eraser, line, rectangle, ellipse, eyedropper
- **Layers** — multi-layer, blend modes (Multiply, Screen, Overlay, Darken, Lighten, Add)
- **Stroke editing** — rectangular selection + lasso; move/delete strokes post-creation
- **Clipboard** — copy-paste stroke groups within and across projects
- **Undo/Redo** — unlimited (index into in-memory stroke array)
- **Multiplayer** — Socket.io rooms; live stroke preview + cursor broadcast
- **Bookmarks** — named (x, y, zoom) anchors for quick canvas navigation
- **Zen mode** — keyboard shortcut hides all UI, maximises canvas
- **Context menu** — CTRL+right-click for quick tool menu; right-click = pan
- **Save format** — binary delta-append (server appends strokes, never full rewrite)
- **Export** — screenshot zone → PNG/JPG; full canvas → SVG
- **Color palettes** — built-in + user-defined, saveable per project

## Resources & Tools
- `npm run dev`           : Start client (:5173) + server (:3000)
- `npm run test`          : Vitest unit tests
- `npm run lint`          : TypeScript type-check (tsc --noEmit)
- `npm run build`         : Production build for client + server
- `docs/features.md`      : Detailed per-feature implementation notes
