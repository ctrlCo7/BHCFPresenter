# BHCF Presenter — Architecture

## 1. Technology choice: Electron + React + TypeScript (electron-vite)

| Need | Why Electron wins here |
| --- | --- |
| Video playback (MP4/H.264, MOV, WebM, MP3, WAV) | Ships its own Chromium with hardware-accelerated decoders, so the same codecs work on every OS. Tauri uses the system web view, where codec support differs per platform. |
| Multiple displays | `screen` API with display add/remove events; every output is its own fullscreen `BrowserWindow`. |
| GPU rendering and transitions | Chromium's compositor runs `transform` / `opacity` / `clip-path` animations on the GPU. |
| Strong typing end to end | TypeScript across main, preload and renderer, with one shared model package. |
| Remote control | Node in the main process hosts the HTTP/SSE remote server without extra runtimes or dependencies. |

Runtime dependencies are limited to `react`, `react-dom`, `zustand`, `immer` and `lucide-react`.

## 2. Process model

```
┌──────────────────────────── main process (Node) ────────────────────────────┐
│ ProjectStore         atomic saves, .bak, backups, recovery, Save As          │
│ PresentationTransfer .bhcfpres export/import (media embedded)                │
│ MediaImporter        copy-in import, poster thumbnails, unused-file cleanup  │
│ mediaProtocol        bhcf-media:// with HTTP range + CORS                     │
│ OutputManager        one window per output/display, LiveState relay          │
│ BibleService         bundled KJV + imported translations, search             │
│ RemoteServer         LAN remote: HTTP + Server-Sent Events, PIN              │
│ AppConfig            recent projects, window, outputs, remote (per machine)  │
│ log                  daily log files in <userData>/logs (14 days)            │
└───────▲───────────────────────────────▲──────────────────────────▲──────────┘
        │ window.bhcf (preload/index)   │ LiveState                │ window.bhcfOutput
┌───────┴────────── operator window ─┐  │             ┌────────────┴─────────────┐
│ store/   project (undo/redo,       │  └────────────►│ output windows           │
│          coalescing), ui, overlays │                │ (preload/output, sandbox)│
│ live/    liveStore, liveActions,   │                │ ProgramRenderer  or      │
│          livePublisher,            │                │ StageView                │
│          remoteBridge              │                └──────────────────────────┘
│ engine/  projectOps, elementOps,   │
│          tree, search (tested)     │
│ render/  SlideRenderer, LayerStack,│
│          ProgramRenderer,          │
│          MediaLayer, StageView     │
│ features/ library, presentation,   │
│   editor, live, monitor, media,    │
│   bible, songs, overlays, settings │
└────────────────────────────────────┘
```

**Security:** all windows use `sandbox: true` and `contextIsolation: true`, with no Node in renderers and a strict CSP. Output windows get a separate, minimal preload: they can only receive live state. Privileged IPC is accepted only from the operator window. The remote server validates a PIN (constant-time comparison), whitelists commands, and caps request bodies.

## 3. Live engine

- **Operator state** (`live/liveStore.ts`) holds:
  - the current slide (cursor), the last slide, and the background held after Clear;
  - black / logo, the media cue, active overlays, and timer runtimes;
  - the stage message, the transition override, master volume, and output status.
- **Actions** (`live/liveActions.ts`):
  - take, next/previous (crossing playlist items, including media cues), Clear, Clear All, Black, Logo;
  - media transport, overlays, timers.
- **Publisher** (`live/livePublisher.ts`):
  - Builds a self-contained `LiveState` from the operator state and the project: resolved slide, background, transition, assets, timers and audio target.
  - Batches with a microtask, not `requestAnimationFrame`, so outputs keep updating while the operator window is minimised.
  - Sends the state to the main process, which forwards it to every output and keeps the latest copy for windows that open later.
- **Program rendering** (`render/ProgramRenderer.tsx`) draws the layers in this order: background → slide → media cue → overlays → logo → black.
  - Each layer is a `LayerStack` that animates entries and exits with the Web Animations API, using only transform, opacity and clip-path.
  - Transitions: cut, fade (through black), dissolve, slide, push, zoom, wipe.
  - The background is its own layer. Consecutive slides with the same background keep the same video playing instead of restarting it.
- **Media sync:** a cue is a timeline (`anchorAt`, `anchorPos`, playing, loop). Every window computes the position from the shared clock and corrects drift above 0.3 s, so no frames are streamed between windows. Only one window plays sound: the audience output if one is open, otherwise the operator's Program monitor.
- **Timers** are pure data (`running`, `startedAt`, `accumulatedMs`). Text boxes can show `{clock}` and `{timer:Name}` tokens, which update live on every screen.

## 4. Data model and project format

```
Sunday Services/
  project.bhcf          JSON document (schema 2)
  project.bhcf.bak      previous save
  media/                imported media (+ .thumbs/ video posters)
  backups/              <ISO time>_<reason>.json snapshots (newest 40 kept)
```

The document (`src/shared/model/types.ts`) contains:

- **Presentations:**
  - slides, each with elements (text, image, video, shape), a background, a transition, notes, a label, a colour and an enabled flag;
  - groups (song sections);
  - an optional `song` (lyric source: sections + arrangement).
- **Folders and trees:** for both the Library and Playlists.
- **Playlists:** entries are presentation references, media cues or headers.
- **Media:** asset metadata plus an optional poster thumbnail.
- **Overlays:** each one is a transparent slide, edited with the slide editor.
- **Timers:** countdown, count-up, clock, or count down to a time of day.
- **Settings:** canvas size, default background / transition / text style, logo, and lyric lines per slide.

Machine-specific settings (outputs and their screens, stage layouts, remote port/PIN) live in `<userData>/config.json`, not in the project.

**Migration:** `normalizeProject` validates every field and fills defaults, so a schema-1 file becomes schema 2 on load. It also repairs dangling references and refuses files from newer schema versions.

**Crash safety:**
- autosave about 0.6 s after each change, capped at 4 s during continuous editing;
- atomic temp-file + fsync + rename writes;
- `.bak` and backup fallback when opening;
- backups on open, every 10 minutes, on demand, and before a restore;
- a flush handshake before the window closes;
- panel-level error boundaries;
- an operator renderer that is reloaded if it crashes;
- logs of renderer and main-process errors.

## 5. Bible and songs

- **Bible:**
  - The KJV (public domain) ships in `resources/bibles/kjv.json`. Further translations can be imported (Settings → Bible panel ⇪) in the same JSON format: `{ "format": "bhcf-bible", "id", "name", "abbreviation", "books": [{ "name", "abbrev", "chapters": [["verse 1", …], …] }] }`.
  - Reference parsing understands abbreviations and ordinals ("jn 3:16-18", "1 Cor 13", "First John 4:8").
  - Scripture slides use superscript verse numbers and a reference line, with 1–4 verses per slide.
- **Songs:** lyrics are plain text with headings ("[Verse 1]", "Chorus:", "Bridge"). The arrangement can repeat sections. Slides are generated at N lines per slide and keep the song's text style when regenerated.

## 6. Commands and shortcuts

Every action is a named command (`services/commands.ts`) with default keys. Menus, the shortcut dispatcher, Settings → Shortcuts and the remote all use the same command IDs. Bindings can be customised and are stored per machine. In Edit mode, arrow keys nudge elements instead of advancing slides.

## 7. Phase status

| Phase | Status |
| --- | --- |
| 1 Shell and navigation | ✅ |
| 2 Playlists and presentations | ✅ |
| 3 Slide editor | ✅ Canvas with move / resize (Shift = keep aspect) / rotate (Shift = 15°), snapping guides (Alt disables), marquee multi-select, in-place text editing, layers (restack, hide, lock), inspector (position, size, rotation, opacity, shadow, full text styling, shapes, gradients, image/video fit), align and distribute, copy/paste/duplicate, undo/redo with gesture coalescing, slide / presentation / project backgrounds and transitions |
| 4 Live mode | ✅ Click to go live, Program monitor (exact output render), dedicated Live workspace, next/previous across playlist items, Clear / Black / Logo / Clear All, customisable shortcuts |
| 5 Media playback | ✅ Video/audio/image cues from the media bin or playlists, play / pause / stop / seek / loop / volume / mute / progress, poster thumbnails, video backgrounds and video elements |
| 6 Multiple outputs | ✅ Any number of outputs (audience or stage) on chosen screens, automatic placement, windowed mode for single-screen setups, Identify screens, reconnects when screens change |
| 7 Lyrics and Bible | ✅ Song editor with sections and arrangement; Bible lookup, search, multi-verse slides, add to library or playlist, go live |
| 8 Stage display | ✅ Current and next text, clock, selected timer, notes, operator messages, adjustable text size |
| 9 Transitions, overlays, timers | ✅ 7 transitions with duration/direction (per slide, presentation, project, or live override); overlay templates (lower third, social, banner, logo bug, countdown); timers shown on screen, on stage, or in any text |
| 10 Polish | ✅ Presentation import/export, unused-media cleanup, file logging, error boundaries, LAN remote control, white/green theme |

### Known limitations / next steps

- Installers are not set up yet; adding electron-builder is the next step for distribution.
- Font choice is a curated list plus free text, not a system font picker.
- Element resize ignores rotation (it resizes in the element's unrotated frame).
- MOV playback depends on the file's codec; H.264 works, but ProRes is not supported by Chromium.
- The remote is a web page served on the LAN over HTTP and protected only by a PIN, so enable it only on trusted networks.
