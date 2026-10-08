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
npm run dist:win   # Windows installer: dist/BHCF-Presenter-Setup-<version>.exe
npm run dist:mac   # macOS installers (run on a Mac): dist/BHCF-Presenter-<version>-mac-<x64|arm64>.dmg
```

To release a new version, raise `version` in package.json, commit, then push a tag (`git tag v1.0.1 && git push origin v1.0.1`). The **Build installers** GitHub Action builds the Windows and Mac installers and attaches them to a GitHub Release. The installers aren't code-signed: on Windows, SmartScreen asks users to click **More info → Run anyway**; on a Mac, users right-click the app → **Open** (or run `xattr -cr "/Applications/BHCF Presenter.app"` if macOS says it is damaged).

The npm scripts launch Electron through `scripts/electron-vite.mjs`, which clears `ELECTRON_RUN_AS_NODE` (VS Code terminals set it, and it makes Electron start as plain Node).

## Using it

| Mode | What it's for |
| --- | --- |
| **Show** (Ctrl+1) | Pick a profile tab (church event), build its library pages and playlists (service orders), prepare slides, use the Media / Bible panel along the bottom and the Preview / Overlays / Timers tabs under the Program monitor. Clicking a slide sends it live. |
| **Edit** (Ctrl+2, or **E** on a slide) | The slide and overlay editor. |
| **Live** (Ctrl+3, Esc to leave) | The operator view: a large Program monitor, live buttons, transitions, stage messages, overlays and timers. |

- **Toolbar:** the icon bar under the menus holds Search, Song, Theme, the Show / Edit / Live modes, Bible, Media, Overlays, Timers, Outputs, Dark/Light and Settings.
- **Dark mode:** the moon/sun button in the toolbar (Ctrl+Shift+D), or Settings → Appearance (Light, Dark or match Windows).
- **Outputs:** press **F** (or click **Outputs** in the toolbar) to open the outputs. Settings → Outputs assigns each output to a screen. With one screen, choose "Window" to see the output in a window.
- **Stage display:** set an output to "Stage display" and configure it in Settings → Stage Display.
- **Remote:** in Settings → Remote, enable it, then open the address shown on a phone on the same Wi-Fi and enter the PIN.

## Songs, backgrounds and Bibles

- **New song** (Library → ♪ or Ctrl+Shift+L): paste the whole song. Headings (`Verse 1`, `V1`, `(Chorus)`, `Chorus x2`, `Repeat Chorus`…), chord lines and CCLI/copyright lines are handled automatically, and the slides update as you paste or edit. Lines per slide defaults to **Auto**.
- **Background videos:**
  1. Import videos in the **Media** tab, or create free loops with **Templates** (Ctrl+T).
  2. Hover a video and click **Background**: it loops behind everything.
  3. Song slides are transparent by default, so lyrics appear over the video.
- **Lyric themes:** the palette button on a presentation, or Templates → Lyric Themes, restyles every slide. 22 themes, from Classic and Bold Caps to Soft Minimal, Poster Stack, Editorial Italic, Handwritten, Cinematic, Frosted Glass, Neon Glow and Sunset Glow. Most keep the background transparent for a video; Midnight, Forest Dawn and Paper & Ink bring their own.
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

### Song sections (Show and Live mode)

These jump to a section of the open song and send it live; pressing again goes to the next one (Verse 1 → Verse 2 → …).

| Section | Keys |
| --- | --- |
| Next verse | Ctrl+V |
| Verse 1–9 | Alt+1 … Alt+9 |
| Chorus | Ctrl+C |
| Pre-chorus / Post-chorus | Ctrl+P / Ctrl+Shift+C |
| Bridge | Ctrl+B |
| Refrain / Tag | Ctrl+R / Ctrl+G |
| Intro / Outro / Ending | Ctrl+Shift+I / Ctrl+Shift+O / Ctrl+E |
| Interlude / Vamp | Ctrl+L / Ctrl+Shift+V |

## Project layout

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the process model, live engine, data format, crash safety and phase status.
