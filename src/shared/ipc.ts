/**
 * Typed contract between the main process and renderer processes.
 *
 * Every invoke handler returns an IpcResult envelope; the preload unwraps it and throws a
 * plain Error with a user-presentable message, so renderers can use ordinary try/catch.
 */
import type { BibleBook, BibleInfo, Verse } from './bible'
import type { LiveState, OutputConfig, OutputStatus } from './live'
import type { MediaAsset, Presentation, Project } from './model/types'

export type IpcResult<T> = { ok: true; value: T } | { ok: false; error: { message: string; code?: string } }

export interface AppInfo {
  name: string
  version: string
  platform: string
  isDev: boolean
  electronVersion: string
}

export interface RecentProject {
  path: string
  name: string
  openedAt: string
  exists: boolean
}

export interface OpenedProject {
  project: Project
  /** Absolute path to the project directory */
  path: string
  /** Problems found and fixed while loading */
  repairs: string[]
  /** Set when the primary file was unreadable and a fallback copy was used */
  recoveredFrom: string | null
}

export interface SaveResult {
  savedAt: string
}

export interface BackupInfo {
  id: string
  createdAt: string
  reason: string
  sizeBytes: number
}

export interface DisplayInfo {
  id: number
  label: string
  bounds: { x: number; y: number; width: number; height: number }
  scaleFactor: number
  primary: boolean
}

export interface ImportMediaResult {
  imported: MediaAsset[]
  skipped: { path: string; reason: string }[]
}

export interface MediaFileInfo {
  name: string
  sizeBytes: number
}

export interface ImportedPresentation {
  presentation: Presentation
  media: MediaAsset[]
  repairs: string[]
}

export interface RemoteConfig {
  enabled: boolean
  port: number
  pin: string
}

export interface RemoteStatus extends RemoteConfig {
  running: boolean
  urls: string[]
  error: string | null
  clients: number
}

/** What a remote client may ask the operator to do. */
export interface RemoteCommand {
  command: string
  args?: Record<string, unknown>
}

/** Snapshot published by the operator for remote clients. */
export interface RemoteSnapshot {
  project: string
  live: {
    presentationId: string | null
    presentationName: string
    slideIndex: number
    slideCount: number
    black: boolean
    logo: boolean
    cleared: boolean
    media: { name: string; playing: boolean } | null
  }
  playlists: { id: string; name: string; entries: { id: string; kind: string; label: string; presentationId: string | null }[] }[]
  presentations: Record<string, { id: string; name: string; slides: { id: string; label: string; text: string; enabled: boolean }[] }>
  timers: { id: string; name: string; display: string; running: boolean }[]
}

/** Channel names, kept in one place to avoid typos across processes. */
export const IPC = {
  appInfo: 'app:info',
  appFlushRequest: 'app:flush-request',
  appFlushDone: 'app:flush-done',
  appLog: 'app:log',
  appOpenLogs: 'app:open-logs',
  projectRecent: 'project:recent',
  projectRemoveRecent: 'project:remove-recent',
  projectCreate: 'project:create',
  projectOpen: 'project:open',
  projectOpenLast: 'project:open-last',
  projectSave: 'project:save',
  projectSaveAs: 'project:save-as',
  projectClose: 'project:close',
  projectReveal: 'project:reveal',
  projectBackup: 'project:backup',
  projectListBackups: 'project:list-backups',
  projectRestoreBackup: 'project:restore-backup',
  presentationExport: 'presentation:export',
  presentationImport: 'presentation:import',
  mediaImport: 'media:import',
  mediaSaveThumbnail: 'media:save-thumbnail',
  mediaSaveGenerated: 'media:save-generated',
  mediaListFiles: 'media:list-files',
  mediaDeleteFiles: 'media:delete-files',
  displaysList: 'displays:list',
  displaysChanged: 'displays:changed',
  windowToggleDevtools: 'window:toggle-devtools',
  livePublish: 'live:publish',
  liveState: 'live:state',
  outputsGetConfig: 'outputs:get-config',
  outputsSetConfig: 'outputs:set-config',
  outputsSetActive: 'outputs:set-active',
  outputsStatus: 'outputs:status',
  outputsIdentify: 'outputs:identify',
  outputHello: 'output:hello',
  outputConfig: 'output:config',
  bibleList: 'bible:list',
  bibleBooks: 'bible:books',
  bibleChapter: 'bible:chapter',
  bibleSearch: 'bible:search',
  bibleImport: 'bible:import',
  remoteGetStatus: 'remote:get-status',
  remoteSetConfig: 'remote:set-config',
  remoteSnapshot: 'remote:snapshot',
  remoteCommand: 'remote:command',
  remoteStatus: 'remote:status'
} as const

export type Unsubscribe = () => void

/** API exposed to the operator window as `window.bhcf`. */
export interface BhcfApi {
  app: {
    info(): Promise<AppInfo>
    /** Main asks the renderer to flush pending saves before the window closes. */
    onFlushRequest(handler: () => Promise<void>): Unsubscribe
    toggleDevtools(): Promise<void>
    log(level: 'info' | 'warn' | 'error', message: string): void
    openLogs(): Promise<void>
  }
  project: {
    recent(): Promise<RecentProject[]>
    removeRecent(path: string): Promise<void>
    /** Creates a project folder named `name` inside `parentDir` (default: the Projects folder). */
    create(name: string, parentDir?: string): Promise<OpenedProject>
    /** Opens `path`, or shows an open dialog when omitted. Resolves null if cancelled. */
    open(path?: string): Promise<OpenedProject | null>
    openLast(): Promise<OpenedProject | null>
    save(project: Project): Promise<SaveResult>
    saveAs(project: Project): Promise<OpenedProject | null>
    close(): Promise<void>
    reveal(): Promise<void>
    backup(project: Project, reason: string): Promise<BackupInfo>
    listBackups(): Promise<BackupInfo[]>
    /** Backs up `current`, then loads the given backup as the project. */
    restoreBackup(backupId: string, current: Project): Promise<OpenedProject>
  }
  presentation: {
    /** Writes a .bhcfpres file (with embedded media). Resolves the path, or null if cancelled. */
    export(presentation: Presentation, media: MediaAsset[]): Promise<string | null>
    /** Reads a .bhcfpres file, copying its media into the project. Null if cancelled. */
    import(): Promise<ImportedPresentation | null>
  }
  media: {
    /** Copies files into the project. Shows a file dialog when `paths` is omitted. */
    import(paths?: string[]): Promise<ImportMediaResult>
    /** Resolves the on-disk path of a dropped File (Electron removed File.path). */
    pathForFile(file: File): string
    /** Saves media created in the app (e.g. a generated motion background) into the project. */
    saveGenerated(name: string, ext: 'webm' | 'png', data: Uint8Array): Promise<MediaAsset>
    /** Stores a JPEG data URL as the asset's poster; returns the thumbnail file name. */
    saveThumbnail(assetId: string, dataUrl: string): Promise<string>
    listFiles(): Promise<MediaFileInfo[]>
    deleteFiles(names: string[]): Promise<{ deleted: number; freedBytes: number }>
  }
  displays: {
    list(): Promise<DisplayInfo[]>
    onChanged(handler: (displays: DisplayInfo[]) => void): Unsubscribe
  }
  live: {
    publish(state: LiveState): void
  }
  outputs: {
    getConfig(): Promise<OutputConfig[]>
    setConfig(outputs: OutputConfig[]): Promise<void>
    /** Opens (true) or closes (false) all enabled output windows. */
    setActive(active: boolean): Promise<void>
    status(): Promise<{ active: boolean; outputs: OutputStatus[] }>
    onStatus(handler: (s: { active: boolean; outputs: OutputStatus[] }) => void): Unsubscribe
    identify(): Promise<void>
  }
  bible: {
    list(): Promise<BibleInfo[]>
    books(bibleId: string): Promise<BibleBook[]>
    chapter(bibleId: string, book: number, chapter: number): Promise<Verse[]>
    search(bibleId: string, query: string, limit?: number): Promise<Verse[]>
    import(): Promise<BibleInfo | null>
  }
  remote: {
    status(): Promise<RemoteStatus>
    setConfig(config: RemoteConfig): Promise<RemoteStatus>
    publish(snapshot: RemoteSnapshot): void
    onCommand(handler: (cmd: RemoteCommand) => void): Unsubscribe
    onStatus(handler: (s: RemoteStatus) => void): Unsubscribe
  }
}

/** API exposed to output windows as `window.bhcfOutput`. */
export interface BhcfOutputApi {
  hello(): Promise<{ config: OutputConfig; live: LiveState | null; platform: string }>
  onLive(handler: (state: LiveState) => void): Unsubscribe
  onConfig(handler: (config: OutputConfig) => void): Unsubscribe
  log(level: 'info' | 'warn' | 'error', message: string): void
}
