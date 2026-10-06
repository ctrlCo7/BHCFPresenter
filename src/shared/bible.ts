/** Bible data types and scripture-reference parsing (pure, shared by main and renderer). */

export interface BibleData {
  format: 'bhcf-bible'
  version: 1
  id: string
  name: string
  abbreviation: string
  language: string
  copyright: string
  books: { name: string; abbrev: string; chapters: string[][] }[]
}

export interface BibleInfo {
  id: string
  name: string
  abbreviation: string
  language: string
  copyright: string
  builtIn: boolean
}

export interface BibleBook {
  index: number
  name: string
  abbrev: string
  /** Verse count per chapter */
  verseCounts: number[]
}

export interface Verse {
  book: number
  chapter: number
  verse: number
  text: string
}

export interface ScriptureRef {
  book: number
  chapter: number
  verseStart: number | null
  verseEnd: number | null
}

const ALIASES: Record<string, string> = {
  jn: 'john',
  jhn: 'john',
  mt: 'matthew',
  mk: 'mark',
  mrk: 'mark',
  lk: 'luke',
  ps: 'psalms',
  psa: 'psalms',
  psalm: 'psalms',
  pr: 'proverbs',
  prov: 'proverbs',
  song: 'songofsolomon',
  sos: 'songofsolomon',
  songofsongs: 'songofsolomon',
  canticles: 'songofsolomon',
  rev: 'revelation',
  revelations: 'revelation',
  phil: 'philippians',
  phlm: 'philemon',
  jas: 'james',
  jud: 'jude',
  jdg: 'judges',
  judg: 'judges'
}

const key = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** Resolves a (possibly abbreviated) book name to its index. */
export function findBook(books: { name: string; abbrev: string }[], input: string): number | null {
  let k = key(input)
  if (!k) return null
  // "1st john" / "first john" / "i john"
  k = k.replace(/^(first|1st|i)(?=[a-z])/, '1').replace(/^(second|2nd|ii)(?=[a-z])/, '2').replace(/^(third|3rd|iii)(?=[a-z])/, '3')
  const numPrefix = /^[123]/.exec(k)?.[0] ?? ''
  const restKey = k.slice(numPrefix.length)
  const alias = ALIASES[restKey]
  const target = alias ? numPrefix + alias : k
  const exact = books.findIndex((b) => key(b.name) === target || key(b.abbrev) === target)
  if (exact >= 0) return exact
  const prefix = books.findIndex((b) => key(b.name).startsWith(target))
  return prefix >= 0 ? prefix : null
}

/** Parses "John 3:16", "jn 3:16-18", "1 Cor 13", "Psalm 23:1–6". */
export function parseReference(books: { name: string; abbrev: string }[], input: string): ScriptureRef | null {
  const m = /^\s*((?:[1-3]\s*)?[^\d]+?)\s*(\d+)(?:\s*[:.]\s*(\d+)(?:\s*[-–—]\s*(\d+))?)?\s*$/.exec(input)
  if (!m) return null
  const book = findBook(books, m[1] as string)
  if (book === null) return null
  const chapter = Number(m[2])
  const verseStart = m[3] ? Number(m[3]) : null
  const verseEnd = m[4] ? Number(m[4]) : verseStart
  if (verseStart !== null && verseEnd !== null && verseEnd < verseStart) return null
  return { book, chapter, verseStart, verseEnd }
}

/** "John 3:16", "John 3:16–18", "John 3:16, 18" (non-contiguous verses are comma-joined). */
export function formatReference(bookName: string, chapter: number, verses: number[]): string {
  if (verses.length === 0) return `${bookName} ${chapter}`
  const sorted = [...new Set(verses)].sort((a, b) => a - b)
  const parts: string[] = []
  let start = sorted[0] as number
  let prev = start
  for (const v of sorted.slice(1).concat(Number.NaN)) {
    if (v === prev + 1) {
      prev = v
      continue
    }
    parts.push(start === prev ? String(start) : `${start}–${prev}`)
    start = v
    prev = v
  }
  return `${bookName} ${chapter}:${parts.join(', ')}`
}

const SUPERSCRIPT = '⁰¹²³⁴⁵⁶⁷⁸⁹'
export function superscriptNumber(n: number): string {
  return String(n)
    .split('')
    .map((d) => SUPERSCRIPT[Number(d)] ?? d)
    .join('')
}

export function validateBibleData(raw: unknown): BibleData {
  const b = raw as Partial<BibleData> | null
  if (!b || typeof b !== 'object' || b.format !== 'bhcf-bible') throw new Error('Not a BHCF Bible file (expected "format": "bhcf-bible").')
  if (typeof b.id !== 'string' || !/^[\w-]{1,32}$/.test(b.id)) throw new Error('The Bible file needs a short "id" (letters, digits, - or _).')
  if (typeof b.name !== 'string' || !Array.isArray(b.books) || b.books.length === 0) throw new Error('The Bible file is missing its name or books.')
  for (const book of b.books) {
    if (!book || typeof book.name !== 'string' || !Array.isArray(book.chapters)) throw new Error('A book in the Bible file is malformed.')
    for (const ch of book.chapters) if (!Array.isArray(ch) || ch.some((v) => typeof v !== 'string')) throw new Error(`${book.name}: chapters must be arrays of verse strings.`)
  }
  return {
    format: 'bhcf-bible',
    version: 1,
    id: b.id,
    name: b.name,
    abbreviation: typeof b.abbreviation === 'string' ? b.abbreviation : b.id.toUpperCase(),
    language: typeof b.language === 'string' ? b.language : 'en',
    copyright: typeof b.copyright === 'string' ? b.copyright : '',
    books: b.books.map((x) => ({ name: x.name, abbrev: typeof x.abbrev === 'string' ? x.abbrev : x.name.slice(0, 4), chapters: x.chapters }))
  }
}
