import { describe, expect, it } from 'vitest'
import { AUTO_LINES, chunkSection, lyricsText, parseHeading, parseSongText } from './songs'

const names = (text: string): string[] => {
  const p = parseSongText(text)
  const byId = new Map(p.sections.map((s) => [s.id, s.name]))
  return p.arrangement.map((id) => byId.get(id) as string)
}

describe('heading detection', () => {
  it('recognises common heading styles', () => {
    expect(parseHeading('VERSE ONE')?.name).toBe('Verse 1')
    expect(parseHeading('V1')?.name).toBe('Verse 1')
    expect(parseHeading('(Chorus)')?.name).toBe('Chorus')
    expect(parseHeading('Chorus x2')).toMatchObject({ name: 'Chorus', repeat: 2 })
    expect(parseHeading('[Pre-Chorus]')?.name).toBe('Pre-Chorus')
    expect(parseHeading('PC:')?.name).toBe('Pre-Chorus')
    expect(parseHeading('Bridge 2:')?.name).toBe('Bridge 2')
    expect(parseHeading('Repeat Chorus')).toMatchObject({ name: 'Chorus', isRepeatOnly: true })
  })

  it('does not mistake lyric lines for headings', () => {
    expect(parseHeading('I')).toBeNull()
    expect(parseHeading('O come let us adore Him')).toBeNull()
    expect(parseHeading('Bridge over troubled water')).toBeNull()
    expect(parseHeading('Verses of praise we sing')).toBeNull()
  })
})

describe('pasting lyrics', () => {
  it('builds sections and the sung order, with repeats', () => {
    const text = `Way Maker

VERSE 1
You are here moving in our midst
I worship You I worship You

CHORUS
Way maker miracle worker
Promise keeper light in the darkness

VERSE 2
You are here touching every heart

Repeat Chorus

BRIDGE x2
Even when I don't see it You're working

(Chorus)`
    const p = parseSongText(text)
    expect(p.title).toBe('Way Maker')
    expect(p.sections.map((s) => s.name)).toEqual(['Verse 1', 'Chorus', 'Verse 2', 'Bridge'])
    expect(names(text)).toEqual(['Verse 1', 'Chorus', 'Verse 2', 'Chorus', 'Bridge', 'Bridge', 'Chorus'])
  })

  it('strips chords and picks up CCLI metadata', () => {
    const text = `[Verse]
G        D/F#      Em
Amazing grace how sweet the sound
C     G
That saved a wretch like me

CCLI Song # 4768151
© 2006 sixsteps Music
CCLI License # 123456`
    const p = parseSongText(text)
    expect(p.sections[0]?.text).toBe('Amazing grace how sweet the sound\nThat saved a wretch like me')
    expect(p.ccli).toBe('4768151')
    expect(p.copyright).toBe('© 2006 sixsteps Music')
  })

  it('numbers unnumbered verses and treats identical choruses as one section', () => {
    const p = parseSongText('Verse\na\n\nChorus\nx y\n\nVerse\nb\n\nChorus\nx  y')
    expect(p.sections.map((s) => s.name)).toEqual(['Verse 1', 'Chorus', 'Verse 2'])
    expect(p.arrangement).toHaveLength(4)
  })

  it('round-trips sections through the lyrics text used for editing', () => {
    const p = parseSongText('[Chorus]\nfirst words\n\n[Chorus]\ndifferent words\n\n[Verse 1]\na\n\n[Verse 1]\nb')
    expect(p.sections.map((s) => s.name)).toEqual(['Chorus', 'Chorus 2', 'Verse 1', 'Verse 1b'])
    const again = parseSongText(lyricsText(p.sections), p.sections)
    expect(again.sections.map((s) => [s.id, s.name, s.text])).toEqual(p.sections.map((s) => [s.id, s.name, s.text]))
  })

  it('keeps section ids stable across edits', () => {
    const a = parseSongText('[Chorus]\nhello')
    const b = parseSongText('[Chorus]\nhello there', a.sections)
    expect(b.sections[0]?.id).toBe(a.sections[0]?.id)
  })
})

describe('slide splitting', () => {
  it('balances slides and auto-picks lines per slide', () => {
    expect(chunkSection('1\n2\n3\n4\n5', 4)).toEqual(['1\n2\n3', '4\n5'])
    expect(chunkSection('a\nb\nc', 2)).toEqual(['a\nb', 'c'])
    // Short lines → 4 per slide, long lines → 2 per slide
    expect(chunkSection('short\nlines\nhere\nnow', AUTO_LINES)).toHaveLength(1)
    const long = Array.from({ length: 4 }, () => 'this is a fairly long lyric line indeed').join('\n')
    expect(chunkSection(long, AUTO_LINES)).toHaveLength(2)
  })
})
