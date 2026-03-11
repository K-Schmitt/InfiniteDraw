# InfiniteDraw

## What This Is
A collaborative infinite vector drawing app inspired by Lorien. Strokes are stored as points+pressures (not pixels), enabling lossless zoom and tiny file sizes. Real-time collaboration via WebSockets.

## Stack
- TypeScript 5.7 (strict)
- Client: Vite 7, PixiJS 8, perfect-freehand 1.2.3, socket.io-client 4.8
- Server: Node.js 24, Socket.io 4.8, Express
- Tests: Vitest 3 (client), tsx (server dev runner)
- Shared types: `shared/types/` consumed via tsconfig path aliases (`@shared/*`)

## Project Structure
- `shared/types/`  — TypeScript interfaces shared by client and server
- `client/src/`    — Vite app: rendering, drawing tools, camera, network
- `server/src/`    — Socket.io server: rooms, file storage
- `client/src/drawing/`  — Stroke recording, rendering, culling
- `client/src/tools/`    — Tool implementations (brush, eraser, shapes)
- `server/src/storage/`  — Binary file serializer (Lorien-compatible format)

## Key Commands
| Command | Description |
|---------|-------------|
| `npm run dev` | Start client + server in parallel |
| `npm run dev:client` | Vite dev server only (port 5173) |
| `npm run dev:server` | Node.js server only (port 3000) |
| `npm run test` | Vitest unit tests |
| `npm run build` | Build client + server |
| `npm run lint` | TypeScript type-check |

## Code Rules
- One function = one action. Never write functions that do multiple unrelated things.
- Keep files short and focused. Split when a file serves more than one responsibility.
- Keep functions short. If it needs section comments to explain, split it.
- No god objects, no god functions, no kitchen-sink modules.
- Prefer many small, well-named files over few large ones.
- Never name a file `utils` or `helpers` — name it for what it actually does.

## Git
- Conventional Commits: `<type>[scope]: <description>` — max 72 chars
- Types: feat, fix, docs, style, refactor, test, chore, perf, ci
- One commit = one fully functional, tested feature or fix
- Never commit half-broken, scattered, or WIP work

## Conventions
- All shared types in `shared/types/` — never duplicate in client or server
- Binary file format: version(u32) + meta(pascal-str) + strokes; see `server/src/storage/`
- Socket events: typed via `ServerToClientEvents` / `ClientToServerEvents` interfaces

## Complete Feature Spec
Every feature below is in scope. Do not omit or simplify any of them.

**Canvas & Navigation**
- Infinite canvas — limitless surface, smooth zoom + right-click pan
- Bookmarks — named camera anchors (x, y, zoom) for quick navigation to saved zones
- Zen mode — keyboard shortcut hides all UI, maximises canvas space

**Input & Tools**
- Stylus support — full Pointer Events API: pressure affects brush thickness/opacity (Wacom, iPad, etc.)
- Freehand brush — rendered via `perfect-freehand`, pressure-sensitive
- Eraser — pressure-sensitive, vector-based (removes stroke segments, not pixels)
- Shapes — straight line, rectangle, ellipse
- Color picker / eyedropper — pick color from canvas

**Layers**
- Multi-layer system — add, remove, reorder, rename, lock, hide layers
- Blend modes — Normal, Multiply, Screen, Overlay, Darken, Lighten, Add

**Editing**
- Stroke selection — rectangular selection + lasso, targets individual vector strokes
- Move/delete — selected strokes can be repositioned or removed post-creation
- Clipboard — copy-paste stroke groups; works within a project and across projects
- Undo/Redo — unlimited, implemented as index into in-memory stroke array

**Multiplayer**
- Real-time lobbies — create/join rooms via Socket.io; live stroke preview while drawing
- Cursor broadcast — other users' cursors visible in world space

**Save & Export**
- Proprietary binary format — delta-append mode (server appends new strokes, never rewrites full file)
- Screenshot export — capture a user-defined zone as PNG or JPG
- SVG export — mathematical vector export of the full canvas

**UI**
- Context menu — CTRL+right-click shows quick tool radial/list menu
- Color palettes — built-in palettes + user-defined, customisable, saveable per project

## Agent Docs
Read when relevant:
- docs/features.md — detailed per-feature implementation notes and open questions
