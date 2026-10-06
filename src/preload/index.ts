import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import { IPC, type BhcfApi, type IpcResult, type Unsubscribe } from '../shared/ipc'

async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const result = (await ipcRenderer.invoke(channel, ...args)) as IpcResult<T>
  if (result.ok) return result.value
  const err = new Error(result.error.message) as Error & { code?: string }
  if (result.error.code) err.code = result.error.code
  throw err
}

function on<T>(channel: string, handler: (payload: T) => void): Unsubscribe {
  const listener = (_e: IpcRendererEvent, payload: T): void => handler(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: BhcfApi = {
  app: {
    info: () => call(IPC.appInfo),
    onFlushRequest(handler) {
      return on<number>(IPC.appFlushRequest, (requestId) => {
        void handler()
          .catch((err: unknown) => console.error('Flush before close failed', err))
          .finally(() => ipcRenderer.send(IPC.appFlushDone, requestId))
      })
    },
    toggleDevtools: () => call(IPC.windowToggleDevtools),
    log: (level, message) => ipcRenderer.send(IPC.appLog, level, String(message).slice(0, 8000)),
    openLogs: () => call(IPC.appOpenLogs)
  },
  project: {
    recent: () => call(IPC.projectRecent),
    removeRecent: (path) => call(IPC.projectRemoveRecent, path),
    create: (name, parentDir) => call(IPC.projectCreate, name, parentDir),
    open: (path) => call(IPC.projectOpen, path),
    openLast: () => call(IPC.projectOpenLast),
    save: (project) => call(IPC.projectSave, project),
    saveAs: (project) => call(IPC.projectSaveAs, project),
    close: () => call(IPC.projectClose),
    reveal: () => call(IPC.projectReveal),
    backup: (project, reason) => call(IPC.projectBackup, project, reason),
    listBackups: () => call(IPC.projectListBackups),
    restoreBackup: (backupId, current) => call(IPC.projectRestoreBackup, backupId, current)
  },
  presentation: {
    export: (presentation, media) => call(IPC.presentationExport, presentation, media),
    import: () => call(IPC.presentationImport)
  },
  media: {
    import: (paths) => call(IPC.mediaImport, paths),
    pathForFile: (file) => webUtils.getPathForFile(file),
    saveGenerated: (name, ext, data) => call(IPC.mediaSaveGenerated, name, ext, data),
    saveThumbnail: (assetId, dataUrl) => call(IPC.mediaSaveThumbnail, assetId, dataUrl),
    listFiles: () => call(IPC.mediaListFiles),
    deleteFiles: (names) => call(IPC.mediaDeleteFiles, names)
  },
  displays: {
    list: () => call(IPC.displaysList),
    onChanged: (handler) => on(IPC.displaysChanged, handler)
  },
  live: {
    publish: (state) => ipcRenderer.send(IPC.livePublish, state)
  },
  outputs: {
    getConfig: () => call(IPC.outputsGetConfig),
    setConfig: (outputs) => call(IPC.outputsSetConfig, outputs),
    setActive: (active) => call(IPC.outputsSetActive, active),
    status: () => call(IPC.outputsStatus),
    onStatus: (handler) => on(IPC.outputsStatus, handler),
    identify: () => call(IPC.outputsIdentify)
  },
  bible: {
    list: () => call(IPC.bibleList),
    books: (id) => call(IPC.bibleBooks, id),
    chapter: (id, book, chapter) => call(IPC.bibleChapter, id, book, chapter),
    search: (id, query, limit) => call(IPC.bibleSearch, id, query, limit),
    import: () => call(IPC.bibleImport)
  },
  remote: {
    status: () => call(IPC.remoteGetStatus),
    setConfig: (config) => call(IPC.remoteSetConfig, config),
    publish: (snapshot) => ipcRenderer.send(IPC.remoteSnapshot, snapshot),
    onCommand: (handler) => on(IPC.remoteCommand, handler),
    onStatus: (handler) => on(IPC.remoteStatus, handler)
  }
}

contextBridge.exposeInMainWorld('bhcf', api)
