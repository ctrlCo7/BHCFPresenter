# BHCF Presenter

Desktop presentation and live media software for churches, conferences and events. It handles lyrics, scripture, slides, media, overlays, timers, multiple screens, a stage display and a phone remote.

## Getting started

```bash
npm install
npm run dev        # run with hot reload
npm test           # unit tests
npm run typecheck
npm run build      # production build into out/
npm run preview    # run the production build
```

The npm scripts launch Electron through `scripts/electron-vite.mjs`, which clears `ELECTRON_RUN_AS_NODE` (VS Code terminals set it, and it makes Electron start as plain Node).

## Using it

| Mode | What it's for |
| --- | --- |
| **Show** (Ctrl+1) | Build playlists and the library, prepare slides, and use the Media / Bible / Overlays / Timers tabs. Clicking a slide sends it live. |
| **Edit** (Ctrl+2, or **E** on a slide) | The slide and overlay editor. |
| **Live** (Ctrl+3, Esc to leave) | The operator view: a large Program monitor, live buttons, transitions, stage messages, overlays and timers. |

- **Outputs:** press **F** (or use "Outputs off/on" in the title bar) to open the outputs. Settings → Outputs assigns each output to a screen. With one screen, choose "Window" to see the output in a window.
- **Stage display:** set an output to "Stage display" and configure it in Settings → Stage Display.
- **Remote:** in Settings → Remote, enable it, then open the address shown on a phone on the same Wi-Fi and enter the PIN.

## Songs, backgrounds and Bibles

- **New song** (Library → ♪ or Ctrl+Shift+L): paste the whole song. Headings (`Verse 1`, `V1`, `(Chorus)`, `Chorus x2`, `Repeat Chorus`…), chord lines and CCLI/copyright lines are handled automatically, and the slides update as you paste or edit. Lines per slide defaults to **Auto**.
- **Background videos:**
  1. Import videos in the **Media** tab, or create free loops with **Templates** (Ctrl+T).
  2. Hover a video and click **Background**: it loops behind everything.
  3. Song slides are transparent by default, so lyrics appear over the video.
- **Lyric themes:** the palette button on a presentation, or Templates → Lyric Themes, restyles every slide (Classic, Bold Caps, Lower Third, Boxed, Outline, Elegant Serif, Modern Left, Warm Gold).
- **Bibles:**
  - Included (public domain): KJV, BSB, NHEB, ASV, YLT, BBE, Tagalog Ang Biblia 1905, Cebuano 1917.
  - NIV, ESV and NLT are copyrighted and can't be bundled. If you have a licensed copy as a Zefania XML or JSON file, import it with the ⇪ button in the Bible tab.

## Live shortcuts (customisable in Settings → Shortcuts)

| Action | Keys |
| --- | --- |
| Next / previous slide | Space, → / ← |
| Black screen | B |
| Clear slide (keep background) | C |
| Clear all | Shift+C |
| Logo | L |
| Outputs on/off | F |
| Play/pause media, stop media | P, Shift+P |
| Exit Live mode | Esc |
| Edit selected slide | E |
| New song | Ctrl+Shift+L |
| Settings | Ctrl+, |
| All shortcuts | Ctrl+/ |

## Project layout

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the process model, live engine, data format, crash safety and phase status.
