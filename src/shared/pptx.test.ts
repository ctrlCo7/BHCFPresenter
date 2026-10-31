import { describe, expect, it } from 'vitest'
import { deckToSlides, parsePptx } from './pptx'
import type { ImageElement, ShapeElement, TextElement } from './model/types'
import { parseXml, xmlChild } from './xml'

const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"'
const rels = (items: [string, string, string][]): string =>
  `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items.map(([id, type, target]) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`).join('')}</Relationships>`
const xfrm = (x: number, y: number, w: number, h: number): string => `<a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>`

/** A 16:9 deck (12 192 000 × 6 858 000 EMU) with two slides and one hidden slide. */
const files: Record<string, string> = {
  'ppt/presentation.xml': `<?xml version="1.0"?><p:presentation ${NS}><p:sldIdLst><p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId3"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/><p:defaultTextStyle><a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr></p:defaultTextStyle></p:presentation>`,
  'ppt/_rels/presentation.xml.rels': rels([['rId2', 'slide', 'slides/slide1.xml'], ['rId3', 'slide', 'slides/slide2.xml']]),
  'ppt/theme/theme1.xml': `<a:theme ${NS}><a:themeElements><a:clrScheme name="x"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F2937"/></a:dk2><a:lt2><a:srgbClr val="EEEEEE"/></a:lt2><a:accent1><a:srgbClr val="4472C4"/></a:accent1></a:clrScheme><a:fontScheme name="x"><a:majorFont><a:latin typeface="Montserrat"/></a:majorFont><a:minorFont><a:latin typeface="Lato"/></a:minorFont></a:fontScheme></a:themeElements></a:theme>`,
  'ppt/slideMasters/slideMaster1.xml': `<p:sldMaster ${NS}><p:cSld><p:bg><p:bgPr><a:solidFill><a:schemeClr val="tx2"/></a:solidFill></p:bgPr></p:bg><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr>${xfrm(838200, 365125, 10515600, 1325563)}</p:spPr><p:txBody><a:bodyPr anchor="ctr"/><a:p/></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Body"/><p:cNvSpPr/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr>${xfrm(838200, 1825625, 10515600, 4351338)}</p:spPr><p:txBody><a:bodyPr/><a:p/></p:txBody></p:sp></p:spTree></p:cSld><p:clrMap bg1="dk1" tx1="lt1" bg2="dk2" tx2="lt2" accent1="accent1"/><p:txStyles><p:titleStyle><a:lvl1pPr algn="ctr"><a:defRPr sz="4400" b="1"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mj-lt"/></a:defRPr></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr><a:buChar char="•"/><a:defRPr sz="2800"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill></a:defRPr></a:lvl1pPr></p:bodyStyle><p:otherStyle><a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr></p:otherStyle></p:txStyles></p:sldMaster>`,
  'ppt/slideMasters/_rels/slideMaster1.xml.rels': rels([['rId1', 'theme', '../theme/theme1.xml']]),
  'ppt/slideLayouts/slideLayout1.xml': `<p:sldLayout ${NS}><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:cNvSpPr/><p:nvPr><p:ph type="ctrTitle"/></p:nvPr></p:nvSpPr><p:spPr>${xfrm(1524000, 1122363, 9144000, 2387600)}</p:spPr><p:txBody><a:bodyPr anchor="b"/><a:lstStyle><a:lvl1pPr><a:defRPr sz="6000"/></a:lvl1pPr></a:lstStyle><a:p/></p:txBody></p:sp></p:spTree></p:cSld></p:sldLayout>`,
  'ppt/slideLayouts/_rels/slideLayout1.xml.rels': rels([['rId1', 'slideMaster', '../slideMasters/slideMaster1.xml']]),
  // Slide 1: a centred title with no position of its own (from the layout), a lyric box,
  // a grouped rectangle, a picture and speaker notes.
  'ppt/slides/slide1.xml': `<p:sld ${NS}><p:cSld><p:spTree>
    <p:sp><p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:cNvSpPr/><p:nvPr><p:ph type="ctrTitle"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:p><a:r><a:rPr lang="en-US"/><a:t>Amazing Grace</a:t></a:r></a:p></p:txBody></p:sp>
    <p:sp><p:nvSpPr><p:cNvPr id="3" name="Lyrics"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(609600, 4572000, 10972800, 1371600)}<a:noFill/></p:spPr><p:txBody><a:bodyPr anchor="ctr"><a:normAutofit fontScale="50000"/></a:bodyPr><a:p><a:pPr algn="r"/><a:r><a:rPr sz="3600" i="1"><a:solidFill><a:srgbClr val="FFD700"/></a:solidFill><a:latin typeface="Georgia"/></a:rPr><a:t>How sweet &amp; the sound</a:t></a:r></a:p><a:p><a:r><a:rPr sz="3600"/><a:t>That saved</a:t></a:r><a:br/><a:r><a:rPr sz="3600"/><a:t>a wretch</a:t></a:r></a:p></p:txBody></p:sp>
    <p:grpSp><p:nvGrpSpPr><p:cNvPr id="4" name="Group"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1219200" cy="685800"/><a:chOff x="0" y="0"/><a:chExt cx="2438400" cy="1371600"/></a:xfrm></p:grpSpPr>
      <p:sp><p:nvSpPr><p:cNvPr id="5" name="Bar"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(0, 0, 2438400, 1371600)}<a:prstGeom prst="roundRect"/><a:solidFill><a:schemeClr val="accent1"><a:alpha val="50000"/></a:schemeClr></a:solidFill></p:spPr></p:sp>
    </p:grpSp>
    <p:pic><p:nvPicPr><p:cNvPr id="6" name="Logo"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId5"/></p:blipFill><p:spPr>${xfrm(10972800, 0, 1219200, 1219200)}</p:spPr></p:pic>
  </p:spTree></p:cSld></p:sld>`,
  'ppt/slides/_rels/slide1.xml.rels': rels([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'], ['rId5', 'image', '../media/image1.png'], ['rId9', 'notesSlide', '../notesSlides/notesSlide1.xml']]),
  'ppt/notesSlides/notesSlide1.xml': `<p:notes ${NS}><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="2" name="Notes"/><p:cNvSpPr/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:p><a:r><a:t>Sing twice</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:notes>`,
  // Slide 2: hidden, a picture background and a bulleted body placeholder (inherits from master).
  'ppt/slides/slide2.xml': `<p:sld ${NS} show="0"><p:cSld><p:bg><p:bgPr><a:blipFill><a:blip r:embed="rId2"/></a:blipFill></p:bgPr></p:bg><p:spTree>
    <p:sp><p:nvSpPr><p:cNvPr id="2" name="Content"/><p:cNvSpPr/><p:nvPr><p:ph idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:p><a:r><a:t>Welcome</a:t></a:r></a:p><a:p><a:pPr><a:buNone/></a:pPr><a:r><a:t>Announcements</a:t></a:r></a:p></p:txBody></p:sp>
  </p:spTree></p:cSld></p:sld>`,
  'ppt/slides/_rels/slide2.xml.rels': rels([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'], ['rId2', 'image', '../media/bg.jpeg']])
}
const read = (p: string): string | null => files[p] ?? null

describe('XML reader', () => {
  it('reads elements, attributes, entities and self-closing tags', () => {
    const doc = parseXml('<?xml version="1.0"?><!-- c --><r a="1 &amp; 2"><b/><t>x &lt; y</t><![CDATA[<raw>]]></r>')
    const r = xmlChild(doc, 'r')
    expect(r?.attrs.a).toBe('1 & 2')
    expect(r?.children.map((c) => c.name)).toEqual(['b', 't'])
    expect(xmlChild(r, 't')?.text).toBe('x < y')
    expect(r?.text).toContain('<raw>')
  })
})

describe('PowerPoint import', () => {
  const deck = parsePptx(read)

  it('reads slides in order with notes, hidden slides and pictures', () => {
    expect(deck.width).toBe(12192000)
    expect(deck.slides).toHaveLength(2)
    expect(deck.slides[0]?.notes).toBe('Sing twice')
    expect(deck.slides[1]?.hidden).toBe(true)
    expect(deck.images.sort()).toEqual(['ppt/media/bg.jpeg', 'ppt/media/image1.png'])
  })

  it('places a title from its layout and styles it from the master and theme', () => {
    const title = deck.slides[0]?.items.find((i) => i.kind === 'text' && i.text === 'Amazing Grace')
    expect(title).toMatchObject({ frame: { x: 1524000, y: 1122363, width: 9144000, height: 2387600 } })
    // Layout list style 60 pt beats the master's 44 pt; bold, centred, theme heading font, tx1 → lt1 (white).
    expect(title).toMatchObject({ style: { sizePt: 60, bold: true, align: 'center', anchor: 'bottom', font: 'Montserrat', color: '#ffffff' } })
  })

  it('keeps a text box’s own run style, line breaks and shrink-to-fit', () => {
    const lyrics = deck.slides[0]?.items.find((i) => i.kind === 'text' && i.name === 'Lyrics')
    expect(lyrics).toMatchObject({ text: 'How sweet & the sound\nThat saved\na wretch', autoFit: true, fontScale: 0.5 })
    expect(lyrics).toMatchObject({ style: { sizePt: 36, italic: true, color: '#ffd700', font: 'Georgia', align: 'right', anchor: 'middle' } })
  })

  it('flattens groups and keeps shape fills with transparency', () => {
    const bar = deck.slides[0]?.items.find((i) => i.kind === 'shape')
    expect(bar).toMatchObject({ frame: { x: 0, y: 0, width: 1219200, height: 685800 }, rounded: true, fill: { type: 'solid', color: 'rgba(68,114,196,0.5)' } })
  })

  it('inherits body placeholders from the master, with bullets unless turned off', () => {
    const body = deck.slides[1]?.items.find((i) => i.kind === 'text')
    expect(body).toMatchObject({ text: '• Welcome\nAnnouncements', frame: { x: 838200, y: 1825625 }, style: { sizePt: 28 } })
    expect(deck.slides[1]?.background).toEqual({ type: 'image', image: 'ppt/media/bg.jpeg' })
    // Slide 1 has no background: the master's (tx2 → lt2).
    expect(deck.slides[0]?.background).toEqual({ type: 'color', color: '#eeeeee' })
  })

  it('makes editable slides scaled to the canvas', () => {
    const slides = deckToSlides(deck, { width: 1920, height: 1080 }, (image) => (image.endsWith('image1.png') ? 'logo-id' : image.endsWith('bg.jpeg') ? 'bg-id' : null))
    const [one, two] = slides
    const title = one?.elements.find((e): e is TextElement => e.type === 'text' && e.text === 'Amazing Grace')
    // 12 192 000 EMU → 1920 px: 1 524 000 EMU = 240 px; 60 pt = 60 × 12 700 EMU = 120 px.
    expect(title?.frame).toEqual({ x: 240, y: 177, width: 1440, height: 376 })
    expect(title?.style).toMatchObject({ fontSize: 120, fontWeight: 700, align: 'center', verticalAlign: 'bottom', color: '#ffffff' })
    expect(title?.style.fontFamily).toMatch(/^"Montserrat"/)
    const lyrics = one?.elements.find((e): e is TextElement => e.type === 'text' && e.name === 'Lyrics')
    expect(lyrics?.style.fontSize).toBe(36) // 36 pt × 50 % shrink = 18 pt = 36 px
    expect(one?.elements.find((e): e is ImageElement => e.type === 'image')).toMatchObject({ mediaId: 'logo-id', fit: 'fill', frame: { x: 1728, y: 0, width: 192, height: 192 } })
    expect(one?.elements.find((e): e is ShapeElement => e.type === 'shape')?.cornerRadius).toBeGreaterThan(0)
    expect(one).toMatchObject({ label: 'Amazing Grace', notes: 'Sing twice', enabled: true, background: { type: 'color', color: '#eeeeee' } })
    expect(two).toMatchObject({ enabled: false, background: { type: 'image', mediaId: 'bg-id', fit: 'cover' } })
  })

  it('centres a 4:3 deck on a 16:9 screen', () => {
    const square = parsePptx((p) => (p === 'ppt/presentation.xml' ? files[p]!.replace('cx="12192000" cy="6858000"', 'cx="9144000" cy="6858000"') : read(p)))
    const slides = deckToSlides(square, { width: 1920, height: 1080 }, () => 'm')
    const logo = slides[0]?.elements.find((e) => e.type === 'image')
    // Scale 1080 / 6 858 000; 4:3 width = 1440 px, centred: 240 px margin each side.
    expect(logo?.frame.x).toBe(240 + Math.round(10972800 * (1080 / 6858000)))
    expect(slides[1]?.background).toMatchObject({ fit: 'contain' })
  })

  it('rejects files that are not presentations', () => {
    expect(() => parsePptx(() => null)).toThrow(/not a PowerPoint/)
  })
})
