import path from 'node:path'
import { app } from 'electron'
import { defaultOutputs, defaultStageLayout, type OutputConfig } from '../../shared/live'
import type { RemoteConfig } from '../../shared/ipc'
import { readJson, writeFileAtomic } from '../util/fsx'

/** Machine-level settings (not part of any project): they describe this computer's screens. */
export interface AppConfigData {
  recentProjects: { path: string; name: string; openedAt: string }[]
  lastProjectPath: string | null
  window: { x?: number; y?: number; width: number; height: number; maximized: boolean }
  outputs: OutputConfig[]
  remote: RemoteConfig
}

const MAX_RECENT = 12

function randomPin(): string {
  return String(Math.floor(1000 + Math.random() * 9000))
}

function defaults(): AppConfigData {
  return {
    recentProjects: [],
    lastProjectPath: null,
    window: { width: 1600, height: 960, maximized: true },
    outputs: defaultOutputs(),
    remote: { enabled: false, port: 5719, pin: randomPin() }
  }
}

/** Validates output configs coming from disk or the renderer. */
export function sanitizeOutputs(raw: unknown): OutputConfig[] {
  if (!Array.isArray(raw)) return defaultOutputs()
  const seen = new Set<string>()
  const out: OutputConfig[] = []
  for (const o of raw.slice(0, 8)) {
    if (!o || typeof o !== 'object') continue
    const v = o as Partial<OutputConfig>
    const id = typeof v.id === 'string' && /^[\w-]{1,40}$/.test(v.id) ? v.id : `output-${out.length + 1}`
    if (seen.has(id)) continue
    seen.add(id)
    const s = { ...defaultStageLayout(), ...(v.stage && typeof v.stage === 'object' ? v.stage : {}) }
    out.push({
      id,
      name: typeof v.name === 'string' && v.name.trim() ? v.name.trim().slice(0, 60) : 'Output',
      role: v.role === 'stage' ? 'stage' : 'audience',
      enabled: v.enabled !== false,
      displayId: typeof v.displayId === 'number' ? v.displayId : null,
      windowed: v.windowed === true,
      stage: {
        showCurrent: s.showCurrent !== false,
        showNext: s.showNext !== false,
        showClock: s.showClock !== false,
        timerId: typeof s.timerId === 'string' ? s.timerId : null,
        showNotes: s.showNotes !== false,
        showMessage: s.showMessage !== false,
        fontScale: typeof s.fontScale === 'number' && s.fontScale > 0.3 && s.fontScale < 4 ? s.fontScale : 1
      }
    })
  }
  return out
}

export function sanitizeRemote(raw: unknown, fallback: RemoteConfig): RemoteConfig {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Partial<RemoteConfig>
  const port = typeof v.port === 'number' && Number.isInteger(v.port) && v.port >= 1024 && v.port <= 65535 ? v.port : fallback.port
  const pin = typeof v.pin === 'string' && /^\d{4,8}$/.test(v.pin) ? v.pin : fallback.pin
  return { enabled: v.enabled === true, port, pin }
}

export class AppConfig {
  private data: AppConfigData = defaults()
  private readonly file = path.join(app.getPath('userData'), 'config.json')
  private writeChain: Promise<void> = Promise.resolve()

  async load(): Promise<void> {
    const d = defaults()
    try {
      const raw = (await readJson(this.file)) as Partial<AppConfigData>
      this.data = {
        recentProjects: Array.isArray(raw.recentProjects)
          ? raw.recentProjects.filter((r) => r && typeof r.path === 'string' && typeof r.name === 'string')
          : d.recentProjects,
        lastProjectPath: typeof raw.lastProjectPath === 'string' ? raw.lastProjectPath : null,
        window: raw.window && typeof raw.window.width === 'number' ? { ...d.window, ...raw.window } : d.window,
        outputs: raw.outputs ? sanitizeOutputs(raw.outputs) : d.outputs,
        remote: sanitizeRemote(raw.remote, d.remote)
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') console.warn('[config] unreadable, using defaults:', err)
      this.data = d
    }
  }

  get(): Readonly<AppConfigData> {
    return this.data
  }

  update(patch: Partial<AppConfigData>): Promise<void> {
    this.data = { ...this.data, ...patch }
    return this.persist()
  }

  addRecent(projectPath: string, name: string): Promise<void> {
    const rest = this.data.recentProjects.filter((r) => path.resolve(r.path) !== path.resolve(projectPath))
    return this.update({
      recentProjects: [{ path: projectPath, name, openedAt: new Date().toISOString() }, ...rest].slice(0, MAX_RECENT),
      lastProjectPath: projectPath
    })
  }

  removeRecent(projectPath: string): Promise<void> {
    return this.update({
      recentProjects: this.data.recentProjects.filter((r) => path.resolve(r.path) !== path.resolve(projectPath)),
      lastProjectPath: this.data.lastProjectPath === projectPath ? null : this.data.lastProjectPath
    })
  }

  /** Writes are serialised so rapid updates can never interleave on disk. */
  private persist(): Promise<void> {
    const snapshot = JSON.stringify(this.data, null, 2)
    this.writeChain = this.writeChain
      .then(() => writeFileAtomic(this.file, snapshot))
      .catch((err) => console.error('[config] failed to save:', err))
    return this.writeChain
  }
}
