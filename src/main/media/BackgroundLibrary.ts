/**
 * The backgrounds folder on this computer (Templates → My Backgrounds): listing it (subfolders
 * included), resolving a listed file safely, and copying picked files into it.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { LibraryFile, LibraryListing } from '../../shared/ipc'
import { mediaTypeFor } from '../../shared/media'
import { AppError, isInside } from '../util/fsx'

const MAX_FILES = 2000
const MAX_DEPTH = 4
/** Video formats people often have that Chromium cannot play; reported so they know to convert. */
const UNPLAYABLE_VIDEO = new Set(['mkv', 'avi', 'wmv', 'flv', 'mpg', 'mpeg', '3gp', 'mts', 'm2ts', 'vob', 'ts'])

/** Explains a folder access error in words an operator can act on. */
export function folderAccessMessage(code: string | undefined, platform: NodeJS.Platform = process.platform): string {
  if (code === 'EPERM' || code === 'EACCES') {
    return platform === 'darwin'
      ? 'macOS is not letting BHCF Presenter open this folder. Open System Settings → Privacy & Security → Files and Folders, allow BHCF Presenter (Documents, Desktop or Downloads), then click Refresh — or click Change Folder… and pick the folder there.'
      : 'Windows is not letting BHCF Presenter open this folder (folder permissions or Controlled Folder Access). Click Change Folder… and pick another folder.'
  }
  if (code === 'ENOTDIR') return 'This is a file, not a folder. Click Change Folder… and pick the folder that holds your backgrounds.'
  return `The folder could not be opened${code ? ` (${code})` : ''}. Click Change Folder… to pick another one.`
}

export async function listLibraryDir(dir: string): Promise<LibraryListing> {
  const listing: LibraryListing = { dir, exists: true, files: [], error: null, unsupported: { count: 0, examples: [] }, builtIn: [] }
  try {
    await fs.readdir(dir)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return { ...listing, exists: false }
    return { ...listing, error: folderAccessMessage(code) }
  }

  const files: LibraryFile[] = []
  const scan = async (abs: string, rel: string, depth: number): Promise<void> => {
    let entries: import('node:fs').Dirent[]
    try {
      entries = await fs.readdir(abs, { withFileTypes: true })
    } catch {
      return // An unreadable subfolder is skipped; the rest still lists.
    }
    for (const e of entries) {
      if (files.length >= MAX_FILES) return
      if (e.name.startsWith('.')) continue
      const name = rel ? `${rel}/${e.name}` : e.name
      const full = path.join(abs, e.name)
      if (e.isDirectory()) {
        if (depth < MAX_DEPTH) await scan(full, name, depth + 1)
        continue
      }
      const type = mediaTypeFor(e.name)
      if (!type) {
        const ext = path.extname(e.name).slice(1).toLowerCase()
        if (UNPLAYABLE_VIDEO.has(ext)) {
          listing.unsupported.count++
          if (listing.unsupported.examples.length < 5) listing.unsupported.examples.push(name)
        }
        continue
      }
      if (type.kind === 'audio') continue
      // stat (not the Dirent) so shortcuts/symlinks and cloud placeholders report their real size.
      const stat = await fs.stat(full).catch(() => null)
      if (stat?.isFile()) files.push({ name, kind: type.kind, sizeBytes: stat.size })
    }
  }
  await scan(dir, '', 0)
  files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
  return { ...listing, files }
}

/** Absolute path of a listed file ("Worship/Clouds.mp4"), refusing anything outside the folder. */
export function resolveLibraryFile(dir: string, name: unknown): string {
  if (typeof name !== 'string' || !name || name.includes('\\') || path.isAbsolute(name)) throw new AppError('INVALID', 'Invalid file name.')
  const parts = name.split('/')
  if (parts.some((p) => !p || p === '.' || p === '..')) throw new AppError('INVALID', 'Invalid file name.')
  const full = path.join(dir, ...parts)
  if (!isInside(dir, full)) throw new AppError('INVALID', 'Invalid file name.')
  return full
}

/**
 * The backgrounds that come with the app, leaving out those the folder already has. They are
 * matched by exact size, since the bundled copies carry friendlier names than the downloads.
 */
export function builtInsNotIn(listing: LibraryListing, builtIn: LibraryFile[]): LibraryFile[] {
  const have = new Set(listing.files.map((f) => f.sizeBytes))
  return builtIn.filter((f) => !have.has(f.sizeBytes))
}

/**
 * Copies the videos and images in a picked folder (subfolders too) into a subfolder of the same
 * name, e.g. "Worship" → "<backgrounds>/Worship/…". Files already in the backgrounds folder are left alone.
 */
export async function copyFolderIntoLibrary(dir: string, folder: string): Promise<{ added: number; skipped: { name: string; reason: string }[] }> {
  const root = path.resolve(dir)
  const picked = path.resolve(folder)
  if (isInside(root, picked)) return { added: 0, skipped: [{ name: path.basename(picked), reason: 'This folder is already in your backgrounds folder.' }] }
  const listing = await listLibraryDir(picked)
  if (!listing.exists || listing.error) return { added: 0, skipped: [{ name: path.basename(picked), reason: listing.error ?? 'The folder could not be found.' }] }
  const skipped: { name: string; reason: string }[] = listing.unsupported.examples.map((name) => ({
    name,
    reason: "This video format can't be played. Convert it to MP4 (H.264), for example with HandBrake."
  }))
  // Group by subfolder so each lands in the same place under the new folder.
  const groups = new Map<string, string[]>()
  for (const f of listing.files) {
    const source = path.join(picked, ...f.name.split('/'))
    if (isInside(root, source)) continue // e.g. the backgrounds folder is inside the picked folder
    const sub = f.name.includes('/') ? f.name.slice(0, f.name.lastIndexOf('/')) : ''
    groups.set(sub, [...(groups.get(sub) ?? []), source])
  }
  let added = 0
  for (const [sub, sources] of groups) {
    const res = await copyIntoLibrary(path.join(root, path.basename(picked), ...(sub ? sub.split('/') : [])), sources)
    added += res.added
    skipped.push(...res.skipped)
  }
  if (added === 0 && skipped.length === 0) skipped.push({ name: path.basename(picked), reason: 'There are no videos or images in this folder.' })
  return { added, skipped }
}

/**
 * Copies picked files into the folder (top level). A file already in the folder is left where it
 * is; a different file with the same name gets " (2)", " (3)"… instead of being overwritten.
 */
export async function copyIntoLibrary(dir: string, sources: string[]): Promise<{ added: number; skipped: { name: string; reason: string }[] }> {
  await fs.mkdir(dir, { recursive: true })
  let added = 0
  const skipped: { name: string; reason: string }[] = []
  for (const source of sources) {
    const name = path.basename(source)
    const type = mediaTypeFor(name)
    if (!type || type.kind === 'audio') {
      skipped.push({ name, reason: 'Not a video or image this app can play (use MP4, MOV, WebM, JPG or PNG).' })
      continue
    }
    if (isInside(dir, path.resolve(source))) continue // Already in the folder (or a subfolder).
    try {
      const size = (await fs.stat(source)).size
      const ext = path.extname(name)
      const base = path.basename(name, ext)
      for (let n = 1; ; n++) {
        const target = path.join(dir, n === 1 ? name : `${base} (${n})${ext}`)
        const existing = await fs.stat(target).catch(() => null)
        if (existing) {
          if (existing.size === size) {
            added++ // Same file copied before: it is in the folder, which is what was asked.
            break
          }
          continue
        }
        await fs.copyFile(source, target, fs.constants.COPYFILE_EXCL)
        added++
        break
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      skipped.push({ name, reason: code === 'ENOSPC' ? 'The disk is full.' : code === 'EPERM' || code === 'EACCES' ? folderAccessMessage(code) : 'The file could not be copied.' })
    }
  }
  return { added, skipped }
}
