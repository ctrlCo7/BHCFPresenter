/**
 * `bhcf-media://project/<fileName>` serves files from the open project's media folder.
 *
 * Implements HTTP range requests itself so <video>/<audio> can seek and stream large files
 * without loading them into memory, and refuses anything that resolves outside the folder.
 */
import { createReadStream, promises as fs } from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { protocol } from 'electron'
import { MEDIA_PROTOCOL, mediaTypeFor, PW_BACKGROUNDS_DIR } from '../../shared/media'
import { isInside } from '../util/fsx'

/** Must run before app 'ready'. */
export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MEDIA_PROTOCOL,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true }
    }
  ])
}

function parseRange(header: string, size: number): { start: number; end: number } | null {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!m) return null
  let start: number
  let end: number
  if (m[1] === '' && m[2] !== '') {
    // Suffix range: last N bytes.
    const n = Number(m[2])
    start = Math.max(0, size - n)
    end = size - 1
  } else {
    start = Number(m[1])
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1)
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return null
  return { start, end }
}

/**
 * Hosts: "project" = the open project's media folder; "library" = the backgrounds folder on this
 * computer (previews in Templates → My Backgrounds, streamed without copying).
 */
export function handleMediaProtocol(getMediaDir: () => string | null, getLibraryDir: () => string | null): void {
  protocol.handle(MEDIA_PROTOCOL, async (request) => {
    const url = new URL(request.url)
    const mediaDir = url.host === 'library' ? getLibraryDir() : getMediaDir()
    if (!mediaDir) return new Response('No folder', { status: 404 })

    let fileName: string
    try {
      fileName = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
    } catch {
      return new Response('Bad request', { status: 400 })
    }
    let filePath = path.resolve(mediaDir, fileName)
    if ((url.host !== 'project' && url.host !== 'library') || !isInside(mediaDir, filePath)) return new Response('Forbidden', { status: 403 })

    const statFile = (p: string): Promise<number | null> => fs.stat(p).then((st) => (st.isFile() ? st.size : null), () => null)
    let size = await statFile(filePath)
    if (size === null && url.host === 'project') {
      // Templates backgrounds moved into "P&W Backgrounds/" (or a record from before the move, e.g. after undo).
      const base = path.basename(filePath)
      const alt = fileName.includes('/') ? path.resolve(mediaDir, base) : path.resolve(mediaDir, PW_BACKGROUNDS_DIR, base)
      if (isInside(mediaDir, alt)) {
        size = await statFile(alt)
        if (size !== null) filePath = alt
      }
    }
    if (size === null) return new Response('Not found', { status: 404 })

    const contentType = mediaTypeFor(fileName)?.mimeType ?? 'application/octet-stream'
    // CORS lets the renderer draw video frames to a canvas (poster thumbnails) without tainting it.
    const baseHeaders = { 'Content-Type': contentType, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' }
    const rangeHeader = request.headers.get('range')

    if (rangeHeader) {
      const range = parseRange(rangeHeader, size)
      if (!range) {
        return new Response(null, { status: 416, headers: { ...baseHeaders, 'Content-Range': `bytes */${size}` } })
      }
      const stream = createReadStream(filePath, { start: range.start, end: range.end })
      return new Response(Readable.toWeb(stream) as ReadableStream, {
        status: 206,
        headers: {
          ...baseHeaders,
          'Content-Length': String(range.end - range.start + 1),
          'Content-Range': `bytes ${range.start}-${range.end}/${size}`
        }
      })
    }

    const stream = createReadStream(filePath)
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      status: 200,
      headers: { ...baseHeaders, 'Content-Length': String(size) }
    })
  })
}
