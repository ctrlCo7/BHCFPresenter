/**
 * Templates → My Backgrounds: the videos and images in a folder on this computer
 * (default Documents\Backgrounds). Previews stream straight from the folder; using one copies
 * it into the project (once) so the project stays self-contained, then plays it.
 */
import { Clapperboard, FolderOpen, FolderSearch, Loader2, Play, RefreshCw } from 'lucide-react'
import { useEffect, useState, type ReactElement } from 'react'
import type { LibraryFile, LibraryListing } from '@shared/ipc'
import { libraryUrl } from '@shared/media'
import type { Id } from '@shared/model/types'
import { playBackground, playMedia } from '../../live/liveActions'
import { errorMessage, toast } from '../../store/overlayStore'
import { useProjectStore } from '../../store/projectStore'
import { addNewMedia, formatBytes } from '../media/mediaActions'

/** "7077358-uhd_4096_2160_30fps.mp4" → { title: "7077358", quality: "4K" }. */
export function describeLibraryFile(file: LibraryFile): { title: string; quality: string | null } {
  const base = file.name.replace(/\.[^.]+$/, '')
  const m = /[-_ ]?(uhd|hd|sd)?[_ ]?(\d{3,4})[_x](\d{3,4})(?:[_ ](\d{2,3})fps)?$/i.exec(base)
  const height = m ? Number(m[3]) : null
  const quality = height ? (height >= 2000 ? '4K' : height >= 1000 ? 'HD 1080p' : `${height}p`) : null
  const title = (m ? base.slice(0, m.index) : base).replace(/[-_]+/g, ' ').trim() || base
  return { title, quality }
}

function FileCard({ file, busy, onUse }: { file: LibraryFile; busy: boolean; onUse: (file: LibraryFile, mode: 'background' | 'full') => void }): ReactElement {
  const { title, quality } = describeLibraryFile(file)
  const src = libraryUrl(file.name)
  return (
    <div className="tpl-card">
      <div
        className="tpl-preview"
        onMouseEnter={(e) => void e.currentTarget.querySelector('video')?.play().catch(() => undefined)}
        onMouseLeave={(e) => e.currentTarget.querySelector('video')?.pause()}
      >
        {file.kind === 'video' ? (
          <video className="tpl-canvas" src={`${src}#t=1`} muted loop playsInline preload="metadata" style={{ objectFit: 'cover' }} />
        ) : (
          <img className="tpl-canvas" src={src} alt="" loading="lazy" style={{ objectFit: 'cover' }} />
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
        {file.kind === 'video' ? 'Video' : 'Image'} · {formatBytes(file.sizeBytes)}
      </div>
      <div className="tpl-actions">
        <button className="btn primary" disabled={busy} onClick={() => onUse(file, 'background')} title="Loop behind the lyrics">
          <Clapperboard size={13} /> Use as Background
        </button>
        <button className="btn" disabled={busy} onClick={() => onUse(file, 'full')} title="Play full screen">
          <Play size={13} /> Full Screen
        </button>
      </div>
    </div>
  )
}

export function FolderBackgroundsTab(): ReactElement {
  const [listing, setListing] = useState<LibraryListing | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
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
    Object.values(media ?? {}).find((a) => a.originalName === file.name && a.sizeBytes === file.sizeBytes)?.id ?? null

  const use = async (file: LibraryFile, mode: 'background' | 'full'): Promise<void> => {
    if (busy) return
    let id = existing(file)
    if (!id) {
      setBusy(file.name)
      try {
        const asset = await window.bhcf.library.import(file.name)
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
        <button className="btn" onClick={() => void window.bhcf.library.openDir()}>
          <FolderOpen size={13} /> Open Folder
        </button>
        <button className="btn" onClick={choose}>
          <FolderSearch size={13} /> Change Folder…
        </button>
      </div>
      <p className="muted tpl-hint">
        Your own background videos and images. Put files in this folder (MP4, MOV, WebM, JPG, PNG) and click Refresh. Hover to preview; the first time you use one it is copied into the project so it plays even without this folder.
      </p>
      {listing && !listing.exists && <p className="tpl-hint">This folder does not exist yet. Click Open Folder to create it, then add your backgrounds.</p>}
      {listing?.exists && listing.files.length === 0 && <p className="tpl-hint">No videos or images in this folder yet.</p>}
      <div className="tpl-grid">
        {listing?.files.map((f) => (
          <FileCard key={f.name} file={f} busy={busy === f.name} onUse={(file, mode) => void use(file, mode)} />
        ))}
      </div>
    </div>
  )
}
