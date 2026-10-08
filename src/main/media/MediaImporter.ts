import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { ImportMediaResult, MediaFileInfo } from '../../shared/ipc'
import { isValidMediaFileName, mediaTypeFor, PW_BACKGROUNDS_DIR } from '../../shared/media'
import type { MediaAsset } from '../../shared/model/types'
import { AppError, isInside, sanitizeFileName } from '../util/fsx'

/**
 * Copies media files into the project's media folder so projects stay self-contained
 * and portable. Dimensions/duration are probed later by the renderer, which has the decoders.
 */
export async function importMediaFiles(mediaDir: string, sourcePaths: string[], subfolder: typeof PW_BACKGROUNDS_DIR | null = null): Promise<ImportMediaResult> {
  const destDir = subfolder ? path.join(mediaDir, subfolder) : mediaDir
  await fs.mkdir(destDir, { recursive: true })
  const imported: MediaAsset[] = []
  const skipped: ImportMediaResult['skipped'] = []

  for (const source of sourcePaths) {
    try {
      const stat = await fs.stat(source)
      if (!stat.isFile()) {
        skipped.push({ path: source, reason: 'Not a file' })
        continue
      }
      const originalName = path.basename(source)
      const type = mediaTypeFor(originalName)
      if (!type) {
        skipped.push({ path: source, reason: 'Unsupported file type' })
        continue
      }
      const ext = path.extname(originalName).toLowerCase()
      const base = sanitizeFileName(path.basename(originalName, path.extname(originalName)), 'media').slice(0, 60)
      const id = randomUUID()
      const bare = `${base}-${id.slice(0, 8)}${ext}`
      const fileName = subfolder ? `${subfolder}/${bare}` : bare
      // COPYFILE_EXCL: never overwrite an existing media file.
      await fs.copyFile(source, path.join(destDir, bare), fs.constants.COPYFILE_EXCL)
      imported.push({
        id,
        name: path.basename(originalName, path.extname(originalName)),
        kind: type.kind,
        fileName,
        originalName,
        mimeType: type.mimeType,
        sizeBytes: stat.size,
        width: null,
        height: null,
        durationSec: null,
        thumbnail: null,
        importedAt: new Date().toISOString()
      })
    } catch (err) {
      skipped.push({ path: source, reason: (err as Error).message })
    }
  }
  return { imported, skipped }
}

export const THUMBS_DIR = '.thumbs'
const MAX_THUMB_BYTES = 2 * 1024 * 1024

/** Saves a renderer-generated JPEG poster frame; returns the file name inside media/.thumbs. */
export async function saveThumbnail(mediaDir: string, assetId: string, dataUrl: string): Promise<string> {
  if (!/^[\w-]{1,64}$/.test(assetId)) throw new AppError('INVALID_ID', 'Invalid media id.')
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
  if (!m) throw new AppError('INVALID_IMAGE', 'Thumbnail must be a JPEG data URL.')
  const bytes = Buffer.from(m[1] as string, 'base64')
  if (bytes.length > MAX_THUMB_BYTES) throw new AppError('TOO_LARGE', 'Thumbnail too large.')
  const name = `${assetId}.jpg`
  await fs.mkdir(path.join(mediaDir, THUMBS_DIR), { recursive: true })
  await fs.writeFile(path.join(mediaDir, THUMBS_DIR, name), bytes)
  return name
}

/** Files in media/ (thumbnails reported as ".thumbs/<name>", Templates backgrounds as "P&W Backgrounds/<name>"). */
export async function listMediaFiles(mediaDir: string): Promise<MediaFileInfo[]> {
  const out: MediaFileInfo[] = []
  const scan = async (dir: string, prefix: string): Promise<void> => {
    let entries: import('node:fs').Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (e.isFile() && !e.name.startsWith('.')) out.push({ name: prefix + e.name, sizeBytes: (await fs.stat(path.join(dir, e.name))).size })
      else if (e.isDirectory() && (e.name === THUMBS_DIR || e.name === PW_BACKGROUNDS_DIR) && !prefix) await scan(path.join(dir, e.name), `${e.name}/`)
    }
  }
  await scan(mediaDir, '')
  return out
}

/** Deletes the named files from media/ (or media/.thumbs/, media/P&W Backgrounds/). Names are validated strictly. */
export async function deleteMediaFiles(mediaDir: string, names: string[]): Promise<{ deleted: number; freedBytes: number }> {
  let deleted = 0
  let freedBytes = 0
  for (const name of names) {
    const m = /^(\.thumbs\/|P&W Backgrounds\/)?([^/\\]+)$/.exec(name)
    if (!m || m[2] === '..' || (m[2] as string).startsWith('.')) continue
    const file = path.join(mediaDir, m[1] ? m[1].slice(0, -1) : '', m[2] as string)
    if (!isInside(mediaDir, file)) continue
    try {
      const stat = await fs.stat(file)
      if (!stat.isFile()) continue
      await fs.rm(file)
      deleted++
      freedBytes += stat.size
    } catch {
      /* already gone */
    }
  }
  return { deleted, freedBytes }
}

/**
 * Moves loose files of media/ into media/P&W Backgrounds (Templates backgrounds made before the
 * folder existed). Returns each moved name's new file name; one already in the folder counts as moved.
 */
export async function moveToBackgroundsFolder(mediaDir: string, fileNames: string[]): Promise<Record<string, string>> {
  const moved: Record<string, string> = {}
  await fs.mkdir(path.join(mediaDir, PW_BACKGROUNDS_DIR), { recursive: true })
  for (const name of fileNames) {
    if (!isValidMediaFileName(name) || name.includes('/') || name.startsWith('.')) continue
    const target = path.join(mediaDir, PW_BACKGROUNDS_DIR, name)
    try {
      await fs.rename(path.join(mediaDir, name), target)
      moved[name] = `${PW_BACKGROUNDS_DIR}/${name}`
    } catch {
      if (await fs.stat(target).then((st) => st.isFile(), () => false)) moved[name] = `${PW_BACKGROUNDS_DIR}/${name}`
    }
  }
  return moved
}
