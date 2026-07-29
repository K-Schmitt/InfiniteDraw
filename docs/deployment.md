# Deployment notes

## Journal path footgun

The stroke journal (`CollabServer`'s second constructor argument) resolves
`JOURNAL_PATH` against the process's **current working directory**, not the
repo root. Running the server from the wrong directory silently opens (and
writes to) a different, likely empty, journal file — the drawings are not
lost, they are just in the other file.

This checkout already has two journals from that mistake:
`server/data/journal.bin` (51.7 MB, the real history) and a stray
`data/journal.bin` at the repo root (12 bytes, created by a run launched from
the repo root instead of `server/`).

- **Docker**: closed by the image's `WORKDIR /app` — the default
  `data/journal.bin` always resolves to `/app/data/journal.bin`, and a volume
  mounted at `/app/data` is unambiguous.
- **Local dev**: always run the server from `server/` (`cd server && npm run
  dev`), or set `JOURNAL_PATH` explicitly (e.g. `JOURNAL_PATH=$(pwd)/server/data/journal.bin`)
  if you must launch it from elsewhere.
