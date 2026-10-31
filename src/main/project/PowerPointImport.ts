/**
 * PowerPoint import: reads .pptx files (and .ppt, converted by PowerPoint when it is installed),
 * copies their pictures into the project's media folder and returns the parsed slides. The
 * renderer turns them into an editable presentation (shared/pptx deckToSlides).
 */
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { PowerPointDeck } from '../../shared/ipc'
import { mediaTypeFor } from '../../shared/media'
import type { MediaAsset } from '../../shared/model/types'
import { parsePptx } from '../../shared/pptx'
import { readZip } from '../songs/songFiles'
import { sanitizeFileName } from '../util/fsx'
import { log } from '../util/log'

const MAX_FILE_BYTES = 500 * 1024 * 1024

/**
 * Converts an old binary .ppt to .pptx with PowerPoint (Windows, PowerPoint installed). Paths go
 * through environment variables, never into the script text.
 */
function convertWithPowerPoint(source: string, target: string): Promise<void> {
  if (process.platform !== 'win32') return Promise.reject(new Error('Old .ppt files need PowerPoint to convert them. Open it in PowerPoint and save it as .pptx.'))
  const script = [
    "$ErrorActionPreference = 'Stop'",
    '$app = New-Object -ComObject PowerPoint.Application',
    '$before = $app.Presentations.Count',
    // Open(FileName, ReadOnly, Untitled, WithWindow); 24 = ppSaveAsOpenXMLPresentation
    '$p = $app.Presentations.Open($env:BHCF_PPT_SOURCE, -1, 0, 0)',
    'try { $p.SaveAs($env:BHCF_PPT_TARGET, 24) } finally { $p.Close() }',
    'if ($before -eq 0) { $app.Quit() }'
  ].join('; ')
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { env: { ...process.env, BHCF_PPT_SOURCE: source, BHCF_PPT_TARGET: target }, timeout: 180_000, windowsHide: true },
      (err, _stdout, stderr) => {
        if (!err) return resolve()
        log('warn', `PowerPoint conversion failed: ${String(stderr || err.message).split('\n')[0]}`)
        reject(new Error('This is an old .ppt file and PowerPoint could not convert it. Open it in PowerPoint, choose File → Save As → PowerPoint Presentation (.pptx), then import that file.'))
      }
    )
  })
}

/** Reads one file: its slides plus the pictures, copied into `mediaDir`. */
async function importOne(mediaDir: string, file: string): Promise<PowerPointDeck> {
  const name = path.basename(file).replace(/\.[^.]+$/, '')
  let source = file
  let temp: string | null = null
  if (/\.ppt$/i.test(file)) {
    temp = path.join(os.tmpdir(), `bhcf-${randomUUID()}.pptx`)
    await convertWithPowerPoint(file, temp)
    source = temp
  }
  try {
    const stat = await fs.stat(source)
    if (stat.size > MAX_FILE_BYTES) throw new Error('The file is too large (over 500 MB).')
    const zip = readZip(await fs.readFile(source))
    const deck = parsePptx((p) => zip.get(p)?.toString('utf8') ?? null)
    if (deck.slides.length === 0) throw new Error('No slides found.')

    await fs.mkdir(mediaDir, { recursive: true })
    const media: MediaAsset[] = []
    const mediaFor: Record<string, string> = {}
    let unsupported = 0
    for (const image of deck.images) {
      const data = zip.get(image)
      const type = mediaTypeFor(image)
      if (!data || !type || type.kind !== 'image') {
        unsupported++
        continue
      }
      const id = randomUUID()
      const ext = path.extname(image).toLowerCase()
      const base = sanitizeFileName(`${name}-${path.basename(image, ext)}`, 'slide-image').slice(0, 60)
      const fileName = `${base}-${id.slice(0, 8)}${ext}`
      await fs.writeFile(path.join(mediaDir, fileName), data, { flag: 'wx' })
      mediaFor[image] = id
      media.push({ id, name: `${name} · ${path.basename(image, ext)}`, kind: 'image', fileName, originalName: path.basename(image), mimeType: type.mimeType, sizeBytes: data.length, width: null, height: null, durationSec: null, thumbnail: null, importedAt: new Date().toISOString() })
    }
    // Freeform shapes, drawn as SVG; pictures inside them are embedded.
    for (const [key, svg] of Object.entries(deck.svgs)) {
      const filled = svg.replace(/\{\{img:([^}]+)\}\}/g, (_m, image: string) => {
        const data = zip.get(image.replace(/&amp;/g, '&'))
        const type = mediaTypeFor(image)
        return data && type?.kind === 'image' ? `data:${type.mimeType};base64,${data.toString('base64')}` : ''
      })
      const id = randomUUID()
      const fileName = `${sanitizeFileName(name, 'shape').slice(0, 40)}-shape-${id.slice(0, 8)}.svg`
      const data = Buffer.from(filled, 'utf8')
      await fs.writeFile(path.join(mediaDir, fileName), data, { flag: 'wx' })
      mediaFor[key] = id
      media.push({ id, name: `${name} · shape`, kind: 'image', fileName, originalName: fileName, mimeType: 'image/svg+xml', sizeBytes: data.length, width: null, height: null, durationSec: null, thumbnail: null, importedAt: new Date().toISOString() })
    }
    // Windows metafiles (.emf/.wmf) and TIFF pictures cannot be shown by the app.
    const skipped = unsupported ? [...deck.skipped, `${unsupported} picture${unsupported === 1 ? '' : 's'} in a format the app cannot show (e.g. .emf)`] : deck.skipped
    log('info', `Imported PowerPoint "${name}": ${deck.slides.length} slides, ${media.length} pictures${skipped.length ? `; skipped ${skipped.join(', ')}` : ''}`)
    return { name, deck: { ...deck, skipped }, media, mediaFor }
  } finally {
    if (temp) await fs.rm(temp, { force: true }).catch(() => undefined)
  }
}

export async function importPowerPointFiles(mediaDir: string, files: string[]): Promise<{ decks: PowerPointDeck[]; errors: string[] }> {
  const decks: PowerPointDeck[] = []
  const errors: string[] = []
  for (const file of files) {
    try {
      decks.push(await importOne(mediaDir, file))
    } catch (err) {
      errors.push(`${path.basename(file)}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return { decks, errors }
}
