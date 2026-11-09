# Development

## Setup

```bash
npm install
npm run dev
```

`npm run dev` starts the engine with `tsx watch` on `127.0.0.1:4317` and Vite on `http://localhost:5173` (which proxies `/api`). Open the Vite URL.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Engine (watch) + Vite dev server |
| `npm start` | Build the UI if stale, run the engine serving it, open Chrome (`-- --no-open` to skip) |
| `npm run build` | Production build of the UI to `apps/web/dist` |
| `npm run typecheck` | `tsc --noEmit` for shared, server, web (strict) |
| `npm run lint` | ESLint (typescript-eslint + react-hooks) |
| `npm test` | Vitest: unit + integration + media tests |
| `npm run check` | All of the above |

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `STILL_PORT` | `4317` | Engine port (Vite proxy follows it) |
| `STILL_DATA_DIR` | `<repo>/data` | Projects, exports, settings, temp |
| `STILL_LAN` | — | `1` = LAN mode: listen on all interfaces, accept private-network IPs (no login) |
| `STILL_RENDER_CONCURRENCY` | `1` | Parallel FFmpeg renders (1–4) |
| `FFMPEG_PATH` / `FFPROBE_PATH` | — | Use specific binaries |

## FFmpeg

Binaries are resolved in this order, the first that runs `-version` wins:

1. Custom path in **Settings → Processing** (`settings.json`)
2. `FFMPEG_PATH` / `FFPROBE_PATH`
3. `ffmpeg` / `ffprobe` on `PATH`
4. Bundled `ffmpeg-static` (FFmpeg 6.1) / `ffprobe-static`

The bundled binaries are downloaded by the packages' install scripts (approved in `package.json → allowScripts`). If they're missing, run `npm rebuild ffmpeg-static` or install FFmpeg system-wide (`winget install Gyan.FFmpeg`) and restart.

## Tests

`npm test` runs:

- `packages/shared/src/shared.test.ts` — crop math (incl. 5,000 random inputs never exposing empty pixels), preview/export equivalence, filename sanitising, job transitions, schema validation, formatting.
- `apps/server/test/unit.test.ts` — progress parsing, FFmpeg argument construction, unique output paths, duration tolerance, path traversal, origin checks.
- `apps/server/test/workflow.test.ts` — boots the engine on a temp data dir and drives the HTTP API with generated media: project CRUD, multi-file import with a corrupt file, byte-identical originals, peaks, artwork assignment, crop persistence across an engine restart, real renders verified by FFprobe **and decoded frames** (black bars, artwork edges, crop colours at known pixels, centered default), no-overwrite naming, cancellation leaving no files, history across restart, and the security middleware.

The media tests need working FFmpeg/FFprobe and take ~10 s.

UI flows were verified manually in Chrome (create → import 5 formats → artwork via row drop, selection and editor → drag/zoom crop → playback/seek → batch export with live progress → exports list → restart persistence).

## Troubleshooting

| Symptom | Fix |
|---|---|
| “Port 4317 is already in use” | still is already running — open `http://localhost:4317`, or set `STILL_PORT`. |
| Banner “The still engine isn't responding” | The terminal running still was closed. Run `npm start` again; the page reconnects. |
| “FFmpeg missing” in the sidebar | See [FFmpeg](#ffmpeg); Settings → Processing shows what was detected. |
| `sharp` fails to load after switching Node versions | `npm rebuild sharp` |
| An audio file imports but won't play | Export still works; report the codec shown in the inspector. AIFF/ALAC are proxied automatically. |
| Export fails with “Not enough disk space” | Free space on the output drive, then Retry. |
| A video was moved/deleted outside still | Its row reports `file_missing`; remove it from the list. |
