/**
 * Debug tracing for the client.
 *
 * Every call is recorded into an in-memory ring buffer with both a wall clock and a
 * high-resolution timestamp. Console echo is opt-in *per category* because the hot paths
 * (pointer move, per-frame render) fire hundreds of times a second and `console.log` is slow
 * enough to change the timing of the very stalls we are chasing — the buffer keeps the full
 * history regardless, so nothing is lost.
 *
 * Runtime control from the devtools console via `window.__idraw`:
 *   __idraw.dump()            → the whole buffer as an array
 *   __idraw.table('pointer')  → console.table of one category
 *   __idraw.download()        → save the full trace as JSON
 *   __idraw.echo('render')    → start echoing a muted category
 *   __idraw.mute('pointer')   → stop echoing a noisy one
 *   __idraw.stats()           → entry counts per category
 */

export type LogCategory =
  | 'life'      // app/session lifecycle
  | 'pointer'   // raw pointer events
  | 'tool'      // tool decisions: down/move/up, geometry produced
  | 'camera'    // pan / zoom / level crossings
  | 'render'    // renderer placement + geometry churn
  | 'state'     // CanvasState mutations, undo/redo
  | 'net'       // socket traffic in/out
  | 'geom'      // polygon-clipping and other geometry kernels
  | 'gl'        // WebGL / context events
  | 'error';

interface LogEntry {
  seq: number;
  /** ms since page load, sub-millisecond precision — use this to measure gaps. */
  t: number;
  /** wall clock, for lining up against the server log */
  iso: string;
  cat: LogCategory;
  msg: string;
  data?: unknown;
}

const RING_CAPACITY = 100_000;

/** Categories echoed to the console by default. The firehose ones stay buffer-only. */
const DEFAULT_ECHO: ReadonlySet<LogCategory> = new Set<LogCategory>([
  'life', 'tool', 'camera', 'net', 'state', 'geom', 'gl', 'error',
]);

/** Distinguishes the two browser windows in a shared trace. */
export const SESSION_ID = Math.random().toString(36).slice(2, 8);

const ring: LogEntry[] = [];
const echoing = new Set<LogCategory>(DEFAULT_ECHO);
const counts = new Map<LogCategory, number>();
let seq = 0;
let ringStart = 0;

const STYLES: Record<LogCategory, string> = {
  life: 'color:#8b5cf6;font-weight:bold',
  pointer: 'color:#64748b',
  tool: 'color:#0ea5e9',
  camera: 'color:#f59e0b',
  render: 'color:#10b981',
  state: 'color:#ec4899',
  net: 'color:#3b82f6',
  geom: 'color:#a855f7',
  gl: 'color:#f97316',
  error: 'color:#ef4444;font-weight:bold',
};

function push(entry: LogEntry): void {
  if (ring.length < RING_CAPACITY) {
    ring.push(entry);
    return;
  }
  ring[ringStart] = entry; // overwrite oldest
  ringStart = (ringStart + 1) % RING_CAPACITY;
}

/** Records one event. Cheap enough for per-pointer-event use; console echo is category-gated. */
export function log(cat: LogCategory, msg: string, data?: unknown): void {
  const entry: LogEntry = {
    seq: seq++,
    t: performance.now(),
    iso: new Date().toISOString(),
    cat,
    msg,
    ...(data !== undefined ? { data } : {}),
  };
  push(entry);
  counts.set(cat, (counts.get(cat) ?? 0) + 1);
  if (!echoing.has(cat)) return;
  const stamp = entry.t.toFixed(1).padStart(9);
  if (data === undefined) console.log(`%c[${stamp}] ${cat} ${msg}`, STYLES[cat]);
  else console.log(`%c[${stamp}] ${cat} ${msg}`, STYLES[cat], data);
}

const lastAt = new Map<string, number>();

/**
 * Records at most once per `ms` for a given key, but always counts the suppressed hits so the
 * trace still shows the true event rate. For firehose paths where every entry is redundant.
 */
export function logThrottled(
  key: string,
  ms: number,
  make: () => { cat: LogCategory; msg: string; data?: unknown },
): void {
  const now = performance.now();
  const prev = lastAt.get(key);
  const suppressedKey = `${key}:n`;
  const n = (lastAt.get(suppressedKey) ?? 0) + 1;
  if (prev !== undefined && now - prev < ms) {
    lastAt.set(suppressedKey, n);
    return;
  }
  lastAt.set(key, now);
  lastAt.set(suppressedKey, 0);
  const { cat, msg, data } = make();
  log(cat, msg, n > 1 ? { ...(data as object), _sinceLast: n } : data);
}

/** Times a synchronous call and logs it when it exceeds `budgetMs`. Returns the result. */
export function timed<T>(label: string, budgetMs: number, fn: () => T): T {
  const t0 = performance.now();
  try {
    return fn();
  } finally {
    const dt = performance.now() - t0;
    if (dt >= budgetMs) log('render', `SLOW ${label}`, { ms: +dt.toFixed(2) });
  }
}

function ordered(): LogEntry[] {
  if (ring.length < RING_CAPACITY) return [...ring];
  return [...ring.slice(ringStart), ...ring.slice(0, ringStart)];
}

function stats(): Record<string, number> {
  return Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1]));
}

function download(): void {
  const blob = new Blob([JSON.stringify({ session: SESSION_ID, entries: ordered() }, null, 2)], {
    type: 'application/json',
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `idraw-trace-${SESSION_ID}-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export interface DebugApi {
  dump(): LogEntry[];
  table(cat?: LogCategory): void;
  download(): void;
  stats(): Record<string, number>;
  echo(cat: LogCategory): void;
  mute(cat: LogCategory): void;
  clear(): void;
  session: string;
}

export function installDebugApi(): void {
  const api: DebugApi = {
    dump: ordered,
    table: (cat) => console.table(cat ? ordered().filter((e) => e.cat === cat) : ordered()),
    download,
    stats,
    echo: (cat) => { echoing.add(cat); },
    mute: (cat) => { echoing.delete(cat); },
    clear: () => { ring.length = 0; ringStart = 0; counts.clear(); },
    session: SESSION_ID,
  };
  (window as unknown as { __idraw: DebugApi }).__idraw = api;
  log('life', 'debug api ready', {
    session: SESSION_ID,
    echoing: [...echoing],
    muted: ['pointer', 'render'],
    hint: '__idraw.download() for the full trace; __idraw.echo("pointer") to unmute',
  });
}
