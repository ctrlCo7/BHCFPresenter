/**
 * Typed contract between the main process and renderer processes.
 *
 * Every invoke handler returns an IpcResult envelope; the preload unwraps it and throws a
 * plain Error with a user-presentable message, so renderers can use ordinary try/catch.
 */
import type { BibleBook, BibleInfo, Verse } from './bible'
import type { PptDeck } from './pptx'
import type { SongFile } from './songImport'
import type { ReleaseNote, UpdateStatus } from './updates'
import type { LiveState, OutputConfig, OutputStatus } from './live'
import type { MediaAsset, Presentation, Project } from './model/types'

export type IpcResult<T> = { ok: true; value: T } | { ok: false; error: { message: string; code?: string } }

/** A PowerPoint file read by the main process; its pictures are already in the project's media folder. */
export interface PowerPointDeck {
  name: string
  deck: PptDeck
  media: MediaAsset[]
  /** Picture path in the .pptx → media id */
  mediaFor: Record<string, string>
}

/** Safe graphics mode, and whether the graphics process has crashed (see main/util/graphics). */
export interface GraphicsInfo {
  safeMode: boolean
  lastGpuCrash: string | null
  /** A GPU crash happened that the operator has not answered yet */
  askSafeMode: boolean
  crashedThisSession: boolean
}

export interface AppInfo {
  name: string
  version: string
  platform: string
  isDev: boolean
  electronVersion: string
}

/** App colour theme: follow Windows / macOS, or force light or dark. */
export type ThemePreference = 'system' | 'light' | 'dark'

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

/** A video or image in the backgrounds folder on this computer. */
export interface LibraryFile {
  /** Path relative to the folder, with "/" between subfolders ("Worship/Clouds.mp4") */
  name: string
  kind: 'video' | 'image'
  sizeBytes: number
}

export interface LibraryListing {
  /** Folder being shown */
  dir: string
  exists: boolean
  files: LibraryFile[]
  /** Why the folder could not be read (e.g. blocked by macOS privacy settings), null when fine */
  error: string | null
  /** Video files in a format the app cannot play (MKV, AVI…), with a few names to show */
  unsupported: { count: number; examples: string[] }
  /** Backgrounds that come with the app, minus any the folder above already has */
  builtIn: LibraryFile[]
}

/** Free online libraries of worship background videos. */
export type OnlineProvider = 'pexels' | 'pixabay'

/** A video found online (Templates › Online). */
export interface OnlineBackground {
  /** Pass to download(); only searched videos can be downloaded */
  id: string
  provider: OnlineProvider
  title: string
  author: string
  /** The video's page on the provider's website (credit) */
  pageUrl: string
  durationSec: number | null
  width: number | null
  height: number | null
  /** Preview picture as a data URI */
  thumbnail: string | null
}

/** Where a Templates background lives: the backgrounds folder, or the ones that come with the app. */
export type LibrarySource = 'folder' | 'builtin'

export interface LibraryAddResult {
  listing: LibraryListing
  added: number
  skipped: { name: string; reason: string }[]
}

/** Channel names, kept in one place to avoid typos across processes. */
export const IPC = {
  appInfo: 'app:info',
  appGraphicsInfo: 'app:graphics-info',
  appSetSafeGraphics: 'app:set-safe-graphics',
  appDismissSafeGraphics: 'app:dismiss-safe-graphics',
  appFlushRequest: 'app:flush-request',
  appFlushDone: 'app:flush-done',
  appLog: 'app:log',
  appOpenLogs: 'app:open-logs',
  appGetTheme: 'app:get-theme',
  appSetTheme: 'app:set-theme',
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
  presentationImportPowerPoint: 'presentation:import-powerpoint',
  mediaImport: 'media:import',
  mediaSaveThumbnail: 'media:save-thumbnail',
  mediaMoveToBackgrounds: 'media:move-to-backgrounds',
  libraryList: 'library:list',
  libraryChooseDir: 'library:choose-dir',
  libraryOpenDir: 'library:open-dir',
  libraryImport: 'library:import',
  libraryAddFiles: 'library:add-files',
  libraryAddFolder: 'library:add-folder',
  onlineKeys: 'online:keys',
  onlineSetKey: 'online:set-key',
  onlineSearch: 'online:search',
  onlineDownload: 'online:download',
  onlineProgress: 'online:progress',
  onlineOpenPage: 'online:open-page',
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
  songsImport: 'songs:import',
  updatesGet: 'updates:get',
  updatesCheck: 'updates:check',
  updatesInstall: 'updates:install',
  updatesDownload: 'updates:download',
  updatesStatus: 'updates:status',
  updatesReleaseNotes: 'updates:release-notes',
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
    getTheme(): Promise<ThemePreference>
    /** Saves the preference; the window's colours (and prefers-color-scheme) follow it. */
    setTheme(theme: ThemePreference): Promise<void>
    graphics(): Promise<GraphicsInfo>
    /** Safe graphics mode (hardware acceleration off); applies after a restart (`restart`: now). */
    setSafeGraphics(safeMode: boolean, restart: boolean): Promise<void>
    dismissSafeGraphics(): Promise<void>
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
    /** Asks for PowerPoint files (.pptx, or .ppt with PowerPoint installed) and reads them; null if cancelled. */
    importPowerPoint(paths?: string[]): Promise<{ decks: PowerPointDeck[]; errors: string[] } | null>
  }
  media: {
    /** Copies files into the project. Shows a file dialog when `paths` is omitted. */
    import(paths?: string[]): Promise<ImportMediaResult>
    /** Resolves the on-disk path of a dropped File (Electron removed File.path). */
    pathForFile(file: File): string
    /** Moves loose media files into media/P&W Backgrounds; resolves old name → new file name for each moved. */
    moveToBackgrounds(fileNames: string[]): Promise<Record<string, string>>
    /** Stores a JPEG data URL as the asset's poster; returns the thumbnail file name. */
    saveThumbnail(assetId: string, dataUrl: string): Promise<string>
    listFiles(): Promise<MediaFileInfo[]>
    deleteFiles(names: string[]): Promise<{ deleted: number; freedBytes: number }>
  }
  /** The backgrounds folder on this computer (default: Documents\\Backgrounds). */
  online: {
    /** Which providers have a key saved (the keys themselves stay in the main process) */
    keys(): Promise<Record<OnlineProvider, boolean>>
    /** Saves (or with '' removes) a provider's API key */
    setKey(provider: OnlineProvider, key: string): Promise<Record<OnlineProvider, boolean>>
    search(provider: OnlineProvider, query: string, page: number): Promise<{ results: OnlineBackground[]; total: number }>
    /** Downloads a search result into the backgrounds folder; resolves its name there ("Online/….mp4") */
    download(resultId: string): Promise<string>
    onProgress(handler: (p: { id: string; percent: number }) => void): Unsubscribe
    /** Opens the API key sign-up page, or a found video's page (`resultId`) */
    openPage(provider: OnlineProvider, resultId?: string): Promise<void>
  }
  library: {
    list(): Promise<LibraryListing>
    /** Lets the user pick another folder; resolves the new listing, or null if cancelled. */
    chooseDir(): Promise<LibraryListing | null>
    openDir(): Promise<void>
    /** Lets the user pick video/image files and copies them into the folder; null if cancelled. */
    addFiles(): Promise<LibraryAddResult | null>
    /** Lets the user pick a folder and copies the videos/images in it (subfolders too) into the folder; null if cancelled. */
    addFolder(): Promise<LibraryAddResult | null>
    /** Copies a file from the folder (or one that comes with the app) into the open project. */
    import(name: string, source?: LibrarySource): Promise<MediaAsset>
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
  updates: {
    status(): Promise<UpdateStatus>
    /** Checks GitHub now and reports problems (background checks run by themselves). */
    check(): Promise<UpdateStatus>
    /** "Update now": Windows downloads it and restarts into it; macOS opens the download. */
    install(): Promise<void>
    /** macOS: opens the new version's download. */
    download(): Promise<void>
    onStatus(handler: (s: UpdateStatus) => void): Unsubscribe
    /** Release notes after `since` up to this version (null: offline). */
    releaseNotes(since: string | null): Promise<ReleaseNote[] | null>
  }
  songs: {
    /** Asks for song files and reads them; null when cancelled. */
    importFiles(): Promise<{ files: SongFile[]; errors: string[] } | null>
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
