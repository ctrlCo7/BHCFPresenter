/**
 * Keeps installed copies up to date from GitHub Releases.
 *
 * It only asks: when a newer release exists, the operator sees what changed and chooses
 * "Update now" or "Later". Nothing is downloaded or installed without that click.
 *  - Windows: "Update now" downloads the installer, then restarts into the new version.
 *  - macOS: the app is not signed with an Apple certificate, and macOS only lets signed apps
 *    replace themselves, so "Update now" opens the new .dmg to download.
 */
import { app, net, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import { compareVersions, notesSince, notesText, RELEASES_URL, UPDATE_REPO, type ReleaseNote, type UpdateStatus } from '../../shared/updates'
import { log } from '../util/log'

const FIRST_CHECK_MS = 20_000
const CHECK_EVERY_MS = 4 * 60 * 60 * 1000

export class UpdateService {
  private status: UpdateStatus
  private timer: NodeJS.Timeout | null = null
  /** The operator chose "Update now": install as soon as the download finishes. */
  private installWhenReady = false

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
    const wasAvailable = this.status.state === 'available' ? this.status : null
    this.set({ state: 'checking' })
    try {
      if (process.platform === 'win32') await autoUpdater.checkForUpdates()
      else await this.checkGitHub()
      // No event came (e.g. updates not configured in this build).
      if ((this.status as UpdateStatus).state === 'checking') this.set({ state: 'none', checkedAt: Date.now() })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      log('warn', `Update check failed: ${firstLine(message)}`)
      // A background check that fails (offline) keeps an update it already found.
      this.set(manual ? { state: 'error', message: friendlyError(message) } : (wasAvailable ?? { state: 'idle' }))
    }
    return this.status
  }

  /** "Update now". Windows: download (if needed), then restart into the new version. macOS: open the download. */
  async update(): Promise<void> {
    if (process.platform !== 'win32') return this.openDownload()
    if (this.status.state === 'ready') return this.restartAndInstall()
    if (this.status.state !== 'available') return
    this.installWhenReady = true
    this.set({ state: 'downloading', version: this.status.version, percent: 0 })
    try {
      await autoUpdater.downloadUpdate()
    } catch (err) {
      this.installWhenReady = false
      this.set({ state: 'error', message: friendlyError(err instanceof Error ? err.message : String(err)) })
    }
  }

  private restartAndInstall(): void {
    if (this.status.state !== 'ready') return
    log('info', `Installing update ${this.status.version}`)
    // Silent install, then start the new version. Closing the window saves the project first.
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
    // Ask first: nothing downloads or installs until the operator clicks "Update now".
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false
    // One line per message: updater errors carry whole HTTP responses.
    const line = (m: unknown): string => `updater: ${firstLine(String(m))}`
    autoUpdater.logger = { info: (m: unknown) => log('info', line(m)), warn: (m: unknown) => log('warn', line(m)), error: () => undefined, debug: () => undefined }
    autoUpdater.on('update-available', (info) => this.set({ state: 'available', version: info.version, notes: notesText(info.releaseNotes) }))
    autoUpdater.on('update-not-available', () => this.set({ state: 'none', checkedAt: Date.now() }))
    autoUpdater.on('download-progress', (p) => {
      const version = this.status.state === 'downloading' ? this.status.version : ''
      this.set({ state: 'downloading', version, percent: Math.round(p.percent) })
    })
    autoUpdater.on('update-downloaded', (info) => {
      log('info', `Update ${info.version} downloaded`)
      this.set({ state: 'ready', version: info.version })
      if (this.installWhenReady) this.restartAndInstall()
    })
    autoUpdater.on('error', (err) => {
      // Download errors after a successful check (the check itself rejects and is handled there).
      if (this.status.state === 'downloading') this.set({ state: 'error', message: friendlyError(err.message) })
    })
  }

  /**
   * Notes of the releases after `since` up to this version, newest first (only this version when
   * `since` is null). Null when GitHub cannot be reached, so the app can try again next time.
   */
  async releaseNotesSince(since: string | null): Promise<ReleaseNote[] | null> {
    try {
      const res = await net.fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases?per_page=30`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'BHCF-Presenter' } })
      if (!res.ok) throw new Error(`GitHub answered ${res.status}`)
      const releases = (await res.json()) as { tag_name?: string; body?: string; draft?: boolean }[]
      const current = app.getVersion()
      const notes = notesSince(releases, current, since)
      log('info', `What's new: ${notes.map((n) => n.version).join(', ') || 'no notes'} (last used ${since ?? 'none'})`)
      return notes
    } catch (err) {
      log('warn', `Could not load release notes: ${firstLine(err instanceof Error ? err.message : String(err))}`)
      return null
    }
  }

  private async checkGitHub(): Promise<void> {
    const res = await net.fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'BHCF-Presenter' } })
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`)
    const release = (await res.json()) as { tag_name?: string; html_url?: string; body?: string; assets?: { name?: string; browser_download_url?: string }[] }
    const version = (release.tag_name ?? '').replace(/^v/i, '')
    if (!version || compareVersions(version, app.getVersion()) <= 0) {
      this.set({ state: 'none', checkedAt: Date.now() })
      return
    }
    const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
    const dmg = release.assets?.find((a) => a.name?.endsWith(`-mac-${arch}.dmg`))
    this.set({ state: 'available', version, notes: notesText(release.body), downloadUrl: dmg?.browser_download_url ?? release.html_url ?? RELEASES_URL })
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
