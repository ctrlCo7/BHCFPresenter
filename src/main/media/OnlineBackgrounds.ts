/**
 * Worship backgrounds from free online libraries: Pexels and Pixabay. Both are free to use in
 * church (no attribution required) and need a free API key, which stays on this computer
 * (config.json), never in projects or the window.
 *
 * Searching returns results with small preview pictures (fetched here, as data URIs, because
 * the window may only show local images). Downloading saves the video into the "Online"
 * subfolder of the backgrounds folder, so it also appears in Templates › My Backgrounds. Only
 * videos found by a search can be downloaded: the window passes a result id, never a URL.
 */
import { createWriteStream, promises as fs } from 'node:fs'
import path from 'node:path'
import { net } from 'electron'
import type { OnlineBackground, OnlineProvider } from '../../shared/ipc'
import { sanitizeFileName } from '../util/fsx'
import { log } from '../util/log'

const PER_PAGE = 24
/** Largest width we download: HD is plenty for a projector, and 4K is heavy for older PCs. */
const MAX_WIDTH = 1920

interface Found extends OnlineBackground {
  downloadUrl: string
}

const found = new Map<string, Found>()

const ALLOWED_HOSTS: Record<OnlineProvider, RegExp> = {
  pexels: /(^|\.)pexels\.com$/i,
  pixabay: /(^|\.)pixabay\.com$/i
}

export class OnlineError extends Error {}

async function getJson(url: string, headers: Record<string, string>): Promise<unknown> {
  let res: Response
  try {
    res = await net.fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'BHCF-Presenter', ...headers } })
  } catch {
    throw new OnlineError('No internet connection. Connect and try again.')
  }
  if (res.status === 401 || res.status === 403) throw new OnlineError('The API key was not accepted. Check it in the box above (copy it again from the website).')
  if (res.status === 429) throw new OnlineError('Too many searches for now. Wait a minute and try again.')
  if (!res.ok) throw new OnlineError(`The service answered ${res.status}. Try again later.`)
  return res.json()
}

/** A small preview picture as a data URI (the window cannot load web images). */
async function thumbnail(url: string): Promise<string | null> {
  try {
    const res = await net.fetch(url, { headers: { 'User-Agent': 'BHCF-Presenter' } })
    if (!res.ok) return null
    const type = res.headers.get('content-type') ?? 'image/jpeg'
    if (!type.startsWith('image/')) return null
    const buf = Buffer.from(await res.arrayBuffer())
    return buf.length < 2_000_000 ? `data:${type};base64,${buf.toString('base64')}` : null
  } catch {
    return null
  }
}

interface PexelsFile {
  link?: string
  width?: number
  height?: number
  file_type?: string
}
interface PexelsVideo {
  id: number
  url?: string
  image?: string
  duration?: number
  width?: number
  height?: number
  user?: { name?: string }
  video_files?: PexelsFile[]
}

/** The best MP4 for a projector: the widest up to HD, else the smallest larger one. */
function pickFile<T extends { width?: number }>(files: T[]): T | undefined {
  const sorted = [...files].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))
  return sorted.find((f) => (f.width ?? 0) <= MAX_WIDTH) ?? sorted[sorted.length - 1]
}

async function searchPexels(key: string, query: string, page: number): Promise<{ results: Found[]; total: number }> {
  const url = `https://api.pexels.com/videos/search?${new URLSearchParams({ query, page: String(page), per_page: String(PER_PAGE), orientation: 'landscape', size: 'medium' })}`
  const data = (await getJson(url, { Authorization: key })) as { videos?: PexelsVideo[]; total_results?: number }
  const results: Found[] = []
  for (const v of data.videos ?? []) {
    const file = pickFile((v.video_files ?? []).filter((f) => f.file_type === 'video/mp4' && f.link))
    if (!file?.link) continue
    results.push({
      id: `pexels-${v.id}`,
      provider: 'pexels',
      title: titleFromUrl(v.url) ?? `Pexels video ${v.id}`,
      author: v.user?.name ?? '',
      pageUrl: v.url ?? 'https://www.pexels.com',
      durationSec: v.duration ?? null,
      width: file.width ?? v.width ?? null,
      height: file.height ?? v.height ?? null,
      thumbnail: v.image ? `${v.image}${v.image.includes('?') ? '&' : '?'}auto=compress&cs=tinysrgb&w=360` : null,
      downloadUrl: file.link
    })
  }
  return { results, total: data.total_results ?? results.length }
}

interface PixabayHit {
  id: number
  pageURL?: string
  tags?: string
  duration?: number
  user?: string
  videos?: Record<string, { url?: string; width?: number; height?: number; thumbnail?: string }>
}

async function searchPixabay(key: string, query: string, page: number): Promise<{ results: Found[]; total: number }> {
  const url = `https://pixabay.com/api/videos/?${new URLSearchParams({ key, q: query.slice(0, 100), page: String(page), per_page: String(PER_PAGE), safesearch: 'true' })}`
  const data = (await getJson(url, {})) as { hits?: PixabayHit[]; totalHits?: number }
  const results: Found[] = []
  for (const h of data.hits ?? []) {
    const files = Object.values(h.videos ?? {}).filter((f) => f.url)
    const file = pickFile(files)
    if (!file?.url) continue
    results.push({
      id: `pixabay-${h.id}`,
      provider: 'pixabay',
      title: (h.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean).slice(0, 3).join(', ') || `Pixabay video ${h.id}`,
      author: h.user ?? '',
      pageUrl: h.pageURL ?? 'https://pixabay.com',
      durationSec: h.duration ?? null,
      width: file.width ?? null,
      height: file.height ?? null,
      thumbnail: h.videos?.medium?.thumbnail ?? h.videos?.small?.thumbnail ?? null,
      downloadUrl: file.url
    })
  }
  return { results, total: data.totalHits ?? results.length }
}

/** "https://www.pexels.com/video/light-rays-in-clouds-12345/" → "Light rays in clouds" */
function titleFromUrl(url: string | undefined): string | null {
  const slug = url ? /\/video\/([^/]+?)(?:-\d+)?\/?$/.exec(url)?.[1] : null
  if (!slug) return null
  const words = slug.replace(/-/g, ' ').trim()
  return words ? words[0]?.toUpperCase() + words.slice(1) : null
}

export async function searchOnline(provider: OnlineProvider, key: string, query: string, page: number): Promise<{ results: OnlineBackground[]; total: number }> {
  if (!key) throw new OnlineError('Add your free API key first.')
  const q = query.trim().slice(0, 100) || 'worship background'
  const { results, total } = provider === 'pexels' ? await searchPexels(key, q, page) : await searchPixabay(key, q, page)
  for (const r of results) found.set(r.id, r)
  // Previews are fetched here, in parallel.
  const withThumbs = await Promise.all(results.map(async (r) => ({ ...r, thumbnail: r.thumbnail ? await thumbnail(r.thumbnail) : null })))
  return { results: withThumbs.map(({ downloadUrl: _skip, ...rest }) => rest), total }
}

/**
 * Downloads a search result into `<dir>/Online/`. Returns its name in the backgrounds folder
 * ("Online/….mp4"). An existing download is reused.
 */
export async function downloadOnline(dir: string, resultId: string, onProgress: (percent: number) => void): Promise<string> {
  const r = found.get(resultId)
  if (!r) throw new OnlineError('Search again, then add the video.')
  const url = new URL(r.downloadUrl)
  if (url.protocol !== 'https:' || !ALLOWED_HOSTS[r.provider].test(url.hostname)) throw new OnlineError('That download address is not allowed.')
  const folder = path.join(dir, 'Online')
  await fs.mkdir(folder, { recursive: true })
  const providerName = r.provider === 'pexels' ? 'Pexels' : 'Pixabay'
  const fileName = `${sanitizeFileName(r.title, 'Background').slice(0, 60)} (${providerName} ${r.id.split('-')[1]}).mp4`
  const target = path.join(folder, fileName)
  try {
    await fs.access(target)
    return `Online/${fileName}`
  } catch {
    /* not downloaded yet */
  }
  let res: Response
  try {
    res = await net.fetch(url.toString(), { headers: { 'User-Agent': 'BHCF-Presenter' } })
  } catch {
    throw new OnlineError('No internet connection. Connect and try again.')
  }
  if (!res.ok || !res.body) throw new OnlineError(`The download failed (${res.status}). Try again.`)
  const total = Number(res.headers.get('content-length')) || 0
  const part = `${target}.part`
  const out = createWriteStream(part)
  let received = 0
  let lastPercent = -1
  try {
    const reader = res.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      received += value.byteLength
      if (!out.write(Buffer.from(value))) await new Promise<void>((resolve) => out.once('drain', () => resolve()))
      const percent = total ? Math.floor((received / total) * 100) : 0
      if (percent !== lastPercent) {
        lastPercent = percent
        onProgress(percent)
      }
    }
    await new Promise<void>((resolve, reject) => out.end((err?: Error | null) => (err ? reject(err) : resolve())))
    await fs.rename(part, target)
  } catch (err) {
    out.destroy()
    await fs.rm(part, { force: true }).catch(() => undefined)
    throw err instanceof OnlineError ? err : new OnlineError('The download was interrupted. Try again.')
  }
  log('info', `Downloaded online background "${r.title}" from ${providerName} (${Math.round(received / 1e6)} MB)`)
  return `Online/${fileName}`
}

/** The provider page of a found video (for credit), checked to be on the provider's site. */
export function pageOf(resultId: string): string | null {
  const r = found.get(resultId)
  if (!r) return null
  try {
    const u = new URL(r.pageUrl)
    return u.protocol === 'https:' && ALLOWED_HOSTS[r.provider].test(u.hostname) ? u.toString() : null
  } catch {
    return null
  }
}

/** Sign-up pages for the free keys, the only other web pages this feature opens. */
export const KEY_PAGES: Record<OnlineProvider, string> = {
  pexels: 'https://www.pexels.com/api/',
  pixabay: 'https://pixabay.com/api/docs/'
}
