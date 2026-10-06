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
import { MEDIA_PROTOCOL, mediaTypeFor } from '../../shared/media'
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

export function handleMediaProtocol(getMediaDir: () => string | null): void {
  protocol.handle(MEDIA_PROTOCOL, async (request) => {
    const mediaDir = getMediaDir()
    if (!mediaDir) return new Response('No project open', { status: 404 })

    const url = new URL(request.url)
    let fileName: string
    try {
      fileName = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
    } catch {
      return new Response('Bad request', { status: 400 })
    }
    const filePath = path.resolve(mediaDir, fileName)
    if (url.host !== 'project' || !isInside(mediaDir, filePath)) return new Response('Forbidden', { status: 403 })

    let size: number
    try {
      const stat = await fs.stat(filePath)
      if (!stat.isFile()) return new Response('Not found', { status: 404 })
      size = stat.size
    } catch {
      return new Response('Not found', { status: 404 })
    }

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
