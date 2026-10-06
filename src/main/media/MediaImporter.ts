import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { ImportMediaResult, MediaFileInfo } from '../../shared/ipc'
import { mediaTypeFor } from '../../shared/media'
import type { MediaAsset } from '../../shared/model/types'
import { AppError, isInside, sanitizeFileName } from '../util/fsx'

/**
 * Copies media files into the project's media folder so projects stay self-contained
 * and portable. Dimensions/duration are probed later by the renderer, which has the decoders.
 */
export async function importMediaFiles(mediaDir: string, sourcePaths: string[]): Promise<ImportMediaResult> {
  await fs.mkdir(mediaDir, { recursive: true })
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
      const fileName = `${base}-${id.slice(0, 8)}${ext}`
      // COPYFILE_EXCL: never overwrite an existing media file.
      await fs.copyFile(source, path.join(mediaDir, fileName), fs.constants.COPYFILE_EXCL)
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

const MAX_GENERATED_BYTES = 300 * 1024 * 1024

/** Writes bytes produced inside the app (generated backgrounds) into the media folder. */
export async function saveGeneratedMedia(mediaDir: string, name: string, ext: string, data: Uint8Array): Promise<MediaAsset> {
  if (ext !== 'webm' && ext !== 'png') throw new AppError('INVALID_TYPE', 'Unsupported generated media type.')
  if (!(data instanceof Uint8Array) || data.byteLength === 0 || data.byteLength > MAX_GENERATED_BYTES) {
    throw new AppError('INVALID_DATA', 'The generated media is empty or too large.')
  }
  await fs.mkdir(mediaDir, { recursive: true })
  const type = mediaTypeFor(`x.${ext}`)
  if (!type) throw new AppError('INVALID_TYPE', 'Unsupported generated media type.')
  const id = randomUUID()
  const cleanName = sanitizeFileName(name, 'background').slice(0, 60)
  const fileName = `${cleanName}-${id.slice(0, 8)}.${ext}`
  await fs.writeFile(path.join(mediaDir, fileName), data, { flag: 'wx' })
  return {
    id,
    name: cleanName,
    kind: type.kind,
    fileName,
    originalName: fileName,
    mimeType: type.mimeType,
    sizeBytes: data.byteLength,
    width: null,
    height: null,
    durationSec: null,
    thumbnail: null,
    importedAt: new Date().toISOString()
  }
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

/** Files in media/ (thumbnails reported as ".thumbs/<name>"). */
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
      else if (e.isDirectory() && e.name === THUMBS_DIR && !prefix) await scan(path.join(dir, e.name), `${THUMBS_DIR}/`)
    }
  }
  await scan(mediaDir, '')
  return out
}

/** Deletes the named files from media/ (or media/.thumbs/). Names are validated strictly. */
export async function deleteMediaFiles(mediaDir: string, names: string[]): Promise<{ deleted: number; freedBytes: number }> {
  let deleted = 0
  let freedBytes = 0
  for (const name of names) {
    const m = /^(\.thumbs\/)?([^/\\]+)$/.exec(name)
    if (!m || m[2] === '..' || (m[2] as string).startsWith('.')) continue
    const file = path.join(mediaDir, m[1] ? THUMBS_DIR : '', m[2] as string)
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
