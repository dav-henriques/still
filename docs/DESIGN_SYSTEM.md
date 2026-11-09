# Design system

Quiet, precise, desktop-native. Quality comes from type, spacing and restraint — not effects. Tokens live in [`apps/web/src/styles/index.css`](../apps/web/src/styles/index.css) (`@theme`), so they're available as Tailwind utilities (`bg-surface`, `text-fg-2`, …).

## Colour

| Token | Value | Use |
|---|---|---|
| `bg` | `#080808` | App frame, sidebar |
| `bg-2` | `#101010` | Main workspace |
| `surface` | `#171717` | Raised areas |
| `surface-2` | `#202020` | Interactive surfaces (secondary buttons) |
| `surface-3` | `#2a2a2a` | Hover / selected segment |
| `fg` | `#F5F5F5` | Primary text |
| `fg-2` | `#929292` | Secondary text, icons |
| `fg-3` | `#626262` | Muted text, hints, column headers |
| `accent` | `#FF7545` | Primary action, playback progress, selection, “needs artwork” |
| `accent-soft` | 12 % accent | Selected rows, notices |
| `line` / `line-2` | white 8 % / 13 % | Hairlines, input outlines |
| `danger` | `#F0605A` | Errors, destructive actions |
| `ok` | `#7FBF95` | Small “ready / exported” marks only |

Rules: orange is for one primary action per view, progress, focus, and small indicators — never panel backgrounds. Text on orange is near-black (`#140a05`) for contrast. Surfaces are separated by tone and 1 px inset hairlines (`shadow-[inset_0_0_0_1px_var(--color-line)]`), not heavy borders.

## Type

- **Geist Variable** for everything; Geist Mono only for file paths and logs. Bundled locally via `@fontsource` (no network).
- Base 13 px / 18 px. Scale: 11 (`2xs`, labels), 12 (`xs`, meta), 13 (`sm`, body), 14 (`base`, dialog titles), 15 (page titles, semibold, −1.5 % tracking).
- Section labels in panels: 11 px uppercase, +6 % tracking, `fg-3`.
- All times, durations, sizes, percentages and counters use `.tabular` (tabular numerals).
- The wordmark is always lowercase **still** (semibold, tight tracking) with **by ness** in `fg-3` beside it.

## Space, size, radius

- 4 px grid. Page gutters 24 px; panel padding 16–20 px.
- Heights: buttons 28 (`sm`) / 32 (`md`), inputs 32, list rows 48 (beats) / 56 (projects, jobs), headers 56.
- Sidebar 228 px expanded, 56 px rail. Inspector 296 px.
- Radii: 6 px controls, 8 px buttons/inputs, 12 px panels, 16 px dialogs. Pills only for tiny badges.

## Components

All in `apps/web/src/components/ui/` — original, small, built on Radix primitives only where accessibility needs it (Dialog, DropdownMenu, ContextMenu).

| Component | Notes |
|---|---|
| `Button` | `primary` (accent), `secondary` (surface-2 + hairline), `ghost`, `danger`. Optional leading Lucide icon (1.75 stroke). |
| `IconButton` | Always has an accessible `label` (also the tooltip). |
| `Input`, `Field` | Hairline outline; focus = accent outline + 3 px soft ring. |
| `Segmented` | Radio group with arrow-key support. Used for quality, view, sidebar. |
| `Checkbox` | `role=checkbox`, supports indeterminate and shift-click. |
| `Range` | Native range input, styled; fill via `--fill`. |
| `ProgressBar` | 3 px track; accent/muted/danger tones; `role=progressbar`. |
| `Dialog` | Glass surface, title + optional description, footer actions right-aligned. |
| `DropdownMenu` / `ContextMenu` | Share one item model (`MenuItem[]`), so “⋯” and right-click always match. |
| `EmptyState` | Small icon tile, one-line title, ≤2 lines of guidance, one action. No illustrations. |
| `Toaster` | Bottom-right, max 4, errors 9 s / info 4 s. Used sparingly. |

“Glass” (`.glass`) — translucent `#1c1c1c` with blur and a 1 px light edge — is reserved for floating layers: dialogs, menus, toasts, the drop hint.

## Interaction

- Durations: hover 100 ms, menus 160 ms, dialogs 200 ms, sidebar width 200 ms; `cubic-bezier(.2,.8,.2,1)`. All motion collapses under `prefers-reduced-motion`.
- Focus: 2 px accent outline on `:focus-visible` everywhere; list rows use an inset accent ring.
- Selection follows desktop conventions: click opens, Ctrl/⌘-click toggles, Shift-click ranges, Space toggles the focused row.
- Drag and drop: audio over a project shows a full-area accent outline; an image over a row highlights that row; an image elsewhere shows a small hint.
- Autosave everywhere; the project header shows a quiet “Saving / Saved”.
- The preview is the crop editor: grab cursor, the full image ghosts at 25 % outside the square while framing, a thin outline marks the square.
- Errors are specific and actionable (“Use a PNG, JPEG or WebP image.”); technical detail is available behind a disclosure, never a stack trace.

## Don'ts

No gradients on text, purple/blue gradients, neon glows, decorative blobs, hero sections, fake stats or charts, oversized cards, or glass on ordinary panels.
