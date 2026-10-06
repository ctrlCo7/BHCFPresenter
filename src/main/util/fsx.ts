import { randomBytes } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'

/** Error carrying a stable code plus a message that is safe to show to the user. */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message)
    this.name = 'AppError'
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/**
 * Renames with retries. On Windows, antivirus scanners and indexers briefly lock freshly
 * written files, which makes rename fail with EPERM/EBUSY/EACCES for a few milliseconds.
 */
export async function renameWithRetry(from: string, to: string, attempts = 8): Promise<void> {
  for (let i = 0; ; i++) {
    try {
      await fs.rename(from, to)
      return
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      const retriable = code === 'EPERM' || code === 'EBUSY' || code === 'EACCES'
      if (!retriable || i >= attempts - 1) throw err
      await sleep(25 * 2 ** i)
    }
  }
}

/**
 * Crash-safe write: the data is written and fsync'd to a temp file in the same directory,
 * then renamed over the target. Readers see either the old file or the new one, never a
 * half-written file. When `keepPrevious` is given, the old file is moved there first.
 */
export async function writeFileAtomic(target: string, data: string, keepPrevious?: string): Promise<void> {
  const dir = path.dirname(target)
  await fs.mkdir(dir, { recursive: true })
  const tmp = path.join(dir, `.${path.basename(target)}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`)
  const handle = await fs.open(tmp, 'w')
  try {
    await handle.writeFile(data, 'utf8')
    await handle.sync()
  } finally {
    await handle.close()
  }
  try {
    if (keepPrevious && (await exists(target))) await renameWithRetry(target, keepPrevious)
    await renameWithRetry(tmp, target)
  } catch (err) {
    await fs.rm(tmp, { force: true })
    throw err
  }
}

export async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

export async function readJson(p: string): Promise<unknown> {
  const text = await fs.readFile(p, 'utf8')
  // Strip a UTF-8 BOM if an external editor added one.
  return JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text) as unknown
}

/** Makes a string safe to use as a single file or folder name on every platform. */
export function sanitizeFileName(name: string, fallback = 'untitled'): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 120)
  if (!cleaned || /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(cleaned)) return fallback
  return cleaned
}

/** True when `child` resolves to a location inside `parent`. */
export function isInside(parent: string, child: string): boolean {
  const rel = path.relative(parent, child)
  return rel.length > 0 && !rel.startsWith('..') && !path.isAbsolute(rel)
}
