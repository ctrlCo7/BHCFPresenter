import { describe, expect, it } from 'vitest'
import { formatReference, parseReference } from './bible'
import { parseColor, toCss, withAlpha, withHex } from './color'
import { mediaPosition, type MediaPlayback } from './live'
import { createTimer } from './model/factory'
import { buildSongSlides, chunkSection, lyricsText, parseLyrics } from './model/songs'
import { scriptureSlides } from './model/scripture'
import { defaultTextStyle } from './model/factory'
import { formatDurationMs, resolveTokens, timerValueMs, type TimerView } from './timers'

const books = [
  { name: 'Genesis', abbrev: 'Gen' },
  { name: 'Psalms', abbrev: 'Ps' },
  { name: 'Song of Solomon', abbrev: 'Song' },
  { name: 'John', abbrev: 'John' },
  { name: '1 Corinthians', abbrev: '1Cor' },
  { name: '1 John', abbrev: '1John' }
]

describe('scripture references', () => {
  it('parses common forms', () => {
    expect(parseReference(books, 'John 3:16')).toEqual({ book: 3, chapter: 3, verseStart: 16, verseEnd: 16 })
    expect(parseReference(books, 'jn 3:16-18')).toEqual({ book: 3, chapter: 3, verseStart: 16, verseEnd: 18 })
    expect(parseReference(books, '1 cor 13')).toEqual({ book: 4, chapter: 13, verseStart: null, verseEnd: null })
    expect(parseReference(books, 'First John 4:8')?.book).toBe(5)
    expect(parseReference(books, 'Psalm 23:1–6')).toEqual({ book: 1, chapter: 23, verseStart: 1, verseEnd: 6 })
    expect(parseReference(books, 'Song 2:4')?.book).toBe(2)
    expect(parseReference(books, 'Nope 1:1')).toBeNull()
    expect(parseReference(books, 'John 3:18-16')).toBeNull()
  })

  it('formats verse lists compactly', () => {
    expect(formatReference('John', 3, [16])).toBe('John 3:16')
    expect(formatReference('John', 3, [18, 16, 17])).toBe('John 3:16–18')
    expect(formatReference('John', 3, [16, 18, 19])).toBe('John 3:16, 18–19')
  })

  it('builds slides with a reference line', () => {
    const verses = [16, 17, 18].map((v) => ({ book: 3, chapter: 3, verse: v, text: `text ${v}` }))
    const slides = scriptureSlides('John', verses, { width: 1920, height: 1080 }, { versesPerSlide: 2, showVerseNumbers: true, translation: 'KJV' })
    expect(slides).toHaveLength(2)
    expect(slides[0]?.label).toBe('John 3:16–17 (KJV)')
    const body = slides[0]?.elements[0]
    expect(body?.type === 'text' && body.text).toContain('¹⁶')
  })
})

describe('songs', () => {
  const lyrics = `[Verse 1]
Line one
Line two
Line three

Chorus:
Sing it
Sing it loud

Bridge
Up and up`

  it('parses sections with several heading styles', () => {
    const s = parseLyrics(lyrics)
    expect(s.map((x) => x.name)).toEqual(['Verse 1', 'Chorus', 'Bridge'])
    expect(s[0]?.text).toBe('Line one\nLine two\nLine three')
    expect(parseLyrics(lyricsText(s)).map((x) => x.text)).toEqual(s.map((x) => x.text))
  })

  it('treats heading-less text as verses', () => {
    expect(parseLyrics('a\nb\n\nc').map((x) => x.name)).toEqual(['Verse 1', 'Verse 2'])
  })

  it('chunks by line count and follows the arrangement', () => {
    expect(chunkSection('a\nb\nc', 2)).toEqual(['a\nb', 'c'])
    const sections = parseLyrics(lyrics)
    const chorus = sections[1]?.id as string
    const song = { title: 'T', artist: '', copyright: '', ccli: '', sections, arrangement: [sections[0]?.id as string, chorus, chorus] }
    const { slides, groups } = buildSongSlides(song, { width: 1920, height: 1080 }, { style: defaultTextStyle() }, 2)
    expect(groups).toHaveLength(3)
    expect(slides.map((s) => s.label)).toEqual(['Verse 1 (1/2)', 'Verse 1 (2/2)', 'Chorus', 'Chorus'])
    expect(slides[2]?.groupId).toBe(chorus)
  })
})

describe('timers and tokens', () => {
  const t0 = 1_000_000
  const view = (patch: Partial<TimerView['runtime']>, kind: 'countdown' | 'countup' = 'countdown'): TimerView => ({
    def: { ...createTimer('Countdown', kind), durationSec: 90 },
    runtime: { running: false, startedAt: null, accumulatedMs: 0, ...patch }
  })

  it('counts down while running and clamps at zero', () => {
    expect(timerValueMs(view({ running: true, startedAt: t0 }), t0 + 30_000)).toBe(60_000)
    expect(timerValueMs(view({ running: true, startedAt: t0 }), t0 + 200_000)).toBe(0)
    expect(timerValueMs(view({ accumulatedMs: 10_000 }, 'countup'), t0)).toBe(10_000)
  })

  it('formats and resolves tokens', () => {
    expect(formatDurationMs(61_000)).toBe('1:01')
    expect(formatDurationMs(3_661_000)).toBe('1:01:01')
    expect(formatDurationMs(-5_000)).toBe('-0:05')
    expect(resolveTokens('Starts in {timer:countdown}', [view({})], t0)).toBe('Starts in 1:30')
    expect(resolveTokens('{timer:Missing}', [], t0)).toBe('{timer:Missing}')
  })
})

describe('media timeline', () => {
  const m: MediaPlayback = { cueId: 1, mediaId: 'x', playing: true, anchorPos: 2, anchorAt: 0, loop: true, volume: 1, muted: false, fit: 'contain' }
  it('advances with the clock and wraps when looping', () => {
    expect(mediaPosition(m, 3000, 10)).toBe(5)
    expect(mediaPosition(m, 12000, 10)).toBe(4)
    expect(mediaPosition({ ...m, loop: false }, 12000, 10)).toBe(10)
    expect(mediaPosition({ ...m, playing: false }, 12000, 10)).toBe(2)
  })
})

describe('colors', () => {
  it('parses and edits colours', () => {
    expect(parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 })
    expect(toCss(parseColor('rgba(0,0,0,0.5)')!)).toBe('rgba(0,0,0,0.5)')
    expect(withAlpha('#ff0000', 0.25)).toBe('rgba(255,0,0,0.25)')
    expect(withHex('rgba(0,0,0,0.5)', '#00ff00')).toBe('rgba(0,255,0,0.5)')
  })
})
