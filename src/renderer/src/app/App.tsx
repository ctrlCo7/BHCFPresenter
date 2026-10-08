import { useEffect, useState, type ReactElement } from 'react'
import type { AppInfo } from '@shared/ipc'
import { ContextMenuHost } from '../components/ui/ContextMenuHost'
import { DialogHost } from '../components/ui/DialogHost'
import { ToastHost } from '../components/ui/ToastHost'
import { EditWorkspace } from '../features/editor/EditWorkspace'
import { LiveWorkspace } from '../features/live/LiveWorkspace'
import { ensureVideoThumbnails, importMedia } from '../features/media/mediaActions'
import { organizePwBackgrounds } from '../features/media/pwBackgrounds'
import { StatusBar } from '../features/shell/StatusBar'
import { TitleBar } from '../features/shell/TitleBar'
import { Toolbar } from '../features/shell/Toolbar'
import { ProfileTabs } from '../features/profiles/ProfileTabs'
import { loadTheme } from '../services/theme'
import { WelcomeScreen } from '../features/shell/WelcomeScreen'
import { Workspace } from '../features/shell/Workspace'
import { live } from '../live/liveStore'
import { startLivePublisher } from '../live/livePublisher'
import { startRemoteBridge } from '../live/remoteBridge'
import { startAutosave } from '../services/autosave'
import { installShortcutDispatcher, runCommand } from '../services/commands'
import { openLastProject } from '../services/projectActions'
import { useDialogStore, useMenuStore } from '../store/overlayStore'
import { useProjectStore } from '../store/projectStore'
import { useUiStore } from '../store/uiStore'
import { registerAppCommands } from './appCommands'
import { ErrorBoundary } from './ErrorBoundary'
import './shell.css'

registerAppCommands()

export function App(): ReactElement {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [booted, setBooted] = useState(false)
  const hasProject = useProjectStore((s) => s.project !== null)
  const projectId = useProjectStore((s) => s.project?.id ?? null)
  const mode = useUiStore((s) => s.mode)

  useEffect(() => {
    const stopAutosave = startAutosave()
    const stopLive = startLivePublisher()
    const stopRemote = startRemoteBridge()
    // Shortcuts are suspended while a dialog or menu is open.
    const stopShortcuts = installShortcutDispatcher(() => useDialogStore.getState().stack.length > 0 || useMenuStore.getState().menu !== null)
    void window.bhcf.app.info().then((i) => {
      setInfo(i)
      // Development-only inspection hook for debugging and automated smoke tests.
      if (i.isDev) Object.assign(window, { __bhcfDebug: { project: useProjectStore, ui: useUiStore, live, runCommand, importMedia } })
    })
    void loadTheme()
    void openLastProject().finally(() => setBooted(true))
    const onError = (e: ErrorEvent): void => window.bhcf.app.log('error', `${e.message} @ ${e.filename}:${e.lineno}`)
    const onRejection = (e: PromiseRejectionEvent): void => window.bhcf.app.log('error', `Unhandled rejection: ${String(e.reason)}`)
    // Block the browser's default file-drop navigation anywhere outside a drop zone.
    const prevent = (e: DragEvent): void => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault()
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    window.addEventListener('dragover', prevent)
    window.addEventListener('drop', prevent)
    return () => {
      stopAutosave()
      stopLive()
      stopRemote()
      stopShortcuts()
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
      window.removeEventListener('dragover', prevent)
      window.removeEventListener('drop', prevent)
    }
  }, [])

  // A newly opened project starts with nothing on screen, gets missing video posters and files
  // older Templates backgrounds into P&W Backgrounds.
  useEffect(() => {
    live.set({ cursor: null, last: null, heldBackground: null, media: null, mediaContext: null, overlays: [], logo: false, black: false, timers: {} })
    if (projectId) {
      ensureVideoThumbnails()
      void organizePwBackgrounds()
    }
  }, [projectId])

  return (
    <div className="app">
      <TitleBar platform={info?.platform ?? 'win32'} isDev={info?.isDev ?? false} />
      {booted && hasProject && <Toolbar />}
      {booted && hasProject && <ProfileTabs />}
      <main className="app-main">
        {!booted ? null : !hasProject ? (
          <WelcomeScreen />
        ) : (
          <ErrorBoundary key={mode}>{mode === 'edit' ? <EditWorkspace /> : mode === 'live' ? <LiveWorkspace /> : <Workspace />}</ErrorBoundary>
        )}
      </main>
      <StatusBar />
      <DialogHost />
      <ContextMenuHost />
      <ToastHost />
    </div>
  )
}
