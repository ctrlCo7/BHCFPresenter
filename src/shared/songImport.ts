/**
 * Song files → songs. Supported:
 *  - Plain text (.txt): the same lyrics format as pasting into New Song.
 *  - ChordPro (.cho, .chopro, .chordpro, .crd): {title}, {artist}, {soc}…{eoc}, inline [C] chords.
 *  - OpenLyrics (.xml): the open song format used by OpenLP, Worship Extreme and others.
 *  - PowerPoint (.pptx): the text of each slide (read in the main process); repeated slides
 *    become the chorus.
 */
import { parseHeading, parseSongText } from './model/songs'
import type { SongData } from './model/types'
import { decodeXmlEntities } from './xml'

export type SongFileFormat = 'text' | 'chordpro' | 'openlyrics' | 'pptx'

/** A song file as read from disk. `slides` for PowerPoint, `text` for the rest. */
export interface SongFile {
  name: string
  format: SongFileFormat
  text?: string
  slides?: string[]
}

const EXTENSIONS: Record<string, SongFileFormat> = {
  txt: 'text',
  cho: 'chordpro',
  chopro: 'chordpro',
  chordpro: 'chordpro',
  crd: 'chordpro',
  xml: 'openlyrics',
  pptx: 'pptx'
}

export const SONG_FILE_EXTENSIONS = Object.keys(EXTENSIONS)

export function songFileFormat(fileName: string): SongFileFormat | null {
  const ext = /\.([^.]+)$/.exec(fileName)?.[1]?.toLowerCase() ?? ''
  return EXTENSIONS[ext] ?? null
}

interface Lyrics {
  /** Lyrics with [Section] headings, as typed in the song editor */
  text: string
  title?: string
  artist?: string
  copyright?: string
  ccli?: string
}

/* ------------------------------ ChordPro ------------------------------ */

export function chordProLyrics(src: string): Lyrics {
  const out: Lyrics = { text: '' }
  const lines: string[] = []
  const section = (name: string): void => {
    lines.push('', `[${name}]`)
  }
  for (const raw of src.replace(/\r\n?/g, '\n').split('\n')) {
    const d = /^\s*\{\s*([a-z_]+)\s*(?:[:\s]\s*(.*?))?\s*\}\s*$/i.exec(raw)
    if (d) {
      const key = (d[1] as string).toLowerCase()
      const arg = (d[2] ?? '').trim()
      if (key === 'title' || key === 't') out.title = arg
      else if (key === 'artist' || key === 'subtitle' || key === 'st' || key === 'composer') out.artist ??= arg
      else if (key === 'copyright') out.copyright = arg
      else if (key === 'ccli') out.ccli = arg
      else if (key === 'start_of_chorus' || key === 'soc') section(arg || 'Chorus')
      else if (key === 'start_of_verse' || key === 'sov') section(arg || 'Verse')
      else if (key === 'start_of_bridge' || key === 'sob') section(arg || 'Bridge')
      else if (key === 'chorus') section(arg || 'Chorus') // "{chorus}" = repeat the chorus
      else if (/^(comment|c|ci|comment_italic|cb|comment_box)$/.test(key) && parseHeading(arg)) section(arg)
      else if (/^(end_of_|eo)/.test(key)) lines.push('')
      continue
    }
    if (/^\s*#/.test(raw)) continue
    const hadChords = /\[[^\]]*\]/.test(raw)
    const line = raw
      .replace(/\[[^\]]*\]/g, '')
      .replace(/\s{2,}/g, ' ')
      .trimEnd()
    if (hadChords && !line.trim()) continue // a line of chords only
    lines.push(line)
  }
  out.text = lines.join('\n')
  return out
}

/* ----------------------------- OpenLyrics ----------------------------- */

const tagText = (xml: string, tag: string): string[] =>
  [...xml.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'g'))].map((m) => decodeXmlEntities((m[1] as string).replace(/<[^>]+>/g, '')).trim())

const OPENLYRICS_KINDS: Record<string, string> = { v: 'Verse', c: 'Chorus', p: 'Pre-Chorus', b: 'Bridge', e: 'Ending', i: 'Intro', o: 'Tag' }

export function openLyricsLyrics(xml: string): Lyrics {
  if (!/<song\b/i.test(xml) || !/<lyrics\b/i.test(xml)) throw new Error('Not an OpenLyrics song file.')
  const verses = [...xml.matchAll(/<verse\b([^>]*)>([\s\S]*?)<\/verse>/g)].map((m) => {
    const id = /\bname="([^"]*)"/.exec(m[1] as string)?.[1] ?? ''
    const body = [...(m[2] as string).matchAll(/<lines\b[^>]*>([\s\S]*?)<\/lines>/g)]
      .map((l) =>
        decodeXmlEntities(
          (l[1] as string)
            .replace(/<comment\b[^>]*>[\s\S]*?<\/comment>/g, '')
            .replace(/<br\s*\/?>/g, '\n')
            .replace(/<[^>]+>/g, '')
        )
          .split('\n')
          .map((x) => x.trim())
          .join('\n')
          .trim()
      )
      .filter(Boolean)
      .join('\n')
    return { id, body }
  })
  // "v1" → "Verse 1", "c" → "Chorus"; a lone "c1" is just "Chorus".
  const parsed = verses.map((v) => /^([a-z]+?)(\d*)([a-z]?)$/i.exec(v.id))
  const kindCount = new Map<string, number>()
  for (const m of parsed) if (m) kindCount.set((m[1] as string).toLowerCase(), (kindCount.get((m[1] as string).toLowerCase()) ?? 0) + 1)
  const nameOf = new Map<string, string>()
  verses.forEach((v, i) => {
    const m = parsed[i]
    const kind = m ? (OPENLYRICS_KINDS[(m[1] as string).toLowerCase()] ?? 'Verse') : 'Verse'
    const num = m && (m[2] || m[3]) && (kind === 'Verse' || (kindCount.get((m[1] as string).toLowerCase()) ?? 0) > 1) ? ` ${m[2] ?? ''}${m[3] ?? ''}` : ''
    nameOf.set(v.id, `${kind}${num}`.trim())
  })
  const byId = new Map(verses.map((v) => [v.id, v]))
  const order = (tagText(xml, 'verseOrder')[0] ?? '').split(/\s+/).filter((id) => byId.has(id))
  const sequence = order.length ? order.map((id) => byId.get(id)!) : verses
  return {
    text: sequence.map((v) => `[${nameOf.get(v.id) ?? 'Verse'}]\n${v.body}`).join('\n\n'),
    title: tagText(xml, 'title')[0],
    artist: tagText(xml, 'author').filter(Boolean).join(', ') || undefined,
    copyright: tagText(xml, 'copyright')[0] || undefined,
    ccli: tagText(xml, 'ccliNo')[0] || undefined
  }
}

/* ----------------------------- PowerPoint ----------------------------- */

const blockKey = (t: string): string => t.replace(/\s+/g, ' ').trim().toLowerCase()

export function slideDeckLyrics(slides: string[]): Lyrics {
  let blocks = slides.map((s) => s.split('\n').map((l) => l.trim()).filter(Boolean).join('\n')).filter(Boolean)
  let title: string | undefined
  // A one-line first slide is the title slide.
  const first = blocks[0]
  if (first && blocks.length > 1 && !first.includes('\n') && first.length <= 60 && blocks.filter((b) => blockKey(b) === blockKey(first)).length === 1) {
    title = first
    blocks = blocks.slice(1)
  }
  // Slides shown more than once are the chorus (then Chorus 2…); the rest are verses in order.
  const count = new Map<string, number>()
  for (const b of blocks) count.set(blockKey(b), (count.get(blockKey(b)) ?? 0) + 1)
  const names = new Map<string, string>()
  let verse = 0
  let chorus = 0
  for (const b of blocks) {
    const k = blockKey(b)
    if (names.has(k)) continue
    if ((count.get(k) ?? 0) > 1) names.set(k, ++chorus === 1 ? 'Chorus' : `Chorus ${chorus}`)
    else names.set(k, `Verse ${++verse}`)
  }
  return { text: blocks.map((b) => `[${names.get(blockKey(b))}]\n${b}`).join('\n\n'), title }
}

/* ------------------------------- Songs ------------------------------- */

export function songFromFile(file: SongFile): SongData {
  let lyrics: Lyrics
  if (file.format === 'pptx') lyrics = slideDeckLyrics(file.slides ?? [])
  else if (file.format === 'chordpro') lyrics = chordProLyrics(file.text ?? '')
  else if (file.format === 'openlyrics') lyrics = openLyricsLyrics(file.text ?? '')
  else lyrics = { text: file.text ?? '' }
  const parsed = parseSongText(lyrics.text)
  if (parsed.sections.length === 0) throw new Error('No lyrics found.')
  return {
    title: (lyrics.title || parsed.title || file.name).trim().slice(0, 200),
    artist: lyrics.artist ?? '',
    copyright: lyrics.copyright ?? parsed.copyright ?? '',
    ccli: lyrics.ccli ?? parsed.ccli ?? '',
    sections: parsed.sections,
    arrangement: parsed.arrangement
  }
}
