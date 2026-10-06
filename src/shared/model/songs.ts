/**
 * Lyrics → song sections → slides.
 *
 * Built for copy-paste: lyrics from song sites, chord charts or SongSelect can be pasted as-is.
 *  - Headings: "[Verse 1]", "Verse 1:", "VERSE ONE", "V1", "(Chorus)", "Chorus x2", "PC", "Bridge"…
 *  - Repeats: "Repeat Chorus", "(Chorus x2)", or a heading with no lines reuse the earlier section.
 *  - Chord-only lines are dropped; CCLI numbers / copyright lines are picked up as metadata.
 *  - Text without any headings becomes Verse 1, Verse 2… (blank lines separate them).
 * Each section becomes one or more slides with balanced line counts.
 */
import { createTextElement, newId, safeAreaRect } from './factory'
import type { CanvasSize, Id, Rect, Slide, SlideGroup, SongData, SongSection, TextStyle } from './types'

/** linesPerSlide value meaning "choose automatically from line lengths". */
export const AUTO_LINES = 0

const SECTION_ALIASES: [RegExp, string][] = [
  [/^(verse|vs|v)$/, 'Verse'],
  [/^(chorus|ch|c)$/, 'Chorus'],
  [/^(pre-?chorus|pre|pc|prechorus|pre chorus)$/, 'Pre-Chorus'],
  [/^(bridge|br|b)$/, 'Bridge'],
  [/^(refrain|ref)$/, 'Refrain'],
  [/^(intro|in)$/, 'Intro'],
  [/^(outro|out)$/, 'Outro'],
  [/^(tag)$/, 'Tag'],
  [/^(ending|end)$/, 'Ending'],
  [/^(interlude|instrumental|inst)$/, 'Interlude'],
  [/^(vamp)$/, 'Vamp'],
  [/^(hook)$/, 'Hook'],
  [/^(coda)$/, 'Coda'],
  [/^(post-?chorus|post chorus)$/, 'Post-Chorus'],
  [/^(turnaround)$/, 'Turnaround']
]
const WORD_NUMBERS: Record<string, string> = { one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8' }

interface Heading {
  name: string
  /** Base kind without number, e.g. "Verse" */
  kind: string
  repeat: number
  /** "Repeat Chorus" style: never has its own lines */
  isRepeatOnly: boolean
}

/** Recognises a heading line; returns null for lyric lines. */
export function parseHeading(line: string): Heading | null {
  let s = line.trim()
  if (!s || s.length > 40) return null
  // Brackets or a trailing colon mark a line as a heading even when it is very short.
  const marked = /^[[(#]|[\])]$|:$/.test(s)
  let isRepeatOnly = false
  const rep = /^\(?\s*(?:repeat|rpt)\.?\s*(.*?)\s*\)?$/i.exec(s)
  if (rep) {
    isRepeatOnly = true
    s = rep[1] as string
    if (!s) return { name: '', kind: '', repeat: 1, isRepeatOnly: true }
  }
  s = s
    .replace(/^[[({#*\s]+|[\])}:*\s.]+$/g, '')
    .trim()
    .toLowerCase()
  let repeat = 1
  const mult = /\s*(?:[x×]\s*(\d+)|(\d+)\s*[x×]|(\d+)\s*times)$/.exec(s)
  if (mult) {
    repeat = Number(mult[1] ?? mult[2] ?? mult[3]) || 1
    s = s.slice(0, mult.index).trim()
  }
  const m = /^([a-z][a-z -]*?)\s*(\d+[a-z]?|one|two|three|four|five|six|seven|eight)?$/.exec(s)
  if (!m) return null
  const word = (m[1] as string).trim()
  const num = m[2] ? (WORD_NUMBERS[m[2]] ?? m[2]) : ''
  // A bare single letter ("b", "C") is too ambiguous; accept it with a number or heading marks.
  if (word.length === 1 && !num && !marked) return null
  const alias = SECTION_ALIASES.find(([re]) => re.test(word))
  if (!alias) return null
  const kind = alias[1]
  return { name: num ? `${kind} ${num}` : kind, kind, repeat, isRepeatOnly }
}

const CHORD = /^[A-G][#b♯♭]?(?:m|maj|min|dim|aug|sus|add|M)?\d*(?:(?:sus|add|maj|b|#)\d+)*(?:\/[A-G][#b♯♭]?)?$/

function isChordLine(line: string): boolean {
  const tokens = line.trim().split(/\s+/).filter((t) => t && t !== '|' && t !== '-' && t !== '/')
  return tokens.length > 0 && tokens.every((t) => CHORD.test(t.replace(/[()]/g, '')))
}

export interface ParsedSong {
  sections: SongSection[]
  arrangement: Id[]
  title: string | null
  ccli: string | null
  copyright: string | null
}

const normalizeText = (t: string): string => t.replace(/\s+/g, ' ').trim().toLowerCase()

/**
 * Parses pasted lyrics. `previous` keeps section ids stable while the user edits, so an
 * arrangement or slide styling survives re-parsing.
 */
export function parseSongText(text: string, previous: SongSection[] = []): ParsedSong {
  const rawLines = text.replace(/\r\n?/g, '\n').split('\n')
  let ccli: string | null = null
  let copyright: string | null = null
  const lines: string[] = []
  for (const raw of rawLines) {
    const line = raw.replace(/\t/g, ' ').trimEnd()
    const t = line.trim()
    const c = /^CCLI\s*(?:Song)?\s*(?:#|No\.?|Number)?\s*:?\s*(\d{3,})/i.exec(t)
    if (c) {
      ccli = c[1] as string
      continue
    }
    if (/^(©|\(c\)|copyright\b)/i.test(t)) {
      copyright = t.replace(/^(copyright\s*)/i, '').trim()
      continue
    }
    if (/^(CCLI License|For use solely with|www\.ccli\.com|Note: Reproduction|SongSelect)/i.test(t)) continue
    if (t && isChordLine(t)) continue
    lines.push(line)
  }

  // Blocks: a heading line, or runs of lyric lines (blank lines kept inside a section).
  type Block = { heading: Heading | null; lines: string[] }
  const blocks: Block[] = []
  let current: Block | null = null
  for (const line of lines) {
    const h = parseHeading(line)
    if (h) {
      current = { heading: h, lines: [] }
      blocks.push(current)
    } else {
      if (!current) {
        current = { heading: null, lines: [] }
        blocks.push(current)
      }
      current.lines.push(line.trim())
    }
  }
  const hasHeadings = blocks.some((b) => b.heading)

  // Title: a single short first line followed by a blank line, when more content follows.
  let title: string | null = null
  const first = blocks[0]
  if (first && !first.heading) {
    const firstLines = first.lines
    const idx = firstLines.findIndex((l) => l !== '')
    const titleLine = idx >= 0 ? (firstLines[idx] as string) : ''
    const nextIsBlank = firstLines[idx + 1] === '' || (idx === firstLines.length - 1 && blocks.length > 1)
    const restHasContent = firstLines.slice(idx + 1).some((l) => l) || blocks.length > 1
    if (titleLine && titleLine.length <= 60 && nextIsBlank && restHasContent && (hasHeadings || firstLines.slice(idx + 1).filter((l) => l).length > 0)) {
      title = titleLine
      firstLines.splice(idx, 1)
    }
  }

  const sections: SongSection[] = []
  const arrangement: Id[] = []
  const pool = [...previous]
  const usedNames = new Map<string, number>()
  const add = (name: string, body: string): SongSection => {
    // Same name and same words → the same section (e.g. every Chorus).
    const same = sections.find((s) => s.name.toLowerCase() === name.toLowerCase() && normalizeText(s.text) === normalizeText(body))
    if (same) return same
    // A second, different section with the same name: "Chorus 2" / "Verse 1b" (names that
    // parseHeading reads back, so lyrics round-trip when the song is edited again).
    let finalName = name
    const count = usedNames.get(name.toLowerCase()) ?? 0
    if (count > 0) finalName = /\d$/.test(name) ? `${name}${String.fromCharCode(97 + count)}` : `${name} ${count + 1}`
    usedNames.set(name.toLowerCase(), count + 1)
    const prevIdx = pool.findIndex((p) => p.name.toLowerCase() === finalName.toLowerCase())
    const id = prevIdx >= 0 ? (pool.splice(prevIdx, 1)[0] as SongSection).id : newId()
    const section = { id, name: finalName, text: body }
    sections.push(section)
    return section
  }
  const pushTimes = (id: Id, n: number): void => {
    for (let i = 0; i < Math.max(1, Math.min(n, 8)); i++) arrangement.push(id)
  }

  if (!hasHeadings) {
    // Plain text: blank-line separated blocks are verses.
    const text = (blocks[0]?.lines ?? []).join('\n')
    text
      .split(/\n\s*\n/)
      .map((b) => b.trim())
      .filter(Boolean)
      .forEach((b, i) => pushTimes(add(`Verse ${i + 1}`, b).id, 1))
    return { sections, arrangement, title, ccli, copyright }
  }

  let verseCounter = 0
  let lastId: Id | null = null
  for (const block of blocks) {
    const body = block.lines.join('\n').replace(/^\n+|\n+$/g, '').trim()
    const h = block.heading
    if (!h) {
      // Lyrics before the first heading.
      if (body) {
        const s = add('Intro', body)
        pushTimes(s.id, 1)
        lastId = s.id
      }
      continue
    }
    if (!h.kind) {
      // "(Repeat)" → previous section again.
      if (lastId) pushTimes(lastId, h.repeat)
      continue
    }
    if (!body || h.isRepeatOnly) {
      // Heading without lines → repeat an earlier section of that name (or kind).
      const target =
        [...sections].reverse().find((s) => s.name.toLowerCase() === h.name.toLowerCase()) ??
        [...sections].reverse().find((s) => s.name.toLowerCase().startsWith(h.kind.toLowerCase()))
      if (target) {
        pushTimes(target.id, h.repeat)
        lastId = target.id
      }
      if (!body) continue
    }
    // Unnumbered verses are numbered in order: Verse 1, Verse 2…
    let name = h.name
    if (h.kind === 'Verse') {
      verseCounter = /\d/.test(h.name) ? Number(/\d+/.exec(h.name)?.[0]) : verseCounter + 1
      if (!/\d/.test(h.name)) name = `Verse ${verseCounter}`
    }
    const s = add(name, body)
    pushTimes(s.id, h.repeat)
    lastId = s.id
  }
  return { sections, arrangement, title, ccli, copyright }
}

/** Sections only (kept for callers that do not need the arrangement). */
export function parseLyrics(text: string): SongSection[] {
  return parseSongText(text).sections
}

/** Lyrics text with headings, the inverse of parseLyrics (for editing). */
export function lyricsText(sections: SongSection[]): string {
  return sections.map((s) => `[${s.name}]\n${s.text}`).join('\n\n')
}

export function sectionColor(name: string): string {
  const n = name.toLowerCase()
  if (n.startsWith('pre')) return '#f97316'
  if (n.startsWith('post')) return '#ea580c'
  if (n.startsWith('chorus') || n.startsWith('refrain') || n.startsWith('hook')) return '#e11d48'
  if (n.startsWith('bridge')) return '#9333ea'
  if (n.startsWith('verse')) return '#2563eb'
  if (n.startsWith('tag') || n.startsWith('vamp')) return '#0d9488'
  if (n.startsWith('intro') || n.startsWith('outro') || n.startsWith('ending') || n.startsWith('coda') || n.startsWith('interlude')) return '#64748b'
  return '#16a34a'
}

/** Lines per slide for "Auto": short lines fit four to a slide, longer lines two. */
export function autoLinesFor(lines: string[]): number {
  if (lines.length === 0) return 2
  const avg = lines.reduce((n, l) => n + l.length, 0) / lines.length
  return avg <= 26 ? 4 : 2
}

/**
 * Splits a section into slide texts: blank lines force a new slide, then each block is cut
 * into evenly sized slides of at most `maxLines` (0 = auto), e.g. 5 lines → 3 + 2, not 4 + 1.
 */
export function chunkSection(text: string, maxLines: number): string[] {
  const out: string[] = []
  for (const block of text.split(/\n\s*\n/)) {
    const lines = block
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
    if (lines.length === 0) continue
    const max = maxLines === AUTO_LINES ? autoLinesFor(lines) : Math.max(1, maxLines)
    const count = Math.ceil(lines.length / max)
    const base = Math.floor(lines.length / count)
    let extra = lines.length % count
    let i = 0
    for (let k = 0; k < count; k++) {
      const size = base + (extra > 0 ? 1 : 0)
      if (extra > 0) extra--
      out.push(lines.slice(i, i + size).join('\n'))
      i += size
    }
  }
  return out
}

export interface SongTemplate {
  style: TextStyle
  frame?: Rect
}

/**
 * Generates groups and slides for a song. Section ids double as group ids so slides know
 * which section they belong to. The arrangement decides the order (and repeats).
 */
export function buildSongSlides(song: SongData, canvas: CanvasSize, template: SongTemplate, maxLines: number): { groups: SlideGroup[]; slides: Slide[] } {
  const groups: SlideGroup[] = song.sections.map((s) => ({ id: s.id, name: s.name, color: sectionColor(s.name) }))
  const byId = new Map<Id, SongSection>(song.sections.map((s) => [s.id, s]))
  const order = song.arrangement.length ? song.arrangement : song.sections.map((s) => s.id)
  const slides: Slide[] = []
  for (const sectionId of order) {
    const section = byId.get(sectionId)
    if (!section) continue
    const color = sectionColor(section.name)
    const chunks = chunkSection(section.text, maxLines)
    chunks.forEach((chunk, i) => {
      const el = createTextElement(canvas, chunk, template.style, template.frame ? { ...template.frame } : safeAreaRect(canvas))
      slides.push({
        id: newId(),
        label: chunks.length > 1 ? `${section.name} (${i + 1}/${chunks.length})` : section.name,
        color,
        groupId: section.id,
        elements: [el],
        background: null,
        notes: '',
        transition: null,
        enabled: true
      })
    })
  }
  return { groups, slides }
}
