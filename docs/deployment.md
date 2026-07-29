# Deployment

## Production (Coolify)

- Build pack: Dockerfile (`/Dockerfile`, 3 stages: client build → server build → runtime)
- Exposed port: 3000
- Health check: `GET /health`
- Volume: `/app/data` (stroke journal — without it the room resets on redeploy)
- Environment:

| Key | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `PORT` | `3000` |
| `JOURNAL_PATH` | `/app/data/journal.bin` |

- `CLIENT_ORIGIN` unset on purpose: client and Socket.io share one origin, so
  `allowedOrigins()` reflects the request origin instead of the dev allowlist.

## Classic (any Docker host)

```bash
docker build -t infinityboard .
docker run -d -p 3000:3000 -v infinityboard-data:/app/data \
  -e NODE_ENV=production infinityboard
```

## Without Docker

```bash
npm ci --prefix client && npm ci --prefix server
npm run build
NODE_ENV=production npm start --prefix server
```

See "Journal path footgun" below — `JOURNAL_PATH` defaults to the **cwd-relative**
`data/journal.bin`, so always start from `server/` or set it explicitly.

### Journal path footgun
The stroke journal (`CollabServer`'s second constructor argument) resolves
`JOURNAL_PATH` against the process's **current working directory**, not the
repo root. Running the server from the wrong directory silently opens (and
writes to) a different, likely empty, journal file — the drawings are not
lost, they are just in the other file.

This checkout already has two journals from that mistake: `server/data/journal.bin`
(51.7 MB, the real history) and a stray `data/journal.bin` at the repo root
(12 bytes, created by a run launched from the repo root instead of `server/`).

- **Docker**: closed by the image's `WORKDIR /app` — the default `data/journal.bin`
  always resolves to `/app/data/journal.bin`, and a volume mounted at `/app/data`
  is unambiguous.
- **Local dev**: always run the server from `server/` (`cd server && npm run dev`),
  or set `JOURNAL_PATH` explicitly (e.g. `JOURNAL_PATH=$(pwd)/server/data/journal.bin`)
  if you must launch it from elsewhere.

## Verifying the WebSocket upgrade

```bash
curl -i "$DOMAIN/socket.io/?EIO=4&transport=polling" | head -1   # expect HTTP 200
```

Browser DevTools → Network → WS must show `101 Switching Protocols`. A connection
stuck on `polling` means the reverse proxy is dropping `Upgrade`/`Connection` headers.
