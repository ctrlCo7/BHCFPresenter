import path from 'node:path'
import { app, BrowserWindow, nativeTheme, screen, shell } from 'electron'
import { IPC } from '../../shared/ipc'
import type { AppConfig } from '../config/AppConfig'

export const isDev = !app.isPackaged
const FLUSH_TIMEOUT_MS = 4000

/** Loads a renderer page from the Vite dev server in development, or from disk when built. */
export function loadRendererPage(win: BrowserWindow, page: string, query: Record<string, string> = {}): Promise<void> {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  const qs = new URLSearchParams(query).toString()
  if (isDev && devUrl) return win.loadURL(`${devUrl}/${page}${qs ? `?${qs}` : ''}`)
  return win.loadFile(path.join(__dirname, '../renderer', page), { query })
}

/** App icon (window, taskbar, Alt+Tab). Lives in resources/ in development and next to the app when packaged. */
export function appIconPath(): string {
  return app.isPackaged ? path.join(process.resourcesPath, 'icon.png') : path.join(app.getAppPath(), 'resources', 'icon.png')
}

/** Title bar colours, matched by the renderer's .titlebar style (--brand) in each theme. */
export function titleBarColors(): { color: string; symbolColor: string; height: number } {
  return { color: nativeTheme.shouldUseDarkColors ? '#0f2a1a' : '#166534', symbolColor: '#ffffff', height: 38 }
}

/** Window background shown before the page paints, matched by --bg-0. */
export function windowBackground(): string {
  return nativeTheme.shouldUseDarkColors ? '#0d1410' : '#f3f6f4'
}

function isTrustedUrl(url: string): boolean {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  return url.startsWith('file://') || (isDev && !!devUrl && url.startsWith(devUrl))
}

/** Keeps the restored window on a display that still exists (e.g. after unplugging a monitor). */
function visibleBounds(saved: { x?: number; y?: number; width: number; height: number }): Electron.Rectangle | { width: number; height: number } {
  if (saved.x === undefined || saved.y === undefined) return { width: saved.width, height: saved.height }
  const rect = { x: saved.x, y: saved.y, width: saved.width, height: saved.height }
  const onScreen = screen.getAllDisplays().some((d) => {
    const a = d.workArea
    return rect.x < a.x + a.width - 100 && rect.x + rect.width > a.x + 100 && rect.y >= a.y - 20 && rect.y < a.y + a.height - 100
  })
  return onScreen ? rect : { width: saved.width, height: saved.height }
}

export function createMainWindow(config: AppConfig): BrowserWindow {
  const saved = config.get().window
  const isMac = process.platform === 'darwin'

  const win = new BrowserWindow({
    ...visibleBounds(saved),
    minWidth: 1100,
    minHeight: 680,
    show: false,
    backgroundColor: windowBackground(),
    title: 'BHCF Presenter',
    icon: appIconPath(),
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    ...(isMac ? {} : { titleBarOverlay: titleBarColors() }),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
      // Live control (timers, media cue end, remote commands) must not slow down when minimised.
      backgroundThrottling: false
    }
  })

  win.once('ready-to-show', () => {
    if (saved.maximized) win.maximize()
    win.show()
  })

  // Lock navigation down: the app never navigates away, external links open in the browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedUrl(url)) event.preventDefault()
  })

  if (isDev) {
    win.webContents.on('before-input-event', (_event, input) => {
      if (input.type === 'keyDown' && (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i'))) {
        win.webContents.toggleDevTools()
      }
    })
  }

  const rememberBounds = (): void => {
    if (win.isDestroyed() || win.isMinimized()) return
    const maximized = win.isMaximized()
    const b = maximized ? config.get().window : win.getBounds()
    void config.update({ window: { x: b.x, y: b.y, width: b.width, height: b.height, maximized } })
  }

  // Before closing, ask the renderer to flush any pending autosave. If it doesn't answer
  // in time (hung renderer), close anyway — the last autosave and backups are on disk.
  let allowClose = false
  let flushRequest = 0
  win.on('close', (event) => {
    rememberBounds()
    if (allowClose || win.webContents.isCrashed()) return
    event.preventDefault()
    const requestId = ++flushRequest
    const finish = (): void => {
      if (allowClose) return
      allowClose = true
      win.webContents.ipc.removeListener(IPC.appFlushDone, onDone)
      win.close()
    }
    const onDone = (_e: Electron.IpcMainEvent, id: number): void => {
      if (id === requestId) finish()
    }
    win.webContents.ipc.on(IPC.appFlushDone, onDone)
    win.webContents.send(IPC.appFlushRequest, requestId)
    setTimeout(finish, FLUSH_TIMEOUT_MS)
  })

  win.webContents.on('render-process-gone', (_e, details) => {
    console.error('[main] renderer process gone:', details.reason)
    if (details.reason !== 'clean-exit' && !win.isDestroyed()) {
      // Reload; the project reopens from its last autosave.
      void loadRendererPage(win, 'index.html')
    }
  })

  void loadRendererPage(win, 'index.html')
  return win
}

export function focusWindow(win: BrowserWindow | null): void {
  if (!win || win.isDestroyed()) return
  if (win.isMinimized()) win.restore()
  win.focus()
}

export function appVersion(): string {
  return app.getVersion()
}
