# Engine API

Base URL: `http://127.0.0.1:4317/api` (proxied as `/api` by the Vite dev server). JSON in and out unless noted. Requests must come from a loopback host (or a private-network IP in LAN mode, `STILL_LAN=1`); cross-origin requests from websites get `403`.

## Errors

```json
{ "error": { "code": "missing_artwork", "message": "2 beats need artwork before exporting.", "details": "Ember, Low Tide" } }
```

| Status | Typical codes |
|---|---|
| 400 | `invalid_request`, `invalid_json`, `missing_artwork`, `unsupported_image`, `no_files`, `invalid_output_dir`, `output_dir_not_writable` |
| 403 | `forbidden_host`, `forbidden_origin`, `host_machine_only` (reveal / open folder / folder picker called from another computer in LAN mode) |
| 404 | `project_not_found`, `beat_not_found`, `artwork_not_found`, `export_not_found` |
| 409 | `not_active`, `not_retryable`, `still_active`, `not_completed` |
| 410 | `file_missing` (exported file was moved/deleted) |
| 413 | `limit_file_size` |
| 422 | `media_error` (unreadable/corrupt media) |
| 500 | `project_invalid`, `project_unreadable`, `internal` |
| 503 | `ffmpeg_missing` |

Types referenced below (`Project`, `Beat`, `Artwork`, `ExportJob`, `Settings`, `SystemStatus`) are defined in [`packages/shared/src/schemas.ts`](../packages/shared/src/schemas.ts).

## System

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | `{ ok: true, version }` |
| GET | `/system` | `SystemStatus` — FFmpeg/FFprobe availability, versions, source, storage paths, temp usage. `?refresh=1` re-detects binaries. |
| GET | `/settings` | `Settings` |
| PATCH | `/settings` | Partial `Settings`. `outputDir` must be absolute and writable (created if missing); `null` = managed folder. Changing `ffmpegPath`/`ffprobePath` re-detects. |
| POST | `/system/pick-folder` | Windows only: shows the native folder dialog on this machine. `{ path: string \| null }`. `501` elsewhere. |
| POST | `/system/open-output` | Opens the output folder in Explorer/Finder. `204`. |
| POST | `/system/cleanup-temp` | Removes temp files not used by active exports and older than 10 min. `{ freed: bytes }` |

## Projects

| Method | Path | Body → Response |
|---|---|---|
| GET | `/projects` | → `ProjectSummary[]` (newest first) |
| POST | `/projects` | `{ name, quality? }` → `201 Project` |
| GET | `/projects/:id` | → `Project` |
| PATCH | `/projects/:id` | `{ name?, exportSettings?: { quality } }` → `Project` |
| DELETE | `/projects/:id` | Cancels its exports, deletes imported copies. Exported videos stay. → `204` |
| POST | `/projects/:id/duplicate` | → `201 Project` (“<name> copy”) |

## Audio and beats

| Method | Path | Body → Response |
|---|---|---|
| POST | `/projects/:id/audio` | `multipart/form-data`, field `files` (repeatable) → `201 { imported: Beat[], failed: { filename, message, details? }[] }`; `422` with the same shape if none succeeded. |
| GET | `/projects/:id/audio` | → `Beat[]` |
| PATCH | `/projects/:id/beats/:beatId` | `{ name?, crop?: { zoom, x, y }, artworkId?: string \| null }` → `Project`. Changing artwork resets the crop unless one is supplied. |
| POST | `/projects/:id/beats/remove` | `{ beatIds: string[] }` → `Project` |

## Artwork

| Method | Path | Body → Response |
|---|---|---|
| POST | `/projects/:id/artwork` | `multipart/form-data`: `file` (PNG/JPEG/WebP), `beatIds` (JSON array string, ≥1). Assigns the new image to those beats and resets their crop. → `201 Project` |

Removing artwork from a beat is `PATCH …/beats/:beatId { "artworkId": null }`; unreferenced artwork is deleted automatically.

## Media

| Method | Path | Notes |
|---|---|---|
| GET | `/projects/:id/media/audio/:beatId` | Audio for playback (range requests supported; FLAC proxy for AIFF/ALAC). |
| GET | `/projects/:id/media/peaks/:beatId` | `number[]` of 1,800 max-abs peaks (0–1). Cached. |
| GET | `/projects/:id/media/artwork/:artworkId/:variant` | `variant` = `thumb` \| `display` \| `original`. Immutable caching. |

## Exports

| Method | Path | Body → Response |
|---|---|---|
| POST | `/projects/:id/exports` | `{ beatIds, quality }` → `201 ExportJob[]`. Beats already queued/rendering are skipped. `400 missing_artwork` if any beat lacks artwork. |
| GET | `/projects/:id/exports` | → `ExportJob[]` for the project |
| GET | `/exports` | → all `ExportJob[]` (queue order) |
| GET | `/exports/:jobId` | → `ExportJob` |
| POST | `/exports/:jobId/cancel` | Queued → cancelled immediately; running → FFmpeg killed, partial removed. → `ExportJob` |
| POST | `/exports/:jobId/retry` | Failed/cancelled → queued. → `ExportJob` |
| DELETE | `/exports/:jobId` | Remove a finished job from history (file kept). → `204` |
| POST | `/exports/cancel-queued` | → `{ cancelled }` |
| POST | `/exports/clear` | `{ state: 'completed' \| 'failed' \| 'all' }` (failed includes cancelled) → `{ removed }` |
| GET | `/exports/:jobId/file` | The MP4 (`Content-Disposition: attachment`; `?inline=1` to play in the browser). |
| POST | `/exports/:jobId/reveal` | Shows the file selected in Explorer/Finder. → `204` |

## Events

`GET /events` — Server-Sent Events, one JSON object per `data:` line, heartbeat comment every 25 s:

```ts
{ type: 'job'; job: ExportJob }        // created, state change, progress (≤ ~7/s per job)
{ type: 'job-removed'; jobId: string }
{ type: 'project'; projectId: string } // project.json changed
```
