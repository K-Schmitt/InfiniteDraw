# InfiniteDraw

> **Academic project** — Official name: **InfinityBoard: Real-Time Vector Infinite Canvas**
> Author: Kylian Schmitt · Start: 2026-04-30 · Duration: 21 days · Deadline: **2026-05-21** · 4 credits

## What This Is
A collaborative infinite vector drawing app. Strokes are stored as points+pressures (not pixels), enabling lossless zoom and tiny file sizes. Real-time collaboration via WebSockets.

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

## TypeScript Standards

**Typing hygiene**
- No `any` — use `unknown` for truly unknown types, then narrow with a type guard before use
- Never annotate what TypeScript infers: `let score = 0` not `let score: number = 0`
- Always annotate function **return types** explicitly — prevents accidental `undefined` returns
- Use `interface` for object/class shapes; `type` for unions, tuples, and function signatures
- Use utility types instead of duplicating: `Partial<T>`, `Omit<T, K>`, `Pick<T, K>`, `Record<K, V>`
- `readonly` on parameters and interface fields that must not mutate; `readonly T[]` for input arrays

**Naming**
- `PascalCase` — classes, interfaces, types, enums
- `camelCase` — variables, functions, properties
- `UPPER_SNAKE_CASE` — module-level magic constants only (never for regular `const`)
- Booleans must ask a question: prefix with `is`, `has`, `should`, or `can` (`isLoading`, `hasPendingTiles`)
- No `I` prefix on interfaces (`User` not `IUser`)

**Size limits (hard rules)**
| Limit | Value | Rationale |
|-------|-------|-----------|
| Line length | 100 chars | Two files side by side without horizontal scroll |
| Function body | 30 lines | If it needs section comments, split it |
| File | 400 lines | Beyond this is a god module — split by responsibility |
| Parameters | **3 max** | Group into a config interface when you need more |
| Nesting depth | 3 levels | Use early-return guard clauses to flatten |

**Syntax rules**
- Optional chaining and nullish coalescing over manual null checks: `user?.city ?? 'Unknown'`
- `async/await` + `try/catch` — no `.then().catch()` chains
- `throw new Error(...)` — never `throw "string"`
- No nested loops when avoidable — O(n²) is fatal on an infinite canvas

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

## Academic Milestones
These are the deliverables as defined in the professor's contract. Each milestone maps to a release version.

| # | Milestone | Days | Release | Scope |
|---|-----------|------|---------|-------|
| 1 | Base architecture + infinite camera | 5d | v1.0 | Monorepo setup, screen↔world coordinate transform, right-click pan, mousewheel zoom, viewport culling |
| 2 | Drawing tools + Pointer Events | 4d | v2.0 | Pointer Events API (pressure x/y), perfect-freehand brush, eraser, Line + Rectangle tools, color picker, brush size slider |
| 3 | Data serialization + local storage | 4d | v2.0 | TypeScript Stroke interfaces, serialization to compressed format, Undo/Redo via stroke array index |
| 4 | Real-time collaboration (WebSockets) | 5d | v3.0 | Socket.io server, stroke broadcast, live active-path preview, append-only backend save |
| 5 | UI polish + export | 3d | v4.0 | CTRL+Right-click context menu, Zen Mode (hide UI), SVG export |

**Minimum required scope per version:**
- **v1.0** — Responsive infinite canvas, working camera (pan + zoom), basic stroke drawing
- **v2.0** — Full solo drawing experience: draw, erase, undo/redo, serialized to disk
- **v3.0** — Real-time multiplayer: live cursors + stroke sync
- **v4.0** — Context menu, Zen Mode, SVG export, production deployment

Features in the Complete Feature Spec above (layers, bookmarks, blend modes, lasso, clipboard…) are **stretch goals** beyond the contract minimum.

## Agent Docs
Read when relevant:
- docs/features.md — detailed per-feature implementation notes and open questions

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **InfiniteDraw** (263 symbols, 536 relationships, 15 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## When Debugging

1. `gitnexus_query({query: "<error or symptom>"})` — find execution flows related to the issue
2. `gitnexus_context({name: "<suspect function>"})` — see all callers, callees, and process participation
3. `READ gitnexus://repo/InfiniteDraw/process/{processName}` — trace the full execution flow step by step
4. For regressions: `gitnexus_detect_changes({scope: "compare", base_ref: "main"})` — see what your branch changed

## When Refactoring

- **Renaming**: MUST use `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` first. Review the preview — graph edits are safe, text_search edits need manual review. Then run with `dry_run: false`.
- **Extracting/Splitting**: MUST run `gitnexus_context({name: "target"})` to see all incoming/outgoing refs, then `gitnexus_impact({target: "target", direction: "upstream"})` to find all external callers before moving code.
- After any refactor: run `gitnexus_detect_changes({scope: "all"})` to verify only expected files changed.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Tools Quick Reference

| Tool | When to use | Command |
|------|-------------|---------|
| `query` | Find code by concept | `gitnexus_query({query: "auth validation"})` |
| `context` | 360-degree view of one symbol | `gitnexus_context({name: "validateUser"})` |
| `impact` | Blast radius before editing | `gitnexus_impact({target: "X", direction: "upstream"})` |
| `detect_changes` | Pre-commit scope check | `gitnexus_detect_changes({scope: "staged"})` |
| `rename` | Safe multi-file rename | `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` |
| `cypher` | Custom graph queries | `gitnexus_cypher({query: "MATCH ..."})` |

## Impact Risk Levels

| Depth | Meaning | Action |
|-------|---------|--------|
| d=1 | WILL BREAK — direct callers/importers | MUST update these |
| d=2 | LIKELY AFFECTED — indirect deps | Should test |
| d=3 | MAY NEED TESTING — transitive | Test if critical path |

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/InfiniteDraw/context` | Codebase overview, check index freshness |
| `gitnexus://repo/InfiniteDraw/clusters` | All functional areas |
| `gitnexus://repo/InfiniteDraw/processes` | All execution flows |
| `gitnexus://repo/InfiniteDraw/process/{name}` | Step-by-step execution trace |

## Self-Check Before Finishing

Before completing any code modification task, verify:
1. `gitnexus_impact` was run for all modified symbols
2. No HIGH/CRITICAL risk warnings were ignored
3. `gitnexus_detect_changes()` confirms changes match expected scope
4. All d=1 (WILL BREAK) dependents were updated

## Keeping the Index Fresh

After committing code changes, the GitNexus index becomes stale. Re-run analyze to update it:

```bash
npx gitnexus analyze
```

If the index previously included embeddings, preserve them by adding `--embeddings`:

```bash
npx gitnexus analyze --embeddings
```

To check whether embeddings exist, inspect `.gitnexus/meta.json` — the `stats.embeddings` field shows the count (0 means no embeddings). **Running analyze without `--embeddings` will delete any previously generated embeddings.**

> Claude Code users: A PostToolUse hook handles this automatically after `git commit` and `git merge`.

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
