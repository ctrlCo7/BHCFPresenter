/**
 * Templates → My Backgrounds: the videos and images in a folder on this computer
 * (default Documents\Backgrounds), subfolders included. Add Videos… copies picked files into the
 * folder. Previews stream straight from the folder; using one copies it into the project (once) so
 * the project stays self-contained, then plays it.
 */
import { AlertTriangle, Clapperboard, FilePlus2, FolderOpen, FolderPlus, FolderSearch, Loader2, Play, RefreshCw, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState, type ReactElement } from 'react'
import type { LibraryFile, LibraryListing } from '@shared/ipc'
import { libraryUrl } from '@shared/media'
import type { Id } from '@shared/model/types'
import { playBackground, playMedia } from '../../live/liveActions'
import { errorMessage, toast } from '../../store/overlayStore'
import { useProjectStore } from '../../store/projectStore'
import { addNewMedia, captureVideoFrame, formatBytes } from '../media/mediaActions'

/** "Worship/Clouds.mp4" → "Clouds.mp4". */
const baseName = (name: string): string => name.slice(name.lastIndexOf('/') + 1)

const busyKey = (file: LibraryFile, builtIn: boolean): string => `${builtIn ? 'builtin' : 'folder'}:${file.name}`

/** "Worship/Clouds.mp4" → "Worship"; null at the top of the folder. */
export const subfolderOf = (name: string): string | null => (name.includes('/') ? name.slice(0, name.lastIndexOf('/')) : null)

/** "7077358-uhd_4096_2160_30fps.mp4" → { title: "7077358", quality: "4K" }. */
export function describeLibraryFile(file: LibraryFile): { title: string; quality: string | null } {
  const base = baseName(file.name).replace(/\.[^.]+$/, '')
  const m = /[-_ ]?(uhd|hd|sd)?[_ ]?(\d{3,4})[_x](\d{3,4})(?:[_ ](\d{2,3})fps)?$/i.exec(base)
  const height = m ? Number(m[3]) : null
  const quality = height ? (height >= 2000 ? '4K' : height >= 1000 ? 'HD 1080p' : `${height}p`) : null
  const title = (m ? base.slice(0, m.index) : base).replace(/[-_]+/g, ' ').trim() || base
  return { title, quality }
}

/**
 * Still frames for the video cards, captured one at a time as cards scroll into view and kept
 * for the session. A card only loads its video while hovered: every loaded video holds a
 * hardware decoder, and a dozen 4K ones at once made the whole app stutter.
 */
const posters = new Map<string, string>()
let posterQueue: Promise<unknown> = Promise.resolve()

function usePoster(file: LibraryFile, builtIn: boolean, visible: boolean): string | null {
  const key = `${builtIn ? 'builtin' : 'folder'}:${file.name}|${file.sizeBytes}`
  const [poster, setPoster] = useState(() => posters.get(key) ?? null)
  useEffect(() => {
    if (file.kind !== 'video' || !visible || poster) return
    let cancelled = false
    posterQueue = posterQueue.then(async () => {
      if (cancelled) return
      const url = posters.get(key) ?? (await captureVideoFrame(libraryUrl(file.name, builtIn), null, 400).catch(() => null))
      if (url) posters.set(key, url)
      if (!cancelled) setPoster(url)
    })
    return () => {
      cancelled = true
    }
  }, [file.kind, file.name, builtIn, key, visible, poster])
  return poster
}

type UseMode = 'background' | 'full'

function FileCard({
  file,
  builtIn,
  busy,
  onUse
}: {
  file: LibraryFile
  /** One of the backgrounds that come with the app */
  builtIn: boolean
  busy: boolean
  onUse: (file: LibraryFile, builtIn: boolean, mode: UseMode) => void
}): ReactElement {
  const { title, quality } = describeLibraryFile(file)
  const src = libraryUrl(file.name, builtIn)
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [hover, setHover] = useState(false)
  const poster = usePoster(file, builtIn, visible)
  useEffect(() => {
    const el = ref.current
    if (!el || visible) return
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setVisible(true), { rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
  }, [visible])
  return (
    <div className="tpl-card">
      <div ref={ref} className="tpl-preview" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
        {file.kind === 'video' ? (
          <>
            {poster && <img className="tpl-canvas" src={poster} alt="" style={{ objectFit: 'cover' }} />}
            {hover && <video className="tpl-canvas tpl-hover-video" src={src} muted loop autoPlay playsInline style={{ objectFit: 'cover' }} />}
          </>
        ) : (
          <img className="tpl-canvas" src={src} alt="" loading="lazy" decoding="async" style={{ objectFit: 'cover' }} />
        )}
        {busy && (
          <div className="tpl-busy">
            <Loader2 size={22} className="spin" /> Copying into project…
          </div>
        )}
      </div>
      <div className="tpl-name" title={file.name}>
        <span className="tpl-file-title">{title}</span>
        {quality && <span className="tpl-cat-tag">{quality}</span>}
      </div>
      <div className="muted tpl-desc">
        {subfolderOf(file.name) && <>{subfolderOf(file.name)} · </>}
        {file.kind === 'video' ? 'Video' : 'Image'} · {formatBytes(file.sizeBytes)}
      </div>
      <div className="tpl-actions">
        <button className="btn primary" disabled={busy} onClick={() => onUse(file, builtIn, 'background')} title="Loop behind the lyrics">
          <Clapperboard size={13} /> Use as Background
        </button>
        <button className="btn" disabled={busy} onClick={() => onUse(file, builtIn, 'full')} title="Play full screen">
          <Play size={13} /> Full Screen
        </button>
      </div>
    </div>
  )
}

export function FolderBackgroundsTab(): ReactElement {
  const [listing, setListing] = useState<LibraryListing | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const media = useProjectStore((s) => s.project?.media)

  const refresh = (): void => {
    void window.bhcf.library
      .list()
      .then(setListing)
      .catch((err: unknown) => toast.error('Could not read the backgrounds folder', errorMessage(err)))
  }
  useEffect(refresh, [])

  /** The project copy of a folder file, if it was used before (same original name and size). */
  const existing = (file: LibraryFile): Id | null =>
    Object.values(media ?? {}).find((a) => a.originalName === baseName(file.name) &&a.sizeBytes === file.sizeBytes)?.id ?? null

  const use = async (file: LibraryFile, builtIn: boolean, mode: UseMode): Promise<void> => {
    if (busy) return
    let id = existing(file)
    if (!id) {
      setBusy(busyKey(file, builtIn))
      try {
        const asset = await window.bhcf.library.import(file.name, builtIn ? 'builtin' : 'folder')
        const { title } = describeLibraryFile(file)
        await addNewMedia([{ ...asset, name: title }], `Add background ${title}`, { pwBackgrounds: true })
        id = asset.id
      } catch (err) {
        toast.error('Could not use this background', errorMessage(err))
        return
      } finally {
        setBusy(null)
      }
    }
    if (mode === 'background') playBackground(id)
    else playMedia(id)
    toast.success(mode === 'background' ? 'Playing behind your lyrics' : 'Playing full screen', `${describeLibraryFile(file).title} is in Media › P&W Backgrounds too.`)
  }

  const onUse = (file: LibraryFile, builtIn: boolean, mode: UseMode): void => void use(file, builtIn, mode)

  const openFolder = (): void => {
    void window.bhcf.library.openDir().catch((err: unknown) => toast.error('Could not open the folder', errorMessage(err)))
  }

  /** Add Videos… (pick files) or Add Folder… (every video in a folder); both copy into the backgrounds folder. */
  const add = (what: 'files' | 'folder'): void => {
    if (adding) return
    setAdding(true)
    void (what === 'files' ? window.bhcf.library.addFiles() : window.bhcf.library.addFolder())
      .then((res) => {
        if (!res) return
        setListing(res.listing)
        if (res.added > 0) toast.success(`Added ${res.added} background${res.added === 1 ? '' : 's'}`, 'Hover to preview, then click Use as Background.')
        if (res.skipped.length > 0) {
          const detail = res.skipped
            .slice(0, 4)
            .map((x) => `${x.name}: ${x.reason}`)
            .join('\n')
          toast.warning(`Skipped ${res.skipped.length} file${res.skipped.length === 1 ? '' : 's'}`, detail)
        }
      })
      .catch((err: unknown) => toast.error(what === 'files' ? 'Could not add the files' : 'Could not add the folder', errorMessage(err)))
      .finally(() => setAdding(false))
  }

  const choose = (): void => {
    void window.bhcf.library
      .chooseDir()
      .then((l) => l && setListing(l))
      .catch((err: unknown) => toast.error('Could not change folder', errorMessage(err)))
  }

  return (
    <div className="tpl-body">
      <div className="tpl-toolbar">
        <FolderOpen size={15} />
        <span className="tpl-folder" title={listing?.dir}>
          {listing?.dir ?? 'Loading…'}
        </span>
        <span className="tpl-spacer" />
        <button className="btn" onClick={refresh} title="Look for new files">
          <RefreshCw size={13} /> Refresh
        </button>
        {adding && (
          <span className="muted tpl-copying">
            <Loader2 size={13} className="spin" /> Copying…
          </span>
        )}
        <button className="btn primary" onClick={() => add('files')} disabled={adding} title="Pick video or image files and copy them into this folder">
          <FilePlus2 size={13} /> Add Videos…
        </button>
        <button className="btn primary" onClick={() => add('folder')} disabled={adding} title="Pick a folder: every video and image in it (subfolders too) is copied into this folder">
          <FolderPlus size={13} /> Add Folder…
        </button>
        <button className="btn" onClick={openFolder}>
          <FolderOpen size={13} /> Open Folder
        </button>
        <button className="btn" onClick={choose}>
          <FolderSearch size={13} /> Change Folder…
        </button>
      </div>
      <p className="muted tpl-hint">
        Your own background videos and images (MP4, MOV, WebM, JPG, PNG), subfolders included. Click <b>Add Videos…</b> to pick files, <b>Add Folder…</b> to add every
        video in a folder, or <b>Change Folder…</b> to show a folder you already have. Hover to preview; the first time you use one it is copied into the project so it
        plays even without this folder.
      </p>
      {listing?.files.some((f) => describeLibraryFile(f).quality === '4K') && (
        <p className="muted tpl-hint">
          Tip: 4K videos take a lot of work to play on a laptop and look no sharper on a 1080p projector. If playback stutters, use the HD 1080p version of the video instead.
        </p>
      )}
      {listing?.error && (
        <p className="tpl-hint tpl-warning">
          <AlertTriangle size={14} /> {listing.error}
        </p>
      )}
      {listing && !listing.exists && <p className="tpl-hint">This folder does not exist yet. Click Add Videos… to pick your backgrounds, or Change Folder… to use a folder you already have.</p>}
      {listing?.exists && !listing.error && listing.files.length === 0 && (
        <p className="tpl-hint">No videos or images in this folder yet. Click Add Videos… or Add Folder… to add some, or Change Folder… if your videos are in another folder.</p>
      )}
      {listing && listing.unsupported.count > 0 && (
        <p className="tpl-hint tpl-warning">
          <AlertTriangle size={14} />
          {listing.unsupported.count} video{listing.unsupported.count === 1 ? '' : 's'} can't be played in this format ({listing.unsupported.examples.join(', ')}
          {listing.unsupported.count > listing.unsupported.examples.length ? ', …' : ''}). Convert them to MP4 (H.264), for example with HandBrake, then click Refresh.
        </p>
      )}
      <div className="tpl-grid">
        {listing?.files.map((f) => (
          <FileCard key={f.name} file={f} builtIn={false} busy={busy === busyKey(f, false)} onUse={onUse} />
        ))}
      </div>
      {listing && listing.builtIn.length > 0 && (
        <>
          <h3 className="tpl-section">
            <Sparkles size={14} /> Included with BHCF Presenter
          </h3>
          <div className="tpl-grid">
            {listing.builtIn.map((f) => (
              <FileCard key={f.name} file={f} builtIn busy={busy === busyKey(f, true)} onUse={onUse} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
