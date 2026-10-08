import { mediaBaseName, mediaUrl, PW_BACKGROUNDS_DIR } from '@shared/media'
import type { Id, MediaAsset } from '@shared/model/types'
import { addMediaAssets, addToMediaPlaylist, mediaSharedWith, pwBackgroundsPlaylist, mediaUsage, removeMediaFromProfile, updateMediaAsset } from '../../engine/projectOps'
import { activeProfile } from '../../engine/tree'
import { dialogs, errorMessage, toast } from '../../store/overlayStore'
import { applyChange, requireProject, useProjectStore } from '../../store/projectStore'
import { ui } from '../../store/uiStore'

/** Imports files (dialog when `paths` is omitted), adds them to the project and probes metadata. */
export async function importMedia(paths?: string[]): Promise<MediaAsset[]> {
  if (!useProjectStore.getState().project) return []
  try {
    const { imported, skipped } = await window.bhcf.media.import(paths)
    if (imported.length > 0) {
      addNewMedia(imported, `Import ${imported.length} media file(s)`)
      toast.success(`Imported ${imported.length} file(s)`)
    }
    if (skipped.length > 0) {
      const detail = skipped
        .slice(0, 5)
        .map((s) => `${s.path.split(/[\\/]/).pop()}: ${s.reason}`)
        .join('\n')
      toast.warning(`Skipped ${skipped.length} file(s)`, detail)
    }
    return imported
  } catch (err) {
    toast.error('Import failed', errorMessage(err))
    return []
  }
}

/**
 * Adds freshly created/imported assets to the project, then reads their size/length and makes posters.
 * `pwBackgrounds`: Templates backgrounds, which go into the P&W Backgrounds playlist (hidden from All Media).
 */
export function addNewMedia(assets: MediaAsset[], label: string, options: { pwBackgrounds?: boolean } = {}): Promise<void> {
  applyChange(label, (d) => {
    addMediaAssets(d, assets)
    if (options.pwBackgrounds) addToMediaPlaylist(d, pwBackgroundsPlaylist(d).id, assets.map((a) => a.id))
  })
  if (!options.pwBackgrounds) ui.set({ selectedMediaIds: assets.map((m) => m.id) })
  return Promise.all(assets.map(probeAndStore)).then(() => undefined)
}

interface Probe {
  width: number | null
  height: number | null
  durationSec: number | null
}

/** Reads dimensions / duration using the browser's decoders. */
function probe(asset: MediaAsset): Promise<Probe> {
  const src = mediaUrl(asset.fileName)
  return new Promise((resolve) => {
    const fail = (): void => resolve({ width: null, height: null, durationSec: null })
    const timeout = window.setTimeout(fail, 15000)
    if (asset.kind === 'image') {
      const img = new Image()
      img.onload = () => {
        window.clearTimeout(timeout)
        resolve({ width: img.naturalWidth, height: img.naturalHeight, durationSec: null })
      }
      img.onerror = fail
      img.src = src
      return
    }
    const el = document.createElement(asset.kind === 'video' ? 'video' : 'audio')
    el.preload = 'metadata'
    el.muted = true
    const finish = (): void => {
      window.clearTimeout(timeout)
      const video = el instanceof HTMLVideoElement ? el : null
      resolve({
        width: video?.videoWidth || null,
        height: video?.videoHeight || null,
        durationSec: Number.isFinite(el.duration) ? el.duration : null
      })
      el.removeAttribute('src')
      el.load()
    }
    el.onloadedmetadata = () => {
      if (Number.isFinite(el.duration)) return finish()
      // Streamed/recorded WebM files often report an infinite duration until the decoder
      // reaches the end; seeking far past it makes Chromium compute the real value.
      el.ondurationchange = () => {
        if (Number.isFinite(el.duration)) finish()
      }
      el.currentTime = 1e101
    }
    el.onerror = () => {
      window.clearTimeout(timeout)
      fail()
    }
    el.src = src
  })
}

async function probeAndStore(asset: MediaAsset): Promise<void> {
  const info = await probe(asset)
  if (info.width !== null || info.durationSec !== null) {
    applyChange('Media metadata', (d) => updateMediaAsset(d, asset.id, info), { history: false })
  }
  if (asset.kind === 'video') await createVideoThumbnail(asset, info.durationSec)
}

/**
 * Captures a poster frame (about 1 s in) as a JPEG and stores it in media/.thumbs, so media
 * tiles and slide thumbnails show a still instead of loading the whole video.
 */
async function createVideoThumbnail(asset: MediaAsset, duration: number | null): Promise<void> {
  try {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const video = document.createElement('video')
      video.muted = true
      video.preload = 'auto'
      video.crossOrigin = 'anonymous'
      const timeout = window.setTimeout(() => reject(new Error('timeout')), 20000)
      video.onloadeddata = () => {
        video.currentTime = Math.min(1, (duration ?? 2) / 2)
      }
      video.onseeked = () => {
        window.clearTimeout(timeout)
        const w = 480
        const h = Math.round((w * (video.videoHeight || 9)) / (video.videoWidth || 16))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        canvas.getContext('2d')?.drawImage(video, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', 0.82))
        video.removeAttribute('src')
        video.load()
      }
      video.onerror = () => {
        window.clearTimeout(timeout)
        reject(new Error('decode failed'))
      }
      video.src = mediaUrl(asset.fileName)
    })
    const thumbnail = await window.bhcf.media.saveThumbnail(asset.id, dataUrl)
    applyChange(
      'Media thumbnail',
      (d) => {
        const m = d.media[asset.id]
        if (m) m.thumbnail = thumbnail
      },
      { history: false }
    )
  } catch (err) {
    window.bhcf.app.log('warn', `Thumbnail for ${asset.name} failed: ${errorMessage(err)}`)
  }
}

/** Generates missing posters for videos imported before thumbnails existed. */
export function ensureVideoThumbnails(): void {
  const p = useProjectStore.getState().project
  if (!p) return
  for (const a of Object.values(p.media)) if (a.kind === 'video' && !a.thumbnail) void createVideoThumbnail(a, a.durationSec)
}

/** Removes files from the media folder that no media item references any more. */
export async function cleanupUnusedMedia(): Promise<void> {
  const p = requireProject()
  try {
    const files = await window.bhcf.media.listFiles()
    const keep = new Set<string>()
    for (const a of Object.values(p.media)) {
      // Either place: a record can predate the move into P&W Backgrounds (e.g. after undo).
      keep.add(mediaBaseName(a.fileName))
      keep.add(`${PW_BACKGROUNDS_DIR}/${mediaBaseName(a.fileName)}`)
      if (a.thumbnail) keep.add(`.thumbs/${a.thumbnail}`)
    }
    const unused = files.filter((f) => !keep.has(f.name))
    if (unused.length === 0) {
      toast.success('Nothing to clean up', 'Every file in the media folder is in use.')
      return
    }
    const bytes = unused.reduce((n, f) => n + f.sizeBytes, 0)
    const ok = await dialogs.confirm({
      title: 'Clean up media folder',
      message: `Delete ${unused.length} unused file(s) (${formatBytes(bytes)})? Undo cannot bring back deleted files.`,
      confirmLabel: 'Delete files',
      danger: true
    })
    if (!ok) return
    const res = await window.bhcf.media.deleteFiles(unused.map((f) => f.name))
    toast.success(`Deleted ${res.deleted} file(s)`, `Freed ${formatBytes(res.freedBytes)}`)
  } catch (err) {
    toast.error('Clean-up failed', errorMessage(err))
  }
}

export function setAsLogo(id: Id): void {
  applyChange('Set logo', (d) => {
    d.settings.logoMediaId = id
  })
  toast.success('Logo set', 'Press L (or the Logo button) to show it full screen.')
}

export async function deleteMedia(ids: Id[]): Promise<void> {
  if (ids.length === 0) return
  const project = requireProject()
  let slides = 0
  let entries = 0
  for (const id of ids) {
    const u = mediaUsage(project, id)
    slides += u.slides
    entries += u.playlistEntries
  }
  const names = ids.length === 1 ? `"${project.media[ids[0] as Id]?.name}"` : `${ids.length} media items`
  const profile = activeProfile(project)
  const shared = mediaSharedWith(project, ids)
  // Media other profiles still show is only taken out of this one.
  const message = shared.length
    ? `Remove ${names} from the "${profile.name}" profile? ${shared.map((p) => `"${p.name}"`).join(', ')} still use${shared.length === 1 ? 's' : ''} it, so it stays in the project.`
    : `Remove ${names} from the project?${
        slides + entries > 0 ? ` It is used by ${slides} slide(s) and ${entries} media playlist(s); slides will show a missing-media placeholder.` : ''
      }`
  const ok = await dialogs.confirm({ title: 'Remove media', message, confirmLabel: 'Remove', danger: true })
  if (!ok) return
  applyChange('Remove media', (d) => removeMediaFromProfile(d, ids))
  ui.set({ selectedMediaIds: [] })
}

export async function renameMedia(id: Id): Promise<void> {
  const asset = requireProject().media[id]
  if (!asset) return
  const name = await dialogs.prompt({ title: 'Rename media', label: 'Name', defaultValue: asset.name, confirmLabel: 'Rename' })
  if (name?.trim()) applyChange('Rename media', (d) => updateMediaAsset(d, id, { name: name.trim() }))
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let v = bytes / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`
}

export function formatDuration(sec: number | null): string {
  if (sec === null) return ''
  const s = Math.round(sec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`
}
