import { describe, expect, it } from 'vitest'
import { chordProLyrics, openLyricsLyrics, slideDeckLyrics, songFileFormat, songFromFile } from './songImport'

const names = (song: ReturnType<typeof songFromFile>): string[] => song.arrangement.map((id) => song.sections.find((s) => s.id === id)?.name ?? '?')

describe('song file import', () => {
  it('knows the file types', () => {
    expect(songFileFormat('Way Maker.TXT')).toBe('text')
    expect(songFileFormat('a.chordpro')).toBe('chordpro')
    expect(songFileFormat('a.xml')).toBe('openlyrics')
    expect(songFileFormat('a.pptx')).toBe('pptx')
    expect(songFileFormat('a.ppt')).toBeNull()
  })

  it('reads plain text like pasted lyrics, using the file name when there is no title', () => {
    const song = songFromFile({ name: 'Goodness of God', format: 'text', text: 'Verse 1\nI love You Lord\nOh Your mercy never fails me\n\nChorus\nAll my life You have been faithful\n\nRepeat Chorus\n\nCCLI Song # 7117726' })
    expect(song.title).toBe('Goodness of God')
    expect(song.ccli).toBe('7117726')
    expect(names(song)).toEqual(['Verse 1', 'Chorus', 'Chorus'])
  })

  it('reads ChordPro: directives, sections and inline chords', () => {
    const src = [
      '{title: Amazing Grace}',
      '{artist: John Newton}',
      '# a comment',
      '{start_of_verse: Verse 1}',
      '[G]Amazing [G7]grace how [C]sweet the [G]sound',
      '[G] [D]',
      'That saved a wretch like me',
      '{end_of_verse}',
      '{soc}',
      'My chains are [C]gone',
      '{eoc}',
      '{chorus}'
    ].join('\n')
    expect(chordProLyrics(src).title).toBe('Amazing Grace')
    const song = songFromFile({ name: 'x', format: 'chordpro', text: src })
    expect(song).toMatchObject({ title: 'Amazing Grace', artist: 'John Newton' })
    expect(song.sections[0]?.text).toBe('Amazing grace how sweet the sound\nThat saved a wretch like me')
    expect(names(song)).toEqual(['Verse 1', 'Chorus', 'Chorus'])
  })

  it('reads OpenLyrics in verse order', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<song xmlns="http://openlyrics.info/namespace/2009/song" version="0.9">
  <properties>
    <titles><title>Blessed Be Your Name</title></titles>
    <authors><author>Matt Redman</author><author>Beth Redman</author></authors>
    <copyright>2002 Thankyou Music</copyright>
    <ccliNo>3798438</ccliNo>
    <verseOrder>v1 c v2 c</verseOrder>
  </properties>
  <lyrics>
    <verse name="v1"><lines>Blessed be Your name<br/>In the land that is plentiful</lines></verse>
    <verse name="v2"><lines>Blessed be Your name<br/>When I&apos;m found in the desert place</lines></verse>
    <verse name="c"><lines><chord name="A"/>Every blessing You pour out<br/>I&apos;ll turn back to praise</lines></verse>
  </lyrics>
</song>`
    expect(openLyricsLyrics(xml).artist).toBe('Matt Redman, Beth Redman')
    const song = songFromFile({ name: 'x', format: 'openlyrics', text: xml })
    expect(song).toMatchObject({ title: 'Blessed Be Your Name', ccli: '3798438', copyright: '2002 Thankyou Music' })
    expect(names(song)).toEqual(['Verse 1', 'Chorus', 'Verse 2', 'Chorus'])
    expect(song.sections.find((s) => s.name === 'Chorus')?.text).toBe('Every blessing You pour out\nI’ll turn back to praise'.replace('’', "'"))
    expect(() => openLyricsLyrics('<bible/>')).toThrow()
  })

  it('reads PowerPoint slides: title slide, repeated slides as the chorus', () => {
    const lyrics = slideDeckLyrics(['10,000 Reasons', 'Bless the Lord O my soul\nO my soul', 'The sun comes up\nIt’s a new day dawning', '', 'Bless the Lord O my soul\nO my soul'])
    expect(lyrics.title).toBe('10,000 Reasons')
    const song = songFromFile({ name: 'deck', format: 'pptx', slides: ['10,000 Reasons', 'Bless the Lord O my soul\nO my soul', 'The sun comes up', 'Bless the Lord O my soul\nO my soul'] })
    expect(song.title).toBe('10,000 Reasons')
    expect(names(song)).toEqual(['Chorus', 'Verse 1', 'Chorus'])
  })

  it('reports files without lyrics', () => {
    expect(() => songFromFile({ name: 'empty', format: 'text', text: '   \n' })).toThrow(/No lyrics/)
  })
})

describe('update versions', () => {
  it('compares release tags numerically', async () => {
    const { compareVersions } = await import('./updates')
    expect(compareVersions('v1.0.10', '1.0.9')).toBe(1)
    expect(compareVersions('1.0.1', 'v1.0.1')).toBe(0)
    expect(compareVersions('1.0.1', '1.1.0')).toBe(-1)
  })
})

describe('update release notes', () => {
  it('turns GitHub HTML or Markdown into plain text', async () => {
    const { notesText } = await import('./updates')
    expect(notesText('<ul>\n<li>Timer screens &amp; loops</li>\n<li>Song import</li>\n</ul>')).toBe('• Timer screens & loops\n• Song import')
    expect(notesText('- One\n- Two')).toBe('• One\n• Two')
    // Mac: the release body as written, with lines wrapped mid-sentence.
    expect(notesText('- Updates now ask first: a window shows\n  what changed\n- Update now downloads\n\nThanks')).toBe('• Updates now ask first: a window shows what changed\n• Update now downloads\n\nThanks')
    expect(notesText('')).toBeUndefined()
    expect(notesText(null)).toBeUndefined()
  })
})

describe("what's new after an update", () => {
  it('lists every release since the version last used, newest first', async () => {
    const { notesSince } = await import('./updates')
    const releases = ['v1.0.6', 'v1.0.5', 'v1.0.4', 'v1.0.3', 'v1.0.2', 'v1.0.7'].map((t) => ({ tag_name: t, body: `- Notes for ${t}` }))
    expect(notesSince(releases, '1.0.6', '1.0.3').map((r) => r.version)).toEqual(['1.0.6', '1.0.5', '1.0.4'])
    expect(notesSince(releases, '1.0.6', null).map((r) => r.version)).toEqual(['1.0.6'])
    expect(notesSince(releases, '1.0.6', '1.0.6')).toEqual([])
    expect(notesSince(releases, '1.0.4', '1.0.3')[0]).toEqual({ version: '1.0.4', notes: '• Notes for v1.0.4' })
  })
})
