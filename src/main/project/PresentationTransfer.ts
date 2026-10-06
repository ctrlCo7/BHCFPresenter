/**
 * Single-presentation exchange format (.bhcfpres): the presentation JSON plus every media
 * file it references, base64-embedded, so it can be emailed or moved between projects.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { ImportedPresentation } from '../../shared/ipc'
import { mediaTypeFor } from '../../shared/media'
import { clonePresentation } from '../../shared/model/factory'
import { normalizePresentation } from '../../shared/model/normalize'
import type { Background, Id, MediaAsset, Presentation } from '../../shared/model/types'
import { AppError, sanitizeFileName, writeFileAtomic } from '../util/fsx'

const FORMAT = 'bhcf-presentation'
/** Refuse to embed more than this much media into one file. */
const MAX_EMBED_BYTES = 1.5 * 1024 ** 3

interface PresentationFile {
  format: typeof FORMAT
  version: 1
  exportedAt: string
  presentation: Presentation
  media: { asset: MediaAsset; data: string }[]
}

/** Media ids referenced by backgrounds and elements of a presentation. */
export function referencedMedia(p: Presentation): Set<Id> {
  const ids = new Set<Id>()
  const bg = (b: Background | null): void => {
    if (b && (b.type === 'image' || b.type === 'video')) ids.add(b.mediaId)
  }
  bg(p.background)
  for (const s of p.slides) {
    bg(s.background)
    for (const e of s.elements) if (e.type === 'image' || e.type === 'video') ids.add(e.mediaId)
  }
  return ids
}

export async function exportPresentation(target: string, presentation: Presentation, assets: MediaAsset[], mediaDir: string): Promise<void> {
  const wanted = referencedMedia(presentation)
  const used = assets.filter((a) => wanted.has(a.id))
  const total = used.reduce((n, a) => n + a.sizeBytes, 0)
  if (total > MAX_EMBED_BYTES) throw new AppError('TOO_LARGE', 'The media in this presentation is too large to embed (over 1.5 GB).')
  const media: PresentationFile['media'] = []
  for (const asset of used) {
    const file = path.join(mediaDir, asset.fileName)
    try {
      media.push({ asset, data: (await fs.readFile(file)).toString('base64') })
    } catch {
      /* missing files are skipped; the slide will show a missing-media placeholder */
    }
  }
  const doc: PresentationFile = { format: FORMAT, version: 1, exportedAt: new Date().toISOString(), presentation, media }
  await writeFileAtomic(target, JSON.stringify(doc))
}

export async function importPresentation(source: string, mediaDir: string): Promise<ImportedPresentation> {
  let doc: Partial<PresentationFile>
  try {
    doc = JSON.parse(await fs.readFile(source, 'utf8')) as Partial<PresentationFile>
  } catch {
    throw new AppError('INVALID_FILE', 'The file is not a readable BHCF presentation.')
  }
  if (doc.format !== FORMAT) throw new AppError('INVALID_FILE', 'This file is not a BHCF presentation (.bhcfpres).')
  const normalized = normalizePresentation(doc.presentation)
  if (!normalized) throw new AppError('INVALID_FILE', 'The presentation data in the file is damaged.')

  await fs.mkdir(mediaDir, { recursive: true })
  const idMap = new Map<Id, Id>()
  const media: MediaAsset[] = []
  for (const item of Array.isArray(doc.media) ? doc.media : []) {
    const a = item?.asset
    if (!a || typeof a.id !== 'string' || typeof a.fileName !== 'string' || typeof item.data !== 'string') continue
    const type = mediaTypeFor(a.fileName)
    if (!type) continue
    const id = randomUUID()
    const ext = path.extname(a.fileName).toLowerCase()
    const fileName = `${sanitizeFileName(path.basename(a.fileName, ext), 'media').slice(0, 60)}-${id.slice(0, 8)}${ext}`
    const bytes = Buffer.from(item.data, 'base64')
    await fs.writeFile(path.join(mediaDir, fileName), bytes, { flag: 'wx' })
    idMap.set(a.id, id)
    media.push({
      id,
      name: typeof a.name === 'string' ? a.name : fileName,
      kind: type.kind,
      fileName,
      originalName: typeof a.originalName === 'string' ? a.originalName : fileName,
      mimeType: type.mimeType,
      sizeBytes: bytes.length,
      width: typeof a.width === 'number' ? a.width : null,
      height: typeof a.height === 'number' ? a.height : null,
      durationSec: typeof a.durationSec === 'number' ? a.durationSec : null,
      thumbnail: null,
      importedAt: new Date().toISOString()
    })
  }

  // Fresh ids so importing the same file twice never collides, then remap media references.
  const fresh = clonePresentation(normalized.presentation, normalized.presentation.name)
  const remap = (b: Background | null): Background | null =>
    b && (b.type === 'image' || b.type === 'video') ? { ...b, mediaId: idMap.get(b.mediaId) ?? b.mediaId } : b
  fresh.background = remap(fresh.background)
  for (const s of fresh.slides) {
    s.background = remap(s.background)
    for (const e of s.elements) if (e.type === 'image' || e.type === 'video') e.mediaId = idMap.get(e.mediaId) ?? e.mediaId
  }
  return { presentation: fresh, media, repairs: normalized.repairs }
}
