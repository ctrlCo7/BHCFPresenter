/**
 * Bible translations. Built-in translations ship in resources/bibles; users can import more
 * (stored in <userData>/bibles). Listing reads only each file's small header; full texts are
 * parsed on demand and at most MAX_LOADED stay in memory.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { validateBibleData, type BibleBook, type BibleData, type BibleInfo, type Verse } from '../../shared/bible'
import { convertBibleFile, metaFromFileName } from '../../shared/bibleFormats'
import { AppError, readJson, writeFileAtomic } from '../util/fsx'
import { log } from '../util/log'

interface Entry {
  file: string
  builtIn: boolean
  info?: BibleInfo
}

const MAX_LOADED = 3
const HEAD_BYTES = 2048

const fold = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

/** Preferred order for built-in translations in the picker. */
const ORDER = ['kjv', 'bsb', 'nheb', 'asv', 'ylt', 'bbe', 'tagab', 'cebpin']

export class BibleService {
  private entries = new Map<string, Entry>()
  private loaded = new Map<string, BibleData>()
  private scanned = false

  private builtInDir(): string {
    return app.isPackaged ? path.join(process.resourcesPath, 'bibles') : path.join(app.getAppPath(), 'resources', 'bibles')
  }

  private userDir(): string {
    return path.join(app.getPath('userData'), 'bibles')
  }

  private async scan(): Promise<void> {
    if (this.scanned) return
    this.scanned = true
    for (const [dir, builtIn] of [
      [this.builtInDir(), true],
      [this.userDir(), false]
    ] as const) {
      let names: string[] = []
      try {
        names = await fs.readdir(dir)
      } catch {
        continue
      }
      for (const name of names) {
        if (!name.endsWith('.json')) continue
        const id = name.slice(0, -5)
        if (!this.entries.has(id)) this.entries.set(id, { file: path.join(dir, name), builtIn })
      }
    }
  }

  /** Reads the metadata at the start of a BHCF Bible file without parsing the whole text. */
  private async readInfo(id: string, entry: Entry): Promise<BibleInfo> {
    if (entry.info) return entry.info
    let head = ''
    const fh = await fs.open(entry.file, 'r')
    try {
      const buf = Buffer.alloc(HEAD_BYTES)
      const { bytesRead } = await fh.read(buf, 0, HEAD_BYTES, 0)
      head = buf.subarray(0, bytesRead).toString('utf8')
    } finally {
      await fh.close()
    }
    const cut = head.indexOf(',"books":')
    let meta: Partial<BibleData> | null = null
    if (cut > 0) {
      try {
        meta = JSON.parse(`${head.slice(0, cut)}}`) as Partial<BibleData>
      } catch {
        meta = null
      }
    }
    if (!meta || meta.format !== 'bhcf-bible') {
      const full = await this.load(id)
      meta = full
    }
    entry.info = {
      id,
      name: String(meta.name ?? id),
      abbreviation: String(meta.abbreviation ?? id.toUpperCase()),
      language: String(meta.language ?? ''),
      copyright: String(meta.copyright ?? ''),
      builtIn: entry.builtIn
    }
    return entry.info
  }

  private async load(id: string): Promise<BibleData> {
    await this.scan()
    const cached = this.loaded.get(id)
    if (cached) {
      // Refresh LRU position.
      this.loaded.delete(id)
      this.loaded.set(id, cached)
      return cached
    }
    const entry = this.entries.get(id)
    if (!entry) throw new AppError('BIBLE_NOT_FOUND', `Bible translation "${id}" is not installed.`)
    let data: BibleData
    try {
      data = validateBibleData(await readJson(entry.file))
    } catch (err) {
      log('error', `Bible ${id} failed to load`, err)
      throw new AppError('BIBLE_INVALID', `The ${id} Bible file could not be read: ${(err as Error).message}`)
    }
    this.loaded.set(id, data)
    while (this.loaded.size > MAX_LOADED) this.loaded.delete(this.loaded.keys().next().value as string)
    return data
  }

  async list(): Promise<BibleInfo[]> {
    await this.scan()
    const out: BibleInfo[] = []
    for (const [id, e] of this.entries) {
      try {
        out.push(await this.readInfo(id, e))
      } catch (err) {
        log('warn', `Skipping unreadable Bible ${id}`, err)
      }
    }
    const rank = (b: BibleInfo): number => {
      const i = ORDER.indexOf(b.id)
      return b.builtIn ? (i < 0 ? 50 : i) : 100
    }
    return out.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
  }

  async books(id: string): Promise<BibleBook[]> {
    const d = await this.load(id)
    return d.books.map((b, index) => ({ index, name: b.name, abbrev: b.abbrev, verseCounts: b.chapters.map((c) => c.length) }))
  }

  async chapter(id: string, book: number, chapter: number): Promise<Verse[]> {
    const d = await this.load(id)
    const verses = d.books[book]?.chapters[chapter - 1]
    if (!verses) throw new AppError('BIBLE_RANGE', 'That chapter does not exist in this translation.')
    return verses.map((text, i) => ({ book, chapter, verse: i + 1, text }))
  }

  /** Every query word must appear in the verse (accent/case-insensitive). */
  async search(id: string, query: string, limit = 200): Promise<Verse[]> {
    const terms = fold(query).split(/\s+/).filter((t) => t.length > 0)
    if (terms.length === 0) return []
    const d = await this.load(id)
    const out: Verse[] = []
    for (let b = 0; b < d.books.length; b++) {
      const chapters = d.books[b]?.chapters ?? []
      for (let c = 0; c < chapters.length; c++) {
        const verses = chapters[c] ?? []
        for (let v = 0; v < verses.length; v++) {
          const text = verses[v] as string
          if (!text) continue
          const f = fold(text)
          if (terms.every((t) => f.includes(t))) {
            out.push({ book: b, chapter: c + 1, verse: v + 1, text })
            if (out.length >= limit) return out
          }
        }
      }
    }
    return out
  }

  /** Converts (Zefania XML / JSON) and installs a translation file; returns its info. */
  async importFile(file: string): Promise<BibleInfo> {
    let data: BibleData
    try {
      data = convertBibleFile(await fs.readFile(file, 'utf8'), metaFromFileName(path.basename(file)))
    } catch (err) {
      throw new AppError('BIBLE_INVALID', (err as Error).message)
    }
    await this.scan()
    let id = data.id
    for (let i = 2; this.entries.has(id); i++) id = `${data.id}-${i}`
    data = { ...data, id }
    const target = path.join(this.userDir(), `${id}.json`)
    // Key order puts metadata before "books" so listing can read just the header.
    await writeFileAtomic(target, JSON.stringify(data))
    const entry: Entry = { file: target, builtIn: false }
    this.entries.set(id, entry)
    return this.readInfo(id, entry)
  }
}
