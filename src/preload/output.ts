// Preload for output windows (audience / stage). Exposes only what an output needs:
// it can receive live state, never touch the project or the file system.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { BhcfOutputApi, IpcResult, Unsubscribe } from '../shared/ipc'

// Channel names are repeated here (they must match IPC in shared/ipc.ts) and only types are
// imported: a runtime import shared with the main preload would be split into a separate
// chunk, and sandboxed preloads cannot require local files.
const IPC = { outputHello: 'output:hello', liveState: 'live:state', outputConfig: 'output:config', appLog: 'app:log' } as const

function on<T>(channel: string, handler: (payload: T) => void): Unsubscribe {
  const listener = (_e: IpcRendererEvent, payload: T): void => handler(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: BhcfOutputApi = {
  async hello() {
    const result = (await ipcRenderer.invoke(IPC.outputHello)) as IpcResult<Awaited<ReturnType<BhcfOutputApi['hello']>>>
    if (!result.ok) throw new Error(result.error.message)
    return result.value
  },
  onLive: (handler) => on(IPC.liveState, handler),
  onConfig: (handler) => on(IPC.outputConfig, handler),
  log: (level, message) => ipcRenderer.send(IPC.appLog, level, `[output] ${String(message).slice(0, 8000)}`)
}

contextBridge.exposeInMainWorld('bhcfOutput', api)
