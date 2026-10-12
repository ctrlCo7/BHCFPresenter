/**
 * Reads song files for import: plain text, ChordPro, OpenLyrics (XML) and the text of a
 * PowerPoint (.pptx) deck, one entry per slide. Conversion into songs happens in the renderer
 * (shared/songImport), so this side only reads and unzips.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { inflateRawSync } from 'node:zlib'
import { songFileFormat, type SongFile } from '../../shared/songImport'
import { decodeXmlEntities } from '../../shared/xml'

const MAX_FILE_BYTES = 60 * 1024 * 1024
const MAX_ENTRY_BYTES = 20 * 1024 * 1024

/** Text with a UTF-8 or UTF-16 byte-order mark (Windows Notepad), else UTF-8. */
export function decodeText(buf: Buffer): string {
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString('utf16le')
  if (buf[0] === 0xfe && buf[1] === 0xff) {
    const swapped = Buffer.from(buf.subarray(2))
    swapped.swap16()
    return swapped.toString('utf16le')
  }
  return buf.toString('utf8').replace(/^﻿/, '')
}

/** The files of a ZIP archive (what a .pptx is), by name. Only stored and deflated entries. */
export function readZip(buf: Buffer): Map<string, Buffer> {
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('Not a valid .pptx (zip) file.')
  const count = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)
  const files = new Map<string, Buffer>()
  for (let n = 0; n < count && p + 46 <= buf.length; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break
    const method = buf.readUInt16LE(p + 10)
    const compSize = buf.readUInt32LE(p + 20)
    const size = buf.readUInt32LE(p + 24)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const local = buf.readUInt32LE(p + 42)
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen)
    p += 46 + nameLen + extraLen + commentLen
    if (size > MAX_ENTRY_BYTES || local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50) continue
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28)
    const data = buf.subarray(start, start + compSize)
    if (method === 0) files.set(name, data)
    else if (method === 8) files.set(name, inflateRawSync(data, { maxOutputLength: MAX_ENTRY_BYTES }))
  }
  return files
}

/** Text of each slide of a .pptx, in presentation order; paragraphs become lines. */
export function pptxSlideTexts(buf: Buffer): string[] {
  const zip = readZip(buf)
  const xml = (name: string): string => zip.get(name)?.toString('utf8') ?? ''
  // Slide order: presentation.xml lists relationship ids; the .rels file maps them to files.
  const rels = new Map<string, string>()
  for (const m of xml('ppt/_rels/presentation.xml.rels').matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /\bId="([^"]+)"/.exec(m[0])?.[1]
    const target = /\bTarget="([^"]+)"/.exec(m[0])?.[1]
    if (id && target) rels.set(id, path.posix.normalize(path.posix.join('ppt', target.replace(/^\//, ''))).replace(/^ppt\/ppt\//, 'ppt/'))
  }
  let order = [...xml('ppt/presentation.xml').matchAll(/<p:sldId\b[^>]*\br:id="([^"]+)"/g)].flatMap((m) => {
    const file = rels.get(m[1] as string)
    return file && zip.has(file) ? [file] : []
  })
  if (order.length === 0) {
    const num = (f: string): number => Number(/slide(\d+)\.xml$/.exec(f)?.[1] ?? 0)
    order = [...zip.keys()].filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f)).sort((a, b) => num(a) - num(b))
  }
  return order.map((file) =>
    [...xml(file).matchAll(/<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g)]
      .map((p) =>
        (p[1] as string)
          .replace(/<a:br\b[^>]*\/>/g, '\n')
          .replace(/<a:t(?:\s[^>]*)?>([^<]*)<\/a:t>|<[^>]+>/g, (_m, t: string | undefined) => (t === undefined ? '' : decodeXmlEntities(t)))
          .trim()
      )
      .join('\n')
      .trim()
  )
}

/** Reads the chosen files; unreadable ones are reported, not thrown. */
export async function readSongFiles(paths: string[]): Promise<{ files: SongFile[]; errors: string[] }> {
  const files: SongFile[] = []
  const errors: string[] = []
  for (const filePath of paths) {
    const base = path.basename(filePath)
    const name = base.replace(/\.[^.]+$/, '')
    try {
      const format = songFileFormat(base)
      if (!format) throw new Error('Unsupported file type.')
      const stat = await fs.stat(filePath)
      if (stat.size > MAX_FILE_BYTES) throw new Error('File is too large.')
      const buf = await fs.readFile(filePath)
      if (format === 'pptx') files.push({ name, format, slides: pptxSlideTexts(buf) })
      else files.push({ name, format, text: decodeText(buf) })
    } catch (err) {
      errors.push(`${base}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return { files, errors }
}
