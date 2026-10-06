/**
 * Output windows: one frameless fullscreen window per enabled output (audience, stage…),
 * placed on its configured display. The operator publishes LiveState; this class keeps the
 * latest copy (so late-opening windows start in sync) and forwards it to every output.
 */
import path from 'node:path'
import { BrowserWindow, screen, type Display, type WebContents } from 'electron'
import { IPC } from '../../shared/ipc'
import type { LiveState, OutputConfig, OutputStatus } from '../../shared/live'
import type { AppConfig } from '../config/AppConfig'
import { log } from '../util/log'
import { appIconPath } from '../windows/mainWindow'

interface OpenOutput {
  win: BrowserWindow
  displayId: number | null
}

export class OutputManager {
  private open = new Map<string, OpenOutput>()
  private active = false
  private live: LiveState | null = null

  constructor(
    private readonly config: AppConfig,
    private readonly getMainWindow: () => BrowserWindow | null,
    private readonly loadPage: (win: BrowserWindow, page: string, query: Record<string, string>) => Promise<void>
  ) {}

  /** Returns the output id if `wc` belongs to one of our output windows. */
  outputIdFor(wc: WebContents): string | null {
    for (const [id, o] of this.open) if (!o.win.isDestroyed() && o.win.webContents === wc) return id
    return null
  }

  configFor(id: string): OutputConfig | null {
    return this.config.get().outputs.find((o) => o.id === id) ?? null
  }

  latestLive(): LiveState | null {
    return this.live
  }

  setLive(state: LiveState): void {
    this.live = state
    for (const o of this.open.values()) if (!o.win.isDestroyed()) o.win.webContents.send(IPC.liveState, state)
  }

  isActive(): boolean {
    return this.active
  }

  setActive(active: boolean): void {
    this.active = active
    this.reconcile()
  }

  async setConfigs(outputs: OutputConfig[]): Promise<void> {
    await this.config.update({ outputs })
    for (const [id, o] of this.open) {
      const cfg = this.configFor(id)
      if (cfg && !o.win.isDestroyed()) o.win.webContents.send(IPC.outputConfig, cfg)
    }
    this.reconcile()
  }

  status(): { active: boolean; outputs: OutputStatus[] } {
    const displays = screen.getAllDisplays()
    return {
      active: this.active,
      outputs: this.config.get().outputs.map((cfg) => {
        const o = this.open.get(cfg.id)
        const d = o?.displayId != null ? displays.find((x) => x.id === o.displayId) : undefined
        return {
          id: cfg.id,
          name: cfg.name,
          role: cfg.role,
          open: !!o && !o.win.isDestroyed(),
          displayLabel: o ? (d ? d.label || `Display ${displays.indexOf(d) + 1}` : 'Window') : null
        }
      })
    }
  }

  /** Opens, closes or moves windows so reality matches config + active flag. */
  reconcile(): void {
    const configs = this.config.get().outputs
    const used = new Set<number>()
    for (const [id, o] of [...this.open]) {
      const cfg = configs.find((c) => c.id === id)
      if (!cfg || !cfg.enabled || !this.active) this.close(id)
      else if (o.displayId !== null) used.add(o.displayId)
    }
    for (const cfg of configs) {
      if (!this.active || !cfg.enabled) continue
      const target = this.resolveDisplay(cfg, used)
      const existing = this.open.get(cfg.id)
      const targetId = target?.id ?? null
      if (existing && !existing.win.isDestroyed()) {
        if (existing.displayId === targetId) continue
        this.close(cfg.id)
      }
      if (targetId !== null) used.add(targetId)
      this.openWindow(cfg, target)
    }
    this.broadcastStatus()
  }

  private resolveDisplay(cfg: OutputConfig, used: Set<number>): Display | null {
    if (cfg.windowed) return null
    const displays = screen.getAllDisplays()
    if (cfg.displayId !== null) {
      const d = displays.find((x) => x.id === cfg.displayId)
      if (d) return d
    }
    // Automatic: first secondary display not already used by another output.
    const primary = screen.getPrimaryDisplay().id
    return displays.find((d) => d.id !== primary && !used.has(d.id)) ?? null
  }

  private openWindow(cfg: OutputConfig, display: Display | null): void {
    const fullscreen = display !== null
    const primary = screen.getPrimaryDisplay().workArea
    const bounds = display
      ? display.bounds
      : { x: primary.x + Math.round(primary.width * 0.55), y: primary.y + 60, width: 800, height: 450 }
    const win = new BrowserWindow({
      ...bounds,
      show: false,
      frame: !fullscreen,
      fullscreen,
      autoHideMenuBar: true,
      skipTaskbar: fullscreen,
      backgroundColor: '#000000',
      title: `${cfg.name} — BHCF Presenter`,
      icon: appIconPath(),
      webPreferences: {
        preload: path.join(__dirname, '../preload/output.js'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        // Outputs must keep animating and playing while unfocused.
        backgroundThrottling: false
      }
    })
    win.setMenu(null)
    if (!fullscreen) win.setAspectRatio(16 / 9)
    win.once('ready-to-show', () => {
      // Never steal focus from the operator window.
      win.showInactive()
      if (fullscreen) win.setFullScreen(true)
    })
    win.on('closed', () => {
      const o = this.open.get(cfg.id)
      if (o?.win === win) this.open.delete(cfg.id)
      this.broadcastStatus()
    })
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    win.webContents.on('will-navigate', (e) => e.preventDefault())
    win.webContents.on('render-process-gone', (_e, details) => {
      log('error', `Output "${cfg.name}" renderer gone: ${details.reason}`)
      if (!win.isDestroyed() && details.reason !== 'clean-exit') void this.loadPage(win, 'output.html', { output: cfg.id })
    })
    this.open.set(cfg.id, { win, displayId: display?.id ?? null })
    void this.loadPage(win, 'output.html', { output: cfg.id })
  }

  private close(id: string): void {
    const o = this.open.get(id)
    this.open.delete(id)
    if (o && !o.win.isDestroyed()) o.win.destroy()
  }

  closeAll(): void {
    for (const id of [...this.open.keys()]) this.close(id)
  }

  broadcastStatus(): void {
    const main = this.getMainWindow()
    if (main && !main.isDestroyed()) main.webContents.send(IPC.outputsStatus, this.status())
  }

  /** Shows each display's number and name for a few seconds. */
  identify(): void {
    screen.getAllDisplays().forEach((d, i) => {
      const w = 420
      const h = 240
      const win = new BrowserWindow({
        x: d.bounds.x + Math.round((d.bounds.width - w) / 2),
        y: d.bounds.y + Math.round((d.bounds.height - h) / 2),
        width: w,
        height: h,
        frame: false,
        resizable: false,
        focusable: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        backgroundColor: '#15803d',
        webPreferences: { sandbox: true, contextIsolation: true, javascript: false }
      })
      const label = (d.label || `Display ${i + 1}`).replace(/[<>&"]/g, '')
      const html = `<body style="margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#15803d;color:#fff;font-family:Segoe UI,sans-serif"><div style="font-size:120px;font-weight:700;line-height:1">${i + 1}</div><div style="font-size:20px;margin-top:8px">${label}</div><div style="font-size:14px;opacity:.8">${d.bounds.width}×${d.bounds.height}${d.id === screen.getPrimaryDisplay().id ? ' · primary' : ''}</div></body>`
      void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
      win.showInactive()
      setTimeout(() => {
        if (!win.isDestroyed()) win.destroy()
      }, 2500)
    })
  }
}
