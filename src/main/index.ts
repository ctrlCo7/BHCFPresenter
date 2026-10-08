import path from 'node:path'
import { app, BrowserWindow, Menu, nativeTheme, screen } from 'electron'
import { IPC } from '../shared/ipc'
import { BibleService } from './bible/BibleService'
import { AppConfig } from './config/AppConfig'
import { handleMediaProtocol, registerMediaScheme } from './media/mediaProtocol'
import { listDisplays, registerIpc } from './ipc/registerIpc'
import { OutputManager } from './output/OutputManager'
import { ProjectStore } from './project/ProjectStore'
import { RemoteServer } from './remote/RemoteServer'
import { installCrashLogging, log } from './util/log'
import { createMainWindow, focusWindow, loadRendererPage, titleBarColors, windowBackground } from './windows/mainWindow'

app.setName('BHCF Presenter')
registerMediaScheme()
installCrashLogging()

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  let mainWindow: BrowserWindow | null = null
  const config = new AppConfig()
  const store = new ProjectStore()
  const bibles = new BibleService()
  const getMainWindow = (): BrowserWindow | null => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null)
  const outputs = new OutputManager(config, getMainWindow, loadRendererPage)
  const remote = new RemoteServer(
    (cmd) => getMainWindow()?.webContents.send(IPC.remoteCommand, cmd),
    (status) => getMainWindow()?.webContents.send(IPC.remoteStatus, status)
  )
  const projectsRoot = (): string => path.join(app.getPath('documents'), 'BHCF Presenter', 'Projects')

  app.on('second-instance', () => focusWindow(mainWindow))

  void app.whenReady().then(async () => {
    // The renderer draws its own menu bar; on macOS keep the standard app menu for Quit/Copy/Paste.
    Menu.setApplicationMenu(process.platform === 'darwin' ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }]) : null)

    await config.load()
    // Before the window exists, so it opens in the right colours.
    nativeTheme.themeSource = config.get().theme
    // Windows draws the title-bar buttons; recolour them when the theme (or the OS setting) changes.
    nativeTheme.on('updated', () => {
      const win = getMainWindow()
      if (!win) return
      win.setBackgroundColor(windowBackground())
      if (process.platform !== 'darwin') win.setTitleBarOverlay(titleBarColors())
    })
    handleMediaProtocol(
      () => store.current?.media ?? null,
      () => config.get().backgroundsDir ?? path.join(app.getPath('documents'), 'Backgrounds')
    )
    registerIpc({ store, config, outputs, bibles, remote, getMainWindow, projectsRoot })

    const onDisplaysChanged = (): void => {
      getMainWindow()?.webContents.send(IPC.displaysChanged, listDisplays())
      // Re-place outputs when a projector is plugged in or removed.
      outputs.reconcile()
    }
    screen.on('display-added', onDisplaysChanged)
    screen.on('display-removed', onDisplaysChanged)
    screen.on('display-metrics-changed', onDisplaysChanged)

    const open = (): void => {
      mainWindow = createMainWindow(config)
      mainWindow.on('closed', () => {
        mainWindow = null
        // Outputs belong to the operator window; close them with it.
        outputs.closeAll()
      })
    }
    open()

    if (config.get().remote.enabled) void remote.apply(config.get().remote)
    log('info', `BHCF Presenter ${app.getVersion()} started (Electron ${process.versions.electron})`)

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) open()
    })
  })

  app.on('window-all-closed', () => {
    void remote.stop()
    if (process.platform !== 'darwin') app.quit()
  })
}
