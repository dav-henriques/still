# Architecture

still is a local-first app: a React interface in Chrome talks to a Node.js engine on `127.0.0.1`, which owns all files and runs native FFmpeg. Nothing leaves the machine.

```
┌──────────── Chrome ────────────┐        ┌──────────────── engine (Node + Express) ────────────────┐
│ React UI (apps/web)            │  REST  │ api/        routes + zod validation                       │
│  TanStack Query (server state) │ ─────▶ │ projects/   ProjectStore: CRUD, imports, peaks (locked)   │
│  Zustand (UI prefs, dialogs)   │        │ exports/    ExportQueue: persistent jobs, 1 render/time   │
│  <audio>, CSS crop preview     │ ◀───── │ media/      ffprobe, ffmpeg, sharp                        │
│                                │  SSE   │ services/   events (SSE), settings, OS integration        │
└────────────────────────────────┘        └───────────────────────┬──────────────────────────────────┘
                                                                  │ fs (atomic JSON) / child_process.spawn
                                                            data/ + output folder
```

## Packages

| Path | Role |
|---|---|
| `packages/shared` | Types, zod schemas, constants (`VIDEO`, quality presets), **the crop model**, job state machine, filename sanitising. Imported as TypeScript source by both apps. |
| `apps/server` | Express 5 engine, run with `tsx`. Serves the built UI in production. |
| `apps/web` | React 19 + Vite + Tailwind v4 UI. |

## Storage

- One folder per project (`data/projects/<16-hex id>/`), containing `project.json`, `audio/`, `artwork/`, `cache/`.
- `project.json` is validated with `ProjectSchema` on every read; damaged files surface as a clear error instead of crashing listings.
- Writes go to `file.<rand>.tmp` then `rename` (retried on Windows `EPERM/EBUSY`), so a crash never leaves half-written JSON.
- Every read-modify-write of a project runs under a per-project async lock (`createKeyedLock`).
- All paths are built with `safeJoin`, which rejects anything resolving outside its root; ids are validated against `^[a-z0-9]{8,32}$` before touching disk.
- Artwork records not referenced by any beat are garbage-collected (record and files) inside the same update.
- `data/exports.json` holds the export queue and history (capped at 500 finished jobs).
- `data/temp/` is wiped on startup — nothing can be running then, so anything there is crash debris.

## Media pipeline

**Audio import** — multer streams uploads to `temp/uploads` (never buffered in RAM). Each file is checked by extension, then by FFprobe (real container + an audio stream + a duration). Accepted files are moved into `audio/<beatId>.<ext>` byte-for-byte. Sources Chrome can't play (AIFF, ALAC, big-endian PCM) get a lossless FLAC playback proxy in `cache/`; export always uses the original.

**Waveform** — FFmpeg decodes once to mono f32 at 22.05 kHz, streamed through a max-abs reducer into 1,800 peaks, cached as JSON. Concurrent requests share one decode.

**Artwork import** — sharp validates the real format (PNG/JPEG/WebP). If EXIF orientation ≠ 1 a lossless oriented PNG becomes the render source (browsers apply EXIF, extract/FFmpeg don't — this keeps preview == export). A ≤2400 px WebP display copy and a ≤480 px thumbnail are generated.

### The crop model (preview == export)

`packages/shared/src/crop.ts` is the single source of truth:

- A crop is `{ zoom ∈ [1, 8], x ∈ [0, 1], y ∈ [0, 1] }`. `zoom = 1` is the largest square that fits (cover); `x/y` position the window within its free travel. Every in-range value is valid, so empty pixels are impossible by construction.
- `computeCropRect(w, h, crop)` → integer `{ left, top, size }` in source pixels.
- The **renderer** uses that rect directly: `sharp.extract(rect).resize(1080, 1080, lanczos3)`.
- The **preview** uses `cropToBoxStyle()`, derived from the same rect, to size/offset the full image inside the square.
- Tests check the property for random inputs, and the media test decodes exported frames and asserts which source colours land at which output pixels.

### Rendering (per job)

1. Re-read the project; validate beat, artwork and files exist.
2. Prepare the 1080 × 1080 square PNG (above) in `temp/`.
3. **Pass 1 — segment.** Encode ≤10 s of the static composition once: `format=rgb24 → pad=1920:1080:420:0:black → BT.709 tv-range → yuv420p`, then `loop` so the frame is built a single time. libx264, `-tune stillimage`, CRF/preset from the quality preset, one closed GOP, no B-frames, BT.709 tags.
4. **Pass 2 — mux.** `-stream_loop -1` the segment with `-c:v copy` under the complete original audio, cut with `-t <audio duration>`, `+faststart`. Audio: AAC sources are copied; others are AAC-encoded (fast coder for Standard/High, two-loop for Maximum; resampled to 48 kHz only above 96 kHz).
5. Progress: both passes run with `-progress pipe:1`; `out_time_us` against the known duration drives 0–10 % (segment) and 10–100 % (mux). Throttled to ~7 updates/s over SSE.
6. The output is written to `<outdir>/.still-<jobId>.partial.mp4`, then **verified with FFprobe** (mp4 container, H.264 1920×1080, AAC, duration within max(0.25 s, 0.5 %)).
7. A final name is reserved atomically (`open(..., 'wx')`, `Beat (2).mp4` on collision) and the partial is renamed onto it.
8. Temp square/segment always removed; failed or cancelled partials removed.

Why two passes: a single pass spends most of its time re-decoding the PNG and re-analysing 30 identical frames per second. Encoding one segment and stream-copying it makes video cost constant (~2–4 s) regardless of length; measured on a 60 s beat it is ~2.5× faster end to end, with equal or better fidelity (no mid-GOP drift).

### Queue

- States: `queued → preparing → rendering → completed | failed | cancelled`; `failed/cancelled → queued` on retry. Transitions are enforced by `canTransition`.
- Concurrency defaults to 1 (`STILL_RENDER_CONCURRENCY`, max 4).
- Cancelling a running job aborts its `AbortController`, which `SIGKILL`s FFmpeg; the worker cleans up and marks it cancelled.
- On startup, jobs found in `preparing/rendering` are marked failed with “Interrupted…”, their partials deleted; queued jobs resume.
- Queued jobs resolve the beat's current crop/artwork when they start, so edits made while waiting are honoured.

## Front end

- **Routing**: wouter — `/`, `/projects`, `/projects/:id`, `/projects/:id/beats/:beatId`, `/exports`, `/settings`.
- **Server state**: TanStack Query. Mutations return the full updated `Project`, which is written into the cache (`setProject`).
- **Live updates**: one `EventSource('/api/events')` upserts jobs into the `exports` query; `project` events refresh summaries.
- **UI state**: Zustand — persisted prefs (sidebar, inspector, volume) in localStorage with an in-memory fallback; imperative confirm/prompt dialogs; toasts (errors mostly).
- **Crop editing**: `useCropDraft` keeps a local draft rendered immediately, autosaves 350 ms after the last change, serialises saves per beat (mutation `scope`), and flushes on beat switch/unmount.
- **Playback**: a plain `<audio>` element streaming from the engine (HTTP range requests). The playhead/time are painted from `requestAnimationFrame` directly to the DOM — no React re-render per frame. The waveform is drawn twice on canvas (base + accent) and the played part is revealed by clipping.

## Security

- Bound to `127.0.0.1` by default. The `localOnly` middleware rejects non-loopback peers and `Host` headers (DNS rebinding), cross-origin `Origin`s, and `Sec-Fetch-Site: cross-site` requests.
- **LAN mode** (`STILL_LAN=1`) binds `0.0.0.0` and additionally accepts RFC 1918 private IPv4 addresses — for the connecting peer, `Host` and `Origin`. Hostnames other than `localhost` stay refused. There is no authentication; anyone on the network has full access. `hostMachineOnly` restricts the routes that open windows on the host (reveal, open output folder, folder picker) to loopback callers.
- All payloads validated with zod; upload size limits (2 GB audio, 100 MB image); real formats verified by FFprobe/sharp.
- Child processes use `spawn` with argument arrays (`shell: false`). The PowerShell folder picker receives its initial path through an environment variable, never string interpolation.
- File-serving routes resolve paths from stored records only (never from the request).
- No telemetry, accounts, or network calls.
