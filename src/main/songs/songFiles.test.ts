import { deflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { decodeText, pptxSlideTexts, readZip } from './songFiles'

/** A minimal ZIP archive (deflated entries) like the ones PowerPoint writes. */
function zip(files: Record<string, string>): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const [name, text] of Object.entries(files)) {
    const raw = Buffer.from(text, 'utf8')
    const data = deflateRawSync(raw)
    const n = Buffer.from(name, 'utf8')
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(8, 8)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(raw.length, 22)
    local.writeUInt16LE(n.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(8, 10)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(raw.length, 24)
    central.writeUInt16LE(n.length, 28)
    central.writeUInt32LE(offset, 42)
    locals.push(local, n, data)
    centrals.push(central, n)
    offset += 30 + n.length + data.length
  }
  const cd = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(Object.keys(files).length, 8)
  end.writeUInt16LE(Object.keys(files).length, 10)
  end.writeUInt32LE(cd.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, cd, end])
}

const slide = (...paras: string[]): string =>
  `<p:sld><p:cSld><p:spTree><p:sp><p:txBody>${paras.map((p) => `<a:p><a:r><a:rPr lang="en-US"/><a:t>${p}</a:t></a:r></a:p>`).join('')}</p:txBody></p:sp></p:spTree></p:cSld></p:sld>`

describe('song files', () => {
  it('reads slide text from a .pptx in presentation order', () => {
    const buf = zip({
      'ppt/presentation.xml': '<p:presentation><p:sldIdLst><p:sldId id="256" r:id="rId3"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst></p:presentation>',
      'ppt/_rels/presentation.xml.rels': '<Relationships><Relationship Id="rId2" Type="slide" Target="slides/slide1.xml"/><Relationship Id="rId3" Type="slide" Target="slides/slide2.xml"/></Relationships>',
      'ppt/slides/slide1.xml': slide('Second &amp; last', ''),
      'ppt/slides/slide2.xml': slide('First line', 'Line two<a:br/>wrapped')
    })
    expect([...readZip(buf).keys()]).toHaveLength(4)
    expect(pptxSlideTexts(buf)).toEqual(['First line\nLine two\nwrapped', 'Second & last'])
  })

  it('rejects files that are not zips', () => {
    expect(() => pptxSlideTexts(Buffer.from('hello world, definitely not a zip file'))).toThrow(/zip/)
  })

  it('decodes UTF-8 and UTF-16 text files', () => {
    expect(decodeText(Buffer.from('﻿Amazing grace', 'utf8'))).toBe('Amazing grace')
    expect(decodeText(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('Ikaw', 'utf16le')]))).toBe('Ikaw')
  })
})
