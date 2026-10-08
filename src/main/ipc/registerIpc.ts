import { promises as fs } from 'node:fs'
import path from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, nativeTheme, screen, shell, type IpcMainInvokeEvent } from 'electron'
import { IPC, type AppInfo, type DisplayInfo, type IpcResult, type LibraryFile, type LibraryListing, type RecentProject, type RemoteSnapshot, type ThemePreference } from '../../shared/ipc'
import type { LiveState } from '../../shared/live'
import { MEDIA_EXTENSIONS, mediaTypeFor, PW_BACKGROUNDS_DIR } from '../../shared/media'
import type { MediaAsset, Presentation } from '../../shared/model/types'
import type { BibleService } from '../bible/BibleService'
import { sanitizeOutputs, sanitizeRemote, type AppConfig } from '../config/AppConfig'
import { deleteMediaFiles, importMediaFiles, listMediaFiles, moveToBackgroundsFolder, saveThumbnail } from '../media/MediaImporter'
import type { OutputManager } from '../output/OutputManager'
import { exportPresentation, importPresentation } from '../project/PresentationTransfer'
import { PROJECT_FILE, type ProjectStore } from '../project/ProjectStore'
import type { RemoteServer } from '../remote/RemoteServer'
import { AppError, exists, sanitizeFileName } from '../util/fsx'
import { log, logsDir } from '../util/log'
import { isDev } from '../windows/mainWindow'

interface Deps {
  store: ProjectStore
  config: AppConfig
  outputs: OutputManager
  bibles: BibleService
  remote: RemoteServer
  getMainWindow: () => BrowserWindow | null
  projectsRoot: () => string
}

export function listDisplays(): DisplayInfo[] {
  const primaryId = screen.getPrimaryDisplay().id
  return screen.getAllDisplays().map((d, i) => ({
    id: d.id,
    label: d.label || `Display ${i + 1}`,
    bounds: d.bounds,
    scaleFactor: d.scaleFactor,
    primary: d.id === primaryId
  }))
}

function wrap<T>(channel: string, fn: () => Promise<T> | T): Promise<IpcResult<T>> {
  return Promise.resolve()
    .then(fn)
    .then((value) => ({ ok: true as const, value }))
    .catch((err: unknown) => {
      const e = err as Error & { code?: string }
      if (!(err instanceof AppError)) log('error', `[ipc] ${channel} failed:`, err)
      return { ok: false as const, error: { message: e.message || 'Unexpected error', code: e.code } }
    })
}

export function registerIpc({ store, config, outputs, bibles, remote, getMainWindow, projectsRoot }: Deps): void {
  /** Operator-only handler: only the app's own main window may call privileged APIs. */
  const h = <A extends unknown[], T>(channel: string, fn: (event: IpcMainInvokeEvent, ...args: A) => Promise<T> | T): void => {
    ipcMain.handle(channel, (event, ...args): Promise<IpcResult<T>> => {
      const main = getMainWindow()
      if (!main || event.sender !== main.webContents) {
        return Promise.resolve({ ok: false, error: { code: 'FORBIDDEN', message: 'Unauthorized caller' } })
      }
      return wrap(channel, () => fn(event, ...(args as A)))
    })
  }
  const parentWin = (): BrowserWindow | undefined => getMainWindow() ?? undefined
  const openDialog = (o: Electron.OpenDialogOptions): Promise<Electron.OpenDialogReturnValue> => {
    const w = parentWin()
    return w ? dialog.showOpenDialog(w, o) : dialog.showOpenDialog(o)
  }
  const saveDialog = (o: Electron.SaveDialogOptions): Promise<Electron.SaveDialogReturnValue> => {
    const w = parentWin()
    return w ? dialog.showSaveDialog(w, o) : dialog.showSaveDialog(o)
  }

  const remember = async <T extends { path: string; project: { name: string } }>(opened: T): Promise<T> => {
    await config.addRecent(opened.path, opened.project.name)
    return opened
  }

  /* ------------------------------ App ------------------------------ */

  h(IPC.appInfo, (): AppInfo => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
    isDev,
    electronVersion: process.versions.electron
  }))
  h(IPC.windowToggleDevtools, () => {
    if (isDev) getMainWindow()?.webContents.toggleDevTools()
  })
  h(IPC.appGetTheme, (): ThemePreference => config.get().theme)
  h(IPC.appSetTheme, async (_e, theme: unknown) => {
    if (theme !== 'system' && theme !== 'light' && theme !== 'dark') throw new Error('Unknown theme.')
    nativeTheme.themeSource = theme
    await config.update({ theme })
  })
  h(IPC.appOpenLogs, async () => {
    await shell.openPath(logsDir())
  })
  // Logs come from the operator and output windows alike.
  ipcMain.on(IPC.appLog, (_e, level: unknown, message: unknown) => {
    const lvl = level === 'error' || level === 'warn' ? level : 'info'
    log(lvl, `[renderer] ${String(message).slice(0, 8000)}`)
  })

  /* ---------------------------- Projects ---------------------------- */

  h(IPC.projectRecent, async (): Promise<RecentProject[]> =>
    Promise.all(config.get().recentProjects.map(async (r) => ({ ...r, exists: await exists(path.join(r.path, PROJECT_FILE)) })))
  )
  h(IPC.projectRemoveRecent, (_e, projectPath: string) => config.removeRecent(String(projectPath)))

  h(IPC.projectCreate, async (_e, name: unknown, parentDir?: unknown) => {
    if (typeof name !== 'string' || !name.trim()) throw new AppError('INVALID_NAME', 'Please enter a project name.')
    if (parentDir !== undefined && (typeof parentDir !== 'string' || !path.isAbsolute(parentDir))) {
      throw new AppError('INVALID_PATH', 'The project location must be an absolute folder path.')
    }
    return remember(await store.create(parentDir || projectsRoot(), name))
  })

  h(IPC.projectOpen, async (_e, projectPath?: unknown) => {
    let target = typeof projectPath === 'string' ? projectPath : null
    if (!target) {
      const res = await openDialog({
        title: 'Open Project',
        defaultPath: projectsRoot(),
        properties: ['openFile'],
        filters: [{ name: 'BHCF Presenter Project', extensions: ['bhcf'] }]
      })
      if (res.canceled || !res.filePaths[0]) return null
      target = res.filePaths[0]
    }
    return remember(await store.open(target))
  })

  h(IPC.projectOpenLast, async () => {
    const last = config.get().lastProjectPath
    if (!last || !(await exists(path.join(last, PROJECT_FILE)))) return null
    return remember(await store.open(last))
  })

  h(IPC.projectSave, (_e, project: unknown) => store.save(project))

  h(IPC.projectSaveAs, async (_e, project: unknown) => {
    const current = store.requireOpen()
    const res = await saveDialog({
      title: 'Save Project As — choose a name for the new project folder',
      defaultPath: path.join(path.dirname(current.dir), `${path.basename(current.dir)} copy`),
      buttonLabel: 'Save Copy',
      properties: ['createDirectory', 'showOverwriteConfirmation']
    })
    if (res.canceled || !res.filePath) return null
    return remember(await store.saveAs(project, res.filePath))
  })

  h(IPC.projectClose, async () => {
    store.close()
    await config.update({ lastProjectPath: null })
  })
  h(IPC.projectReveal, () => shell.showItemInFolder(store.requireOpen().file))
  h(IPC.projectBackup, (_e, project: unknown, reason: unknown) => store.backup(project, typeof reason === 'string' ? reason : 'manual'))
  h(IPC.projectListBackups, () => store.listBackups())
  h(IPC.projectRestoreBackup, (_e, backupId: unknown, current: unknown) => {
    if (typeof backupId !== 'string') throw new AppError('INVALID_BACKUP', 'Invalid backup id.')
    return store.restoreBackup(backupId, current)
  })

  /* -------------------------- Presentations -------------------------- */

  h(IPC.presentationExport, async (_e, presentation: unknown, media: unknown) => {
    const p = store.requireOpen()
    const pres = presentation as Presentation
    if (!pres || typeof pres !== 'object' || !Array.isArray(pres.slides)) throw new AppError('INVALID', 'Invalid presentation.')
    const res = await saveDialog({
      title: 'Export Presentation',
      defaultPath: path.join(app.getPath('documents'), `${sanitizeFileName(String(pres.name), 'presentation')}.bhcfpres`),
      filters: [{ name: 'BHCF Presentation', extensions: ['bhcfpres'] }]
    })
    if (res.canceled || !res.filePath) return null
    await exportPresentation(res.filePath, pres, Array.isArray(media) ? (media as MediaAsset[]) : [], p.media)
    return res.filePath
  })

  h(IPC.presentationImport, async () => {
    const p = store.requireOpen()
    const res = await openDialog({
      title: 'Import Presentation',
      properties: ['openFile'],
      filters: [{ name: 'BHCF Presentation', extensions: ['bhcfpres'] }]
    })
    if (res.canceled || !res.filePaths[0]) return null
    return importPresentation(res.filePaths[0], p.media)
  })

  /* ------------------------------ Media ------------------------------ */

  h(IPC.mediaImport, async (_e, paths?: unknown) => {
    const p = store.requireOpen()
    let sources = Array.isArray(paths) ? paths.filter((x): x is string => typeof x === 'string') : null
    if (!sources) {
      const res = await openDialog({
        title: 'Import Media',
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: 'Media', extensions: MEDIA_EXTENSIONS },
          { name: 'All Files', extensions: ['*'] }
        ]
      })
      if (res.canceled) return { imported: [], skipped: [] }
      sources = res.filePaths
    }
    return importMediaFiles(p.media, sources)
  })
  /* --------------- Backgrounds folder (Templates → My Backgrounds) --------------- */

  const libraryDir = (): string => config.get().backgroundsDir ?? path.join(app.getPath('documents'), 'Backgrounds')
  const listLibrary = async (): Promise<LibraryListing> => {
    const dir = libraryDir()
    let names: string[]
    try {
      names = await fs.readdir(dir)
    } catch {
      return { dir, exists: false, files: [] }
    }
    const files: LibraryFile[] = []
    for (const name of names) {
      const type = mediaTypeFor(name)
      if (!type || type.kind === 'audio') continue
      const stat = await fs.stat(path.join(dir, name)).catch(() => null)
      if (stat?.isFile()) files.push({ name, kind: type.kind, sizeBytes: stat.size })
    }
    files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    return { dir, exists: true, files }
  }
  h(IPC.libraryList, () => listLibrary())
  h(IPC.libraryChooseDir, async () => {
    const res = await openDialog({ title: 'Choose your backgrounds folder', defaultPath: libraryDir(), properties: ['openDirectory'] })
    if (res.canceled || !res.filePaths[0]) return null
    await config.update({ backgroundsDir: res.filePaths[0] })
    return listLibrary()
  })
  h(IPC.libraryOpenDir, async () => {
    await fs.mkdir(libraryDir(), { recursive: true })
    await shell.openPath(libraryDir())
  })
  h(IPC.libraryImport, async (_e, name: unknown) => {
    // Only a bare file name inside the backgrounds folder is accepted.
    if (typeof name !== 'string' || /[\\/]/.test(name) || name === '..' || name === '.') throw new AppError('INVALID', 'Invalid file name.')
    const res = await importMediaFiles(store.requireOpen().media, [path.join(libraryDir(), name)], PW_BACKGROUNDS_DIR)
    const asset = res.imported[0]
    if (!asset) throw new AppError('IMPORT_FAILED', res.skipped[0]?.reason ?? 'The file could not be copied.')
    return asset
  })

  h(IPC.mediaMoveToBackgrounds, (_e, names: unknown) =>
    moveToBackgroundsFolder(store.requireOpen().media, Array.isArray(names) ? names.filter((n): n is string => typeof n === 'string') : [])
  )
  h(IPC.mediaSaveThumbnail, (_e, assetId: unknown, dataUrl: unknown) => saveThumbnail(store.requireOpen().media, String(assetId), String(dataUrl)))
  h(IPC.mediaListFiles, () => listMediaFiles(store.requireOpen().media))
  h(IPC.mediaDeleteFiles, (_e, names: unknown) =>
    deleteMediaFiles(store.requireOpen().media, Array.isArray(names) ? names.filter((n): n is string => typeof n === 'string') : [])
  )

  /* ------------------------ Displays & outputs ------------------------ */

  h(IPC.displaysList, () => listDisplays())
  h(IPC.outputsGetConfig, () => config.get().outputs)
  h(IPC.outputsSetConfig, (_e, list: unknown) => outputs.setConfigs(sanitizeOutputs(list)))
  h(IPC.outputsSetActive, (_e, active: unknown) => outputs.setActive(active === true))
  h(IPC.outputsStatus, () => outputs.status())
  h(IPC.outputsIdentify, () => outputs.identify())

  ipcMain.on(IPC.livePublish, (event, state: LiveState) => {
    const main = getMainWindow()
    if (main && event.sender === main.webContents && state && typeof state === 'object') outputs.setLive(state)
  })

  // Output windows may only introduce themselves.
  ipcMain.handle(IPC.outputHello, (event) =>
    wrap(IPC.outputHello, () => {
      const id = outputs.outputIdFor(event.sender)
      const cfg = id ? outputs.configFor(id) : null
      if (!cfg) throw new AppError('FORBIDDEN', 'Unknown output window')
      return { config: cfg, live: outputs.latestLive(), platform: process.platform }
    })
  )

  /* ------------------------------ Bible ------------------------------ */

  h(IPC.bibleList, () => bibles.list())
  h(IPC.bibleBooks, (_e, id: unknown) => bibles.books(String(id)))
  h(IPC.bibleChapter, (_e, id: unknown, book: unknown, chapter: unknown) => bibles.chapter(String(id), Number(book), Number(chapter)))
  h(IPC.bibleSearch, (_e, id: unknown, query: unknown, limit: unknown) =>
    bibles.search(String(id), String(query).slice(0, 200), typeof limit === 'number' ? Math.min(1000, limit) : 200)
  )
  h(IPC.bibleImport, async () => {
    const res = await openDialog({
      title: 'Import Bible Translation',
      properties: ['openFile'],
      filters: [
        { name: 'Bible files (Zefania XML, JSON)', extensions: ['xml', 'json'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    if (res.canceled || !res.filePaths[0]) return null
    return bibles.importFile(res.filePaths[0])
  })

  /* ------------------------------ Remote ------------------------------ */

  h(IPC.remoteGetStatus, () => remote.status())
  h(IPC.remoteSetConfig, async (_e, cfg: unknown) => {
    const next = sanitizeRemote(cfg, config.get().remote)
    await config.update({ remote: next })
    return remote.apply(next)
  })
  ipcMain.on(IPC.remoteSnapshot, (event, snapshot: RemoteSnapshot) => {
    const main = getMainWindow()
    if (main && event.sender === main.webContents && snapshot && typeof snapshot === 'object') remote.publish(snapshot)
  })
}
