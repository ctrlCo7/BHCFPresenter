import { describe, expect, it } from 'vitest'
import { convertBibleFile, metaFromFileName } from './bibleFormats'

const meta = { id: 'test', name: 'Test', abbreviation: 'TST' }

describe('Bible import formats', () => {
  it('reads Zefania XML, skipping notes and decoding entities', () => {
    const xml = `<?xml version="1.0"?><XMLBIBLE biblename="X"><INFORMATION><TITLE>My Bible</TITLE></INFORMATION>
      <BIBLEBOOK bnumber="43" bname="John"><CHAPTER cnumber="3">
        <VERS vnumber="16">For God so loved <STYLE css="x">the world</STYLE><NOTE>fn</NOTE> &amp; more</VERS>
        <VERS vnumber="17">Verse 17</VERS>
      </CHAPTER></BIBLEBOOK></XMLBIBLE>`
    const b = convertBibleFile(xml, meta)
    expect(b.name).toBe('My Bible')
    expect(b.books).toHaveLength(1)
    expect(b.books[0]?.name).toBe('John')
    expect(b.books[0]?.chapters[2]?.[15]).toBe('For God so loved the world & more')
    expect(b.books[0]?.chapters[0]).toEqual([])
  })

  it('reads "books" JSON with translation header', () => {
    const doc = { translation: 'ABC: A Bible Copy', books: [{ name: 'Genesis', chapters: [{ chapter: 1, verses: [{ verse: 1, text: ' In  the beginning ' }] }] }] }
    const b = convertBibleFile(JSON.stringify(doc), meta)
    expect(b.abbreviation).toBe('ABC')
    expect(b.name).toBe('A Bible Copy')
    expect(b.books[0]?.chapters[0]?.[0]).toBe('In the beginning')
  })

  it('reads array JSON and gives 66-book Bibles English names and abbreviations', () => {
    const doc = Array.from({ length: 66 }, (_, i) => ({ abbrev: `x${i}`, chapters: [[`v ${i}`]] }))
    const b = convertBibleFile(JSON.stringify(doc), meta)
    expect(b.books[42]?.name).toBe('John')
    expect(b.books[42]?.abbrev).toBe('John')
  })

  it('rejects unknown content and derives metadata from file names', () => {
    expect(() => convertBibleFile('{"hello":1}', meta)).toThrow(/Unrecognised/)
    expect(() => convertBibleFile('not a bible', meta)).toThrow()
    expect(metaFromFileName('NIV 2011.xml')).toEqual({ id: 'niv-2011', name: 'NIV 2011', abbreviation: 'NIV2011' })
  })
})
