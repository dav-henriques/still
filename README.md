# still — by ness

Turn instrumental beats into YouTube-ready videos. Import a batch of beats, give each one its artwork, frame it, and export every beat as a finished 1920 × 1080 MP4 — all on your own computer.

Every video has the same deliberately quiet composition: a black 1920 × 1080 frame with the artwork as a centered 1080 × 1080 square (420 px of black either side), the complete original audio, and nothing else.

## Requirements

- **Windows 10/11** (primary platform; macOS/Linux work for development)
- **Node.js 20.11+** (developed on Node 24)
- **Google Chrome** (the app opens in a Chrome app window; any Chromium browser works)
- **FFmpeg / FFprobe** — bundled automatically by `npm install` (via `ffmpeg-static` / `ffprobe-static`). A system install or a custom path is used instead when configured — see [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md#ffmpeg).

## Install

```bash
npm install
```

npm 11 asks for approval of install scripts; this repo pre-approves the three it needs (`sharp`, `ffmpeg-static`, `esbuild`) in `package.json → allowScripts`.

## Start

Double-click **`still.cmd`**, or:

```bash
npm start
```

This builds the interface if needed, starts the local engine on `http://localhost:4317`, and opens it in Chrome. Keep the terminal window open while you work; close it (or press Ctrl+C) to stop. Use `npm start -- --no-open` to skip opening the browser.

## Using still

1. **Create a project** (e.g. “YouTube Beats”) and choose its export quality.
2. **Drop audio files** onto the project, or use *Add beats* (Ctrl+O). WAV, MP3, FLAC, M4A, AAC, OGG and AIFF are supported. Originals are stored untouched.
3. **Add artwork**: drop an image onto a beat row, select several beats and choose *Set artwork*, or open a beat and drop an image onto the preview. PNG, JPEG and WebP of any aspect ratio work.
4. **Frame it** in the editor: drag the preview to reposition, scroll (or use the slider) to zoom. The preview is pixel-accurate — it uses the same crop math as the renderer.
5. **Export**: select beats (Ctrl+A for all) → *Export*. Videos render one at a time with real progress; keep working meanwhile. Find them in **Exports** (watch, show in folder, download).

Videos are saved to `<output folder>\<project name>\<beat name>.mp4` and never overwrite an existing file (`Beat (2).mp4` …). The output folder defaults to `data\exports` and can be changed in **Settings → Export** (Windows shows a native folder picker).

### Keyboard

| Where | Keys |
|---|---|
| Project | Ctrl+A select all · Shift+click range · Ctrl+click toggle · Space select row · Enter open · Del remove · Ctrl+O add beats · Esc clear selection |
| Editor | Space play/pause · ←/→ seek 5 s (Shift: 1 s) · Home start · M mute · [ / ] previous/next beat · Ctrl+O choose artwork · Esc back · arrows/+/− nudge/zoom when the preview has focus |

## Using still from another computer at home

Run still on one computer (the one with your beats and enough disk space) with **`still-rede.cmd`** instead of `still.cmd` — or `set STILL_LAN=1` before `npm start`. The terminal then lists a `network` address such as `http://192.168.0.12:4317`; open it in a browser on any computer on the same network.

- **There is no login.** Anyone on your Wi-Fi/network can open, edit and delete projects. Only use it on a network you trust.
- When Windows Firewall asks, allow Node.js on **Private networks**.
- Audio, artwork, rendering and exported videos all live on the host computer. Uploads travel over the network, so large WAV batches import slower than locally.
- *Show in folder*, *Open output folder* and *Browse…* only work on the host computer (they open Explorer there). From other computers use *Download*.
- Only private addresses (`192.168.x.x`, `10.x.x.x`, `172.16–31.x.x`) are accepted; connections from the internet are refused even if a port is forwarded. Open it by IP, not by computer name.

## Where your data lives

Everything is in the `data/` folder next to the app (override with `STILL_DATA_DIR`):

```
data/
  projects/<id>/project.json   project metadata (atomic writes)
  projects/<id>/audio/         original audio, byte-for-byte
  projects/<id>/artwork/       original artwork + display/thumbnail copies
  projects/<id>/cache/         waveform peaks, playback proxies (AIFF/ALAC)
  exports/                     default output folder
  exports.json                 export queue and history
  settings.json                preferences
  temp/                        scratch space, cleared on every start
```

Deleting a project removes its imported copies — never your original files or exported videos.

## Windows notes

- By default the engine binds to `127.0.0.1` only and refuses requests from other hosts or websites (see LAN mode above).
- Windows Defender may scan large WAV imports; the first import of a big batch can take a moment.
- If port 4317 is taken, set `STILL_PORT` (see [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)).
- Paths with spaces and non-ASCII characters (e.g. `Ação`) are supported throughout.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — layers, storage, rendering, data flow
- [docs/API.md](docs/API.md) — local REST + SSE API
- [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) — tokens, type, components, interaction
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) — scripts, env vars, tests, FFmpeg, troubleshooting
- [AGENTS.md](AGENTS.md) — conventions and constraints for coding agents
