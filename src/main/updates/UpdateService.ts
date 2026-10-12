/**
 * Keeps installed copies up to date from GitHub Releases.
 *
 *  - Windows: electron-updater downloads the new installer in the background and installs it
 *    when the app closes (never in the middle of a service), or right away on request.
 *  - macOS: the app is not signed with an Apple certificate, and macOS only lets signed apps
 *    replace themselves, so it checks the latest release and offers the .dmg to download.
 */
import { app, net, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import { compareVersions, RELEASES_URL, UPDATE_REPO, type UpdateStatus } from '../../shared/updates'
import { log } from '../util/log'

const FIRST_CHECK_MS = 20_000
const CHECK_EVERY_MS = 4 * 60 * 60 * 1000

export class UpdateService {
  private status: UpdateStatus
  private timer: NodeJS.Timeout | null = null

  constructor(private readonly notify: (status: UpdateStatus) => void) {
    if (!app.isPackaged) this.status = { state: 'unsupported', reason: 'Updates work in the installed app, not in development.' }
    else if (process.platform !== 'win32' && process.platform !== 'darwin') this.status = { state: 'unsupported', reason: 'Updates are available for Windows and macOS.' }
    else this.status = { state: 'idle' }
  }

  get current(): UpdateStatus {
    return this.status
  }

  start(): void {
    if (this.status.state === 'unsupported') return
    if (process.platform === 'win32') this.wireWindowsUpdater()
    setTimeout(() => void this.check(false), FIRST_CHECK_MS)
    this.timer = setInterval(() => void this.check(false), CHECK_EVERY_MS)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
  }

  /** `manual`: the user asked, so errors are reported (background checks stay quiet when offline). */
  async check(manual: boolean): Promise<UpdateStatus> {
    const s = this.status.state
    if (s === 'unsupported' || s === 'checking' || s === 'downloading' || s === 'ready') return this.status
    this.set({ state: 'checking' })
    try {
      if (process.platform === 'win32') await autoUpdater.checkForUpdates()
      else await this.checkGitHub()
      // No event came (e.g. updates not configured in this build).
      if ((this.status as UpdateStatus).state === 'checking') this.set({ state: 'none', checkedAt: Date.now() })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      log('warn', `Update check failed: ${firstLine(message)}`)
      this.set(manual ? { state: 'error', message: friendlyError(message) } : { state: 'idle' })
    }
    return this.status
  }

  /** Windows: restart now and install the downloaded update. */
  installNow(): void {
    if (this.status.state !== 'ready') return
    log('info', `Installing update ${this.status.version}`)
    // Silent install, then start the new version.
    setImmediate(() => autoUpdater.quitAndInstall(true, true))
  }

  /** macOS: opens the .dmg (or the release page) in the browser. */
  async openDownload(): Promise<void> {
    const url = this.status.state === 'available' && this.status.downloadUrl ? this.status.downloadUrl : RELEASES_URL
    if (url.startsWith(`https://github.com/${UPDATE_REPO}/`)) await shell.openExternal(url)
  }

  private set(status: UpdateStatus): void {
    this.status = status
    this.notify(status)
  }

  private wireWindowsUpdater(): void {
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    // One line per message: updater errors carry whole HTTP responses.
    const line = (m: unknown): string => `updater: ${firstLine(String(m))}`
    autoUpdater.logger = { info: (m: unknown) => log('info', line(m)), warn: (m: unknown) => log('warn', line(m)), error: () => undefined, debug: () => undefined }
    autoUpdater.on('update-available', (info) => this.set({ state: 'downloading', version: info.version, percent: 0 }))
    autoUpdater.on('update-not-available', () => this.set({ state: 'none', checkedAt: Date.now() }))
    autoUpdater.on('download-progress', (p) => {
      const version = this.status.state === 'downloading' ? this.status.version : ''
      this.set({ state: 'downloading', version, percent: Math.round(p.percent) })
    })
    autoUpdater.on('update-downloaded', (info) => {
      log('info', `Update ${info.version} downloaded; installs on quit`)
      this.set({ state: 'ready', version: info.version })
    })
    autoUpdater.on('error', (err) => {
      // Download errors after a successful check (the check itself rejects and is handled there).
      if (this.status.state === 'downloading') this.set({ state: 'error', message: friendlyError(err.message) })
    })
  }

  private async checkGitHub(): Promise<void> {
    const res = await net.fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'BHCF-Presenter' } })
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`)
    const release = (await res.json()) as { tag_name?: string; html_url?: string; assets?: { name?: string; browser_download_url?: string }[] }
    const version = (release.tag_name ?? '').replace(/^v/i, '')
    if (!version || compareVersions(version, app.getVersion()) <= 0) {
      this.set({ state: 'none', checkedAt: Date.now() })
      return
    }
    const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
    const dmg = release.assets?.find((a) => a.name?.endsWith(`-mac-${arch}.dmg`))
    this.set({ state: 'available', version, downloadUrl: dmg?.browser_download_url ?? release.html_url ?? RELEASES_URL })
  }
}

function firstLine(s: string): string {
  return (s.split('\n')[0] ?? '').slice(0, 300)
}

function friendlyError(message: string): string {
  if (/ENOTFOUND|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ETIMEDOUT|ECONNREFUSED|net::/i.test(message)) return 'No internet connection. Try again when online.'
  if (/latest\.yml|404/i.test(message)) return 'The latest release has no update files yet. Try again in a few minutes.'
  return message.split('\n')[0]?.slice(0, 200) ?? 'Unknown error'
}
