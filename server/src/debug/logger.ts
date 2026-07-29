import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs';
import { join } from 'node:path';

/**
 * Server-side debug trace. Writes newline-delimited JSON to `logs/` (one file per boot) and
 * mirrors a readable line to stdout. JSONL is used so a session can be replayed or filtered
 * with `jq` without parsing a bespoke format, and so a crash mid-write only truncates the
 * last record rather than corrupting the file.
 *
 * Wall-clock ISO timestamps line up with the client trace; `t` is ms since server boot.
 */
export type LogCategory =
  | 'life'    // process / server lifecycle
  | 'conn'    // socket connect / disconnect / join
  | 'net'     // inbound and outbound events
  | 'room'    // room state mutations
  | 'store'   // journal / persistence
  | 'error';

const LOG_DIR = 'logs';
const bootAt = Date.now();

let stream: WriteStream | null = null;
let filePath = '';

function openStream(): WriteStream {
  if (stream) return stream;
  mkdirSync(LOG_DIR, { recursive: true });
  const stamp = new Date(bootAt).toISOString().replace(/[:.]/g, '-');
  filePath = join(LOG_DIR, `server-${stamp}.jsonl`);
  stream = createWriteStream(filePath, { flags: 'a' });
  return stream;
}

/** Records one event to the log file and stdout. `data` must be JSON-serializable. */
export function log(cat: LogCategory, msg: string, data?: unknown): void {
  const now = Date.now();
  const entry = {
    t: now - bootAt,
    iso: new Date(now).toISOString(),
    cat,
    msg,
    ...(data !== undefined ? { data } : {}),
  };
  try {
    openStream().write(`${JSON.stringify(entry, bigintSafe)}\n`);
  } catch (err) {
    console.error('[log] write failed', err);
  }
  const suffix = data === undefined ? '' : ` ${JSON.stringify(data, bigintSafe)}`;
  console.log(`[${String(entry.t).padStart(8)}ms] ${cat} ${msg}${suffix}`);
}

/** BigInt is not JSON-serializable; stroke anchors are full of it. */
function bigintSafe(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? `${value}n` : value;
}

export function logFilePath(): string {
  return filePath || '(not yet opened)';
}

/** Logs process-level failures that would otherwise kill the server without explanation. */
export function installProcessHooks(): void {
  openStream(); // so `logFilePath()` is usable before the first log call
  process.on('uncaughtException', (err) => {
    log('error', 'uncaughtException', { message: err.message, stack: err.stack });
  });
  process.on('unhandledRejection', (reason) => {
    log('error', 'unhandledRejection', {
      reason: reason instanceof Error ? reason.stack : String(reason),
    });
  });
  process.on('SIGINT', () => {
    log('life', 'SIGINT — shutting down');
    stream?.end();
    process.exit(0);
  });
}
