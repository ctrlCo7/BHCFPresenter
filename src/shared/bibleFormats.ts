/**
 * Converts common Bible file formats into BHCF's format so users can import translations
 * they are licensed to use:
 *
 *  - BHCF JSON          { format: "bhcf-bible", … }
 *  - Zefania XML        <XMLBIBLE><BIBLEBOOK bnumber bname><CHAPTER cnumber><VERS vnumber>…
 *  - "books" JSON       { translation?, books: [{ name, chapters: [{ chapter, verses: [{ verse, text }] }] }] }
 *  - array JSON         [{ name?, abbrev?, chapters: [["v1", "v2"], …] }, …]
 */
import { validateBibleData, type BibleData } from './bible'

export const ENGLISH_BOOKS =
  'Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|Ruth|1 Samuel|2 Samuel|1 Kings|2 Kings|1 Chronicles|2 Chronicles|Ezra|Nehemiah|Esther|Job|Psalms|Proverbs|Ecclesiastes|Song of Solomon|Isaiah|Jeremiah|Lamentations|Ezekiel|Daniel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|Matthew|Mark|Luke|John|Acts|Romans|1 Corinthians|2 Corinthians|Galatians|Ephesians|Philippians|Colossians|1 Thessalonians|2 Thessalonians|1 Timothy|2 Timothy|Titus|Philemon|Hebrews|James|1 Peter|2 Peter|1 John|2 John|3 John|Jude|Revelation'.split(
    '|'
  )

export const ENGLISH_ABBREVS =
  'Gen|Exod|Lev|Num|Deut|Josh|Judg|Ruth|1Sam|2Sam|1Kgs|2Kgs|1Chr|2Chr|Ezra|Neh|Esth|Job|Ps|Prov|Eccl|Song|Isa|Jer|Lam|Ezek|Dan|Hos|Joel|Amos|Obad|Jonah|Mic|Nah|Hab|Zeph|Hag|Zech|Mal|Matt|Mark|Luke|John|Acts|Rom|1Cor|2Cor|Gal|Eph|Phil|Col|1Thess|2Thess|1Tim|2Tim|Titus|Phlm|Heb|Jas|1Pet|2Pet|1John|2John|3John|Jude|Rev'.split(
    '|'
  )

export interface BibleMeta {
  id: string
  name: string
  abbreviation: string
}

const clean = (s: string): string => s.replace(/\s+/g, ' ').trim()

/** Book list normalised: standard English abbreviations for 66-book Bibles so references like "jn 3:16" work in any language. */
function finish(books: { name: string; chapters: string[][] }[], meta: BibleMeta, language = 'und', copyright = ''): BibleData {
  const standard = books.length === 66
  return validateBibleData({
    format: 'bhcf-bible',
    version: 1,
    id: meta.id,
    name: meta.name,
    abbreviation: meta.abbreviation,
    language,
    copyright,
    books: books.map((b, i) => ({
      name: b.name || ENGLISH_BOOKS[i] || `Book ${i + 1}`,
      abbrev: standard ? (ENGLISH_ABBREVS[i] as string) : (b.name || `B${i + 1}`).slice(0, 5),
      chapters: b.chapters.map((c) => Array.from(c, (v) => clean(v ?? '')))
    }))
  })
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
}

const attr = (tag: string, name: string): string | null => new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i').exec(tag)?.[1] ?? null

function parseZefania(xml: string, meta: BibleMeta): BibleData {
  const title = /<TITLE>([\s\S]*?)<\/TITLE>/i.exec(xml)?.[1]
  const books: { name: string; chapters: string[][] }[] = []
  const bookRe = /<BIBLEBOOK\b([^>]*)>([\s\S]*?)<\/BIBLEBOOK>/gi
  for (let b = bookRe.exec(xml); b; b = bookRe.exec(xml)) {
    const index = Number(attr(b[1] as string, 'bnumber') ?? books.length + 1) - 1
    const name = decodeEntities(attr(b[1] as string, 'bname') ?? '')
    const chapters: string[][] = []
    const chRe = /<CHAPTER\b([^>]*)>([\s\S]*?)<\/CHAPTER>/gi
    for (let c = chRe.exec(b[2] as string); c; c = chRe.exec(b[2] as string)) {
      const cn = Number(attr(c[1] as string, 'cnumber') ?? chapters.length + 1)
      const verses: string[] = []
      const vRe = /<VERS\b([^>]*)>([\s\S]*?)<\/VERS>/gi
      for (let v = vRe.exec(c[2] as string); v; v = vRe.exec(c[2] as string)) {
        const vn = Number(attr(v[1] as string, 'vnumber') ?? verses.length + 1)
        // Drop footnotes / cross references, then all remaining tags.
        const text = (v[2] as string).replace(/<(NOTE|XREF|GRAM|DIV)\b[\s\S]*?<\/\1>/gi, '').replace(/<[^>]+>/g, '')
        verses[vn - 1] = decodeEntities(text)
      }
      chapters[cn - 1] = Array.from(verses, (x) => x ?? '')
    }
    books[index >= 0 && index < 200 ? index : books.length] = { name, chapters: Array.from(chapters, (x) => x ?? []) }
  }
  const list = books.filter(Boolean)
  if (list.length === 0) throw new Error('No books found in the XML file.')
  return finish(list, { ...meta, name: title ? clean(decodeEntities(title)) : meta.name })
}

interface BooksJson {
  translation?: string
  books: { name?: string; chapters: { chapter?: number; verses: { verse?: number; text?: string }[] }[] }[]
}

function parseBooksJson(doc: BooksJson, meta: BibleMeta): BibleData {
  const books = doc.books.map((b) => {
    const chapters: string[][] = []
    b.chapters.forEach((c, ci) => {
      const verses: string[] = []
      c.verses.forEach((v, vi) => {
        verses[(v.verse ?? vi + 1) - 1] = String(v.text ?? '')
      })
      chapters[(c.chapter ?? ci + 1) - 1] = Array.from(verses, (x) => x ?? '')
    })
    return { name: b.name ?? '', chapters: Array.from(chapters, (x) => x ?? []) }
  })
  const title = typeof doc.translation === 'string' ? doc.translation : ''
  // "BSB: Berean Standard Bible" → abbreviation + name
  const m = /^([\w-]{2,12}):\s*(.+)$/.exec(title)
  return finish(books, { ...meta, name: m ? (m[2] as string) : title || meta.name, abbreviation: m ? (m[1] as string) : meta.abbreviation })
}

function parseArrayJson(doc: { name?: string; abbrev?: string; chapters: string[][] }[], meta: BibleMeta): BibleData {
  // Book names in such files are often abbreviations or another language; prefer English names for 66-book Bibles.
  const books = doc.map((b, i) => ({ name: doc.length === 66 ? (ENGLISH_BOOKS[i] as string) : (b.name ?? `Book ${i + 1}`), chapters: b.chapters }))
  return finish(books, meta)
}

/** Detects the format and converts. `meta` supplies id/name/abbreviation when the file has none. */
export function convertBibleFile(text: string, meta: BibleMeta): BibleData {
  const t = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const trimmed = t.trimStart()
  if (trimmed.startsWith('<')) {
    if (!/<XMLBIBLE\b/i.test(trimmed)) throw new Error('Unsupported XML Bible format (Zefania XML is supported).')
    return parseZefania(trimmed, meta)
  }
  let doc: unknown
  try {
    doc = JSON.parse(trimmed)
  } catch {
    throw new Error('The file is neither valid JSON nor Zefania XML.')
  }
  if (doc && typeof doc === 'object' && (doc as { format?: string }).format === 'bhcf-bible') return validateBibleData(doc)
  if (Array.isArray(doc) && doc.every((b) => b && Array.isArray((b as { chapters?: unknown }).chapters))) return parseArrayJson(doc as never, meta)
  if (doc && typeof doc === 'object' && Array.isArray((doc as BooksJson).books)) return parseBooksJson(doc as BooksJson, meta)
  throw new Error('Unrecognised Bible file. Supported: BHCF JSON, Zefania XML, and common JSON layouts.')
}

/** Default id/name/abbreviation from a file name like "NIV2011.xml". */
export function metaFromFileName(fileName: string): BibleMeta {
  const base = fileName.replace(/\.[^.]+$/, '')
  const id = base.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'bible'
  return { id, name: base, abbreviation: base.replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase() || 'BIBLE' }
}
