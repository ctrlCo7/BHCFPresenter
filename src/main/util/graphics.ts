/**
 * Crash records and "safe graphics mode".
 *
 * Video on a projector runs in the graphics (GPU) process. On weak or old graphics drivers that
 * process can crash, and Chromium may then close the whole app without any error of ours. So:
 *  - every crashed process (GPU, a window) is written to the log, and crash dumps are kept locally;
 *  - a GPU crash is remembered, and the next start offers safe graphics mode, which turns off
 *    hardware acceleration (slower with heavy video, but stable on troublesome drivers).
 * The setting lives in its own small file because it must be read before the app is ready.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { app, crashReporter } from 'electron'
import type { GraphicsInfo } from '../../shared/ipc'
import { log } from './log'

interface GraphicsFile {
  safeMode: boolean
  /** ISO time of the last GPU process crash */
  lastGpuCrash: string | null
  /** ISO time the operator answered the safe-mode question (so it is asked once per crash) */
  answeredAt: string | null
}

const file = (): string => path.join(app.getPath('userData'), 'graphics.json')
let crashedThisSession = false

function read(): GraphicsFile {
  try {
    const v = JSON.parse(readFileSync(file(), 'utf8')) as Partial<GraphicsFile>
    return { safeMode: v.safeMode === true, lastGpuCrash: typeof v.lastGpuCrash === 'string' ? v.lastGpuCrash : null, answeredAt: typeof v.answeredAt === 'string' ? v.answeredAt : null }
  } catch {
    return { safeMode: false, lastGpuCrash: null, answeredAt: null }
  }
}

function write(patch: Partial<GraphicsFile>): void {
  try {
    mkdirSync(path.dirname(file()), { recursive: true })
    writeFileSync(file(), JSON.stringify({ ...read(), ...patch }, null, 2))
  } catch (err) {
    log('warn', 'Could not save graphics settings:', err)
  }
}

/** Call before app.whenReady(). */
export function setUpGraphics(): void {
  // Crash dumps stay on this computer (<userData>/Crashpad); nothing is uploaded.
  crashReporter.start({ uploadToServer: false })
  if (read().safeMode) app.disableHardwareAcceleration()

  app.on('child-process-gone', (_e, d) => {
    if (d.reason === 'clean-exit') return
    log('error', `${d.type} process gone: ${d.reason} (exit code ${d.exitCode})${d.name ? ` [${d.name}]` : ''}`)
    // "killed": ended from outside (Task Manager, Windows shutting down), not a driver crash.
    if (d.type === 'GPU' && d.reason !== 'killed') {
      crashedThisSession = true
      write({ lastGpuCrash: new Date().toISOString() })
    }
  })
  app.on('render-process-gone', (_e, wc, d) => {
    if (d.reason === 'clean-exit') return
    log('error', `Window renderer gone (${wc.getURL().replace(/^.*\//, '').slice(0, 80)}): ${d.reason} (exit code ${d.exitCode})`)
  })
}

/** Logged at start: which graphics features work, for diagnosing crashes later. */
export function logGraphicsStatus(): void {
  const s = app.getGPUFeatureStatus()
  log('info', `Graphics: ${read().safeMode ? 'SAFE MODE (hardware acceleration off)' : 'hardware acceleration on'}; video decode ${s.video_decode}, compositing ${s.gpu_compositing}`)
}

export function graphicsInfo(): GraphicsInfo {
  const g = read()
  const unanswered = !!g.lastGpuCrash && (!g.answeredAt || g.answeredAt < g.lastGpuCrash)
  return { safeMode: g.safeMode, lastGpuCrash: g.lastGpuCrash, askSafeMode: unanswered && !g.safeMode, crashedThisSession }
}

/** Turns safe mode on or off; takes effect after a restart (`restart` does it now). */
export function setSafeMode(safeMode: boolean, restart: boolean): void {
  write({ safeMode, answeredAt: new Date().toISOString() })
  log('info', `Safe graphics mode ${safeMode ? 'on' : 'off'}`)
  if (restart) {
    app.relaunch()
    app.quit()
  }
}

/** "Not now": stop asking about this crash. */
export function dismissSafeModeQuestion(): void {
  write({ answeredAt: new Date().toISOString() })
}
