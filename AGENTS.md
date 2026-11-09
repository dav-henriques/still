# AGENTS.md

Guidance for coding agents working on **still — by ness**: a local-first tool that turns beats + artwork into 1920×1080 YouTube videos with native FFmpeg.

## Layout

```
packages/shared   types, zod schemas, constants, crop model, job states, filename utils (TS source, no build)
apps/server       Express 5 engine run with tsx — api/, projects/, exports/, media/, services/, storage/, middleware/
apps/web          React 19 + Vite + Tailwind v4 — app/, components/{shell,ui}, features/{projects,audio,artwork,editor,exports,settings}, lib/, stores/
docs/             ARCHITECTURE, API, DESIGN_SYSTEM, DEVELOPMENT
```

Read `docs/ARCHITECTURE.md` before changing storage, rendering or the queue.

## Non-negotiables

- Output is exactly 1920×1080, 30 fps, H.264 yuv420p + AAC, MP4 with faststart; artwork 1080×1080 at x=420, y=0 on pure black. No overlays, text, logos, visualizers, transitions. Change `VIDEO` only if the product changes.
- **One crop model.** `computeCropRect` in `packages/shared/src/crop.ts` decides which pixels are exported; the preview must derive from it (`cropToBoxStyle`). Never add a second transform. The workflow test decodes frames to prove they match — keep it passing.
- Never modify imported audio; never apply processing (normalise, fades, EQ…). Export audio is complete (`-t` = source duration).
- A job is `completed` only after FFmpeg exits 0 **and** FFprobe verification passes. Partial files never get final names.
- No fake progress: progress comes from FFmpeg `-progress` output only.
- Local only: bind `127.0.0.1` by default (LAN mode `STILL_LAN=1` is opt-in, private IPs only), keep `localOnly` middleware, no telemetry or network calls.

## Conventions

- Strict TypeScript; shared types come from `@still/shared` — don't redefine them.
- Validate every request body with zod (`api/validate.ts → parse`). Throw `HttpError(status, code, message, details?)` for user-facing errors; media failures throw `MediaError`.
- Child processes: `spawn` with argument arrays, `shell: false`. Never interpolate user input into a command or script.
- Filesystem: build paths with `safeJoin`; write JSON with `writeJsonAtomic`; mutate projects only through `ProjectStore.update` (locked, validated, emits an event, GCs artwork).
- Imports in server/shared use explicit `.ts` extensions.
- UI: TanStack Query for server state (write returned `Project`s with `setProject`), Zustand for UI-only state. Use the components in `components/ui` and tokens from `styles/index.css`; follow `docs/DESIGN_SYSTEM.md` (orange sparingly, tabular numerals for numbers, Lucide icons at 1.75 stroke).
- Every icon-only control needs an accessible label; use real `<button>`s.
- Keep comments to the *why*. Mark deliberate shortcuts as `shortcut: <limit>, <when to upgrade>`.

## Before you finish

```bash
npm run check   # typecheck + lint + tests + build
```

Update `docs/API.md` when routes change and `docs/ARCHITECTURE.md` when the pipeline changes. Don't document features that don't exist.

## Out of scope

Cloud sync, accounts, YouTube upload, AI images, templates/animations, analytics. The product is intentionally focused.
