# InfiniteDraw

Collaborative infinite vector drawing in the browser. Strokes are stored as point arrays with per-point stylus pressure — not pixels — enabling infinite zoom, tiny save files, and real-time collaboration.

Inspired by [Lorien](https://github.com/mbrlabs/Lorien).

## Quickstart

```bash
# Install all dependencies
npm install && cd client && npm install && cd ../server && npm install && cd ..

# Start dev environment (client on :5173, server on :3000)
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Development

```bash
# Run tests
npm run test

# Type-check only (no emit)
npm run lint

# Production build
npm run build
```

## Architecture

**Client** (`client/`): Vite 7 + TypeScript app. PixiJS 8 renders strokes to a WebGL canvas. `perfect-freehand` converts raw pointer events into smooth outline polygons. A Camera object handles infinite pan/zoom. Socket.io-client syncs strokes in real time.

**Server** (`server/`): Node.js 24 + Express + Socket.io. Manages drawing rooms and persists strokes to a binary file (Lorien-compatible format: version header + deflate-compressed stroke records).

**Shared types** (`shared/types/`): TypeScript interfaces for `BrushStroke`, `Layer`, `Project`, and socket event contracts. Consumed by both client and server via `@shared/*` path alias — no build step needed.

## Git Workflow

Conventional Commits: `<type>[scope]: <description>` — max 72 chars. One commit = one complete, tested feature.
