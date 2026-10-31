/**
 * PowerPoint (.pptx) → BHCF slides that can be edited in the slide editor.
 *
 * A .pptx is a zip of XML parts. Most of a slide's look is inherited: a slide uses a layout,
 * the layout a master, the master a theme. A title on a slide often has no position, size or
 * colour of its own and takes them from the layout's or master's "placeholder". This module
 * follows that chain for:
 *  - text boxes and placeholders: position, size, rotation, words (one line per paragraph,
 *    bullets kept), font, size, bold / italic / underline, colour, alignment, vertical anchor,
 *    line spacing, "shrink text on overflow";
 *  - shapes (rectangle, rounded rectangle, ellipse; other shapes become rectangles) with solid
 *    or gradient fills and outlines;
 *  - pictures, groups (flattened), tables (as text);
 *  - slide backgrounds (colour, gradient, picture), speaker notes, hidden slides.
 * Each text box takes the style of its first run of text: BHCF text boxes have one style.
 *
 * Pure: the caller hands in the zip's text parts and gets plain data back. `deckToSlides`
 * turns that into slides for the project canvas; pictures are referenced by their path in
 * the zip, which the caller maps to imported media.
 */
import { parseColor, toCss } from './color'
import { createTextElement, defaultTextStyle, newId } from './model/factory'
import type { Background, CanvasSize, Gradient, Id, Rect, ShapeElement, ShapeFill, Slide, SlideElement, TextAlign, VerticalAlign } from './model/types'
import { parseXml, xmlChild, xmlChildren, xmlFind, xmlPath, type XmlNode } from './xml'

/* ------------------------------------------------------------------ */
/* Parsed deck                                                          */
/* ------------------------------------------------------------------ */

/** Position in EMU (914 400 per inch). */
export interface EmuRect {
  x: number
  y: number
  width: number
  height: number
}

export interface PptTextStyle {
  sizePt: number
  bold: boolean
  italic: boolean
  underline: boolean
  color: string
  font: string | null
  align: TextAlign
  anchor: VerticalAlign
  /** 1 = single spacing */
  lineSpacing: number
  /** Exact line spacing in points (overrides lineSpacing), null = proportional */
  lineSpacingPt: number | null
  /** Extra space between letters, in points */
  letterSpacingPt: number
}

export type PptItem =
  | { kind: 'text'; name: string; frame: EmuRect; rotation: number; text: string; style: PptTextStyle; autoFit: boolean; fontScale: number; insetEmu: number }
  | { kind: 'shape'; name: string; frame: EmuRect; rotation: number; shape: 'rectangle' | 'ellipse'; rounded: boolean; fill: ShapeFill | null; line: { color: string; widthEmu: number } | null }
  /** `cropped`: PowerPoint shows only part of the picture (srcRect); filling the frame approximates it */
  | { kind: 'image'; name: string; frame: EmuRect; rotation: number; image: string; cropped: boolean }
  /** A freeform shape or line drawn as SVG; `key` indexes PptDeck.svgs */
  | { kind: 'svg'; name: string; frame: EmuRect; rotation: number; key: string }

export type PptBackground = { type: 'color'; color: string } | { type: 'gradient'; gradient: Gradient } | { type: 'image'; image: string }

export interface PptSlide {
  background: PptBackground | null
  items: PptItem[]
  notes: string
  hidden: boolean
}

export interface PptDeck {
  /** Slide size in EMU */
  width: number
  height: number
  slides: PptSlide[]
  /** Zip paths of every picture used (slides and backgrounds) */
  images: string[]
  /** Things that could not be brought over, for the operator */
  skipped: string[]
  /**
   * SVG pictures of freeform shapes, by item key. A picture inside a shape appears as
   * `{{img:<zip path>}}`, which the caller replaces with the picture's data URI.
   */
  svgs: Record<string, string>
  /** Zip paths of the pictures used inside those SVGs */
  svgImages: string[]
}

/** Reads a part of the zip as text, or null when missing. */
export type PartReader = (path: string) => string | null

/* ------------------------------------------------------------------ */
/* Package helpers                                                      */
/* ------------------------------------------------------------------ */

function resolvePart(from: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1)
  const parts = from.split('/').slice(0, -1)
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop()
    else if (seg !== '.' && seg !== '') parts.push(seg)
  }
  return parts.join('/')
}

interface Rel {
  target: string
  type: string
  external: boolean
}

function relsOf(read: PartReader, part: string): Map<string, Rel> {
  const dir = part.split('/').slice(0, -1).join('/')
  const file = part.split('/').pop() as string
  const xml = read(`${dir}/_rels/${file}.rels`)
  const out = new Map<string, Rel>()
  if (!xml) return out
  for (const r of xmlChildren(xmlChild(parseXml(xml), 'Relationships'), 'Relationship')) {
    const external = r.attrs.TargetMode === 'External'
    if (r.attrs.Id && r.attrs.Target) out.set(r.attrs.Id, { target: external ? r.attrs.Target : resolvePart(part, r.attrs.Target), type: r.attrs.Type ?? '', external })
  }
  return out
}

const relOfType = (rels: Map<string, Rel>, suffix: string): string | null => [...rels.values()].find((r) => r.type.endsWith(suffix) && !r.external)?.target ?? null

const num = (v: string | undefined, fallback = 0): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

/* ------------------------------------------------------------------ */
/* Colours                                                              */
/* ------------------------------------------------------------------ */

const PRESET: Record<string, string> = { black: '000000', white: 'FFFFFF', red: 'FF0000', green: '008000', blue: '0000FF', yellow: 'FFFF00', gray: '808080', grey: '808080' }

interface Theme {
  colors: Record<string, string>
  majorFont: string | null
  minorFont: string | null
}

function readTheme(xml: string | null): Theme {
  const theme: Theme = { colors: {}, majorFont: null, minorFont: null }
  if (!xml) return theme
  const root = parseXml(xml)
  const scheme = xmlFind(root, 'a:clrScheme')
  for (const c of xmlChildren(scheme)) {
    const key = c.name.replace(/^a:/, '')
    const v = xmlChild(c, 'a:srgbClr')?.attrs.val ?? xmlChild(c, 'a:sysClr')?.attrs.lastClr
    if (v) theme.colors[key] = v.toUpperCase()
  }
  theme.majorFont = xmlPath(xmlFind(root, 'a:majorFont'), 'a:latin')?.attrs.typeface || null
  theme.minorFont = xmlPath(xmlFind(root, 'a:minorFont'), 'a:latin')?.attrs.typeface || null
  return theme
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h / 6, s, l]
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l * 255, l * 255, l * 255]
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const f = (t: number): number => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255]
}

interface Ctx {
  theme: Theme
  /** Master colour map: bg1 → lt1, tx1 → dk1… */
  clrMap: Record<string, string>
}

/** A colour element (a:srgbClr, a:schemeClr…) with its modifiers, as a CSS colour. */
function colorFrom(node: XmlNode | undefined, ctx: Ctx, phClr?: string): string | null {
  if (!node) return null
  let hex: string | null = null
  if (node.name === 'a:srgbClr') hex = node.attrs.val ?? null
  else if (node.name === 'a:sysClr') hex = node.attrs.lastClr ?? null
  else if (node.name === 'a:prstClr') hex = PRESET[node.attrs.val ?? ''] ?? null
  else if (node.name === 'a:schemeClr') {
    const val = node.attrs.val ?? ''
    if (val === 'phClr') return phClr ?? null
    const mapped = ctx.clrMap[val] ?? val
    hex = ctx.theme.colors[mapped] ?? ctx.theme.colors[val] ?? null
  } else return null
  const base = hex ? parseColor(`#${hex}`) : null
  if (!base) return null
  let { r, g, b } = base
  let a = 1
  for (const m of node.children) {
    const v = num(m.attrs.val) / 100000
    if (m.name === 'a:alpha') a = v
    else if (m.name === 'a:lumMod' || m.name === 'a:lumOff') {
      const [h, s, l] = rgbToHsl(r, g, b)
      ;[r, g, b] = hslToRgb(h, s, Math.max(0, Math.min(1, m.name === 'a:lumMod' ? l * v : l + v)))
    } else if (m.name === 'a:tint') {
      r += (255 - r) * (1 - v)
      g += (255 - g) * (1 - v)
      b += (255 - b) * (1 - v)
    } else if (m.name === 'a:shade') {
      r *= v
      g *= v
      b *= v
    }
  }
  return toCss({ r, g, b, a })
}

/** The colour inside a fill-like element (a:solidFill, a:fontRef…). */
const colorIn = (node: XmlNode | undefined, ctx: Ctx, phClr?: string): string | null => {
  for (const c of node?.children ?? []) {
    const col = colorFrom(c, ctx, phClr)
    if (col) return col
  }
  return null
}

function gradientFrom(grad: XmlNode, ctx: Ctx, phClr?: string): Gradient | null {
  const stops = xmlChildren(xmlChild(grad, 'a:gsLst'), 'a:gs').flatMap((gs) => {
    const color = colorIn(gs, ctx, phClr)
    return color ? [{ color, position: Math.max(0, Math.min(1, num(gs.attrs.pos) / 100000)) }] : []
  })
  if (stops.length < 2) return null
  const lin = xmlChild(grad, 'a:lin')
  // OOXML: 0° runs left → right, clockwise; CSS: 0° runs upwards, so add 90°.
  if (xmlChild(grad, 'a:path')) return { kind: 'radial', angle: 0, stops }
  return { kind: 'linear', angle: Math.round((num(lin?.attrs.ang) / 60000 + 90) % 360), stops }
}

type FillResult = { kind: 'none' } | { kind: 'solid'; color: string } | { kind: 'gradient'; gradient: Gradient } | { kind: 'image'; image: string } | null

/** Fill of a shape / background properties element (spPr, bgPr); null = not specified. */
function fillOf(props: XmlNode | undefined, ctx: Ctx, rels: Map<string, Rel>, phClr?: string): FillResult {
  for (const c of props?.children ?? []) {
    if (c.name === 'a:noFill') return { kind: 'none' }
    if (c.name === 'a:solidFill') {
      const color = colorIn(c, ctx, phClr)
      return color ? { kind: 'solid', color } : null
    }
    if (c.name === 'a:gradFill') {
      const gradient = gradientFrom(c, ctx, phClr)
      return gradient ? { kind: 'gradient', gradient } : null
    }
    if (c.name === 'a:blipFill' || c.name === 'p:blipFill') {
      const id = xmlChild(c, 'a:blip')?.attrs['r:embed']
      const rel = id ? rels.get(id) : undefined
      return rel && !rel.external ? { kind: 'image', image: rel.target } : null
    }
  }
  return null
}

/* ------------------------------------------------------------------ */
/* Placeholders and text style inheritance                              */
/* ------------------------------------------------------------------ */

interface Part {
  path: string
  root: XmlNode
  rels: Map<string, Rel>
}

function loadPart(read: PartReader, path: string | null): Part | null {
  const xml = path ? read(path) : null
  return path && xml ? { path, root: parseXml(xml), rels: relsOf(read, path) } : null
}

const shapeTree = (part: Part | null): XmlNode | undefined => xmlPath(part?.root.children.find((c) => c.name !== '?xml'), 'p:cSld', 'p:spTree')

interface Ph {
  type: string
  idx: string | null
}

function phOf(sp: XmlNode): Ph | null {
  const nv = xmlChild(sp, 'p:nvSpPr') ?? xmlChild(sp, 'p:nvPicPr') ?? xmlChild(sp, 'p:nvGraphicFramePr')
  const ph = xmlPath(nv, 'p:nvPr', 'p:ph')
  return ph ? { type: ph.attrs.type ?? 'body', idx: ph.attrs.idx ?? null } : null
}

const sameKind = (a: string, b: string): boolean => a === b || (['title', 'ctrTitle'].includes(a) && ['title', 'ctrTitle'].includes(b))

/** The layout / master shape a placeholder inherits from. */
function findPlaceholder(part: Part | null, ph: Ph, byIdx: boolean): XmlNode | undefined {
  const sps = xmlChildren(shapeTree(part)).filter((c) => c.name === 'p:sp')
  if (byIdx && ph.idx !== null) {
    const hit = sps.find((s) => phOf(s)?.idx === ph.idx)
    if (hit) return hit
  }
  return sps.find((s) => {
    const p = phOf(s)
    return !!p && sameKind(p.type, ph.type)
  }) ?? (byIdx ? undefined : sps.find((s) => phOf(s)?.type === 'body' && !['title', 'ctrTitle'].includes(ph.type)))
}

/** Style props gathered from a run / paragraph / list-style level. */
interface RunProps {
  sz?: number
  b?: boolean
  i?: boolean
  u?: boolean
  color?: string
  font?: string
  algn?: string
  bullet?: boolean
  lnSpc?: number
  lnSpcPt?: number
  spc?: number
}

function runProps(rPr: XmlNode | undefined, ctx: Ctx): RunProps {
  const p: RunProps = {}
  if (!rPr) return p
  if (rPr.attrs.sz) p.sz = num(rPr.attrs.sz) / 100
  if (rPr.attrs.spc) p.spc = num(rPr.attrs.spc) / 100
  if (rPr.attrs.b !== undefined) p.b = rPr.attrs.b === '1' || rPr.attrs.b === 'true'
  if (rPr.attrs.i !== undefined) p.i = rPr.attrs.i === '1' || rPr.attrs.i === 'true'
  if (rPr.attrs.u !== undefined) p.u = rPr.attrs.u !== 'none'
  const color = colorIn(xmlChild(rPr, 'a:solidFill'), ctx)
  if (color) p.color = color
  const font = xmlChild(rPr, 'a:latin')?.attrs.typeface
  if (font) p.font = font
  return p
}

function paraProps(pPr: XmlNode | undefined, ctx: Ctx): RunProps {
  const p: RunProps = runProps(xmlChild(pPr, 'a:defRPr'), ctx)
  if (!pPr) return p
  if (pPr.attrs.algn) p.algn = pPr.attrs.algn
  if (xmlChild(pPr, 'a:buNone')) p.bullet = false
  else if (xmlChild(pPr, 'a:buChar') || xmlChild(pPr, 'a:buAutoNum')) p.bullet = true
  const pct = xmlPath(pPr, 'a:lnSpc', 'a:spcPct')?.attrs.val
  if (pct) p.lnSpc = num(pct) / 100000
  const pts = xmlPath(pPr, 'a:lnSpc', 'a:spcPts')?.attrs.val
  if (pts) p.lnSpcPt = num(pts) / 100
  return p
}

const merge = (...layers: RunProps[]): RunProps => Object.assign({}, ...layers.map((l) => Object.fromEntries(Object.entries(l).filter(([, v]) => v !== undefined))))

/** Level-1 list style of a txBody / txStyles entry. */
const level1 = (lst: XmlNode | undefined, ctx: Ctx): RunProps => paraProps(xmlChild(lst, 'a:lvl1pPr'), ctx)

interface BodyProps {
  anchor?: VerticalAlign
  autoFit?: boolean
  fontScale?: number
  /** Left inner margin (EMU); PowerPoint's default is 0.1" */
  inset?: number
}

function bodyProps(bodyPr: XmlNode | undefined): BodyProps {
  const p: BodyProps = {}
  if (!bodyPr) return p
  const a = bodyPr.attrs.anchor
  if (a) p.anchor = a === 'ctr' ? 'middle' : a === 'b' ? 'bottom' : 'top'
  if (bodyPr.attrs.lIns !== undefined) p.inset = Math.max(0, num(bodyPr.attrs.lIns, 91440))
  const norm = xmlChild(bodyPr, 'a:normAutofit')
  if (norm) {
    p.autoFit = true
    if (norm.attrs.fontScale) p.fontScale = num(norm.attrs.fontScale, 100000) / 100000
  } else if (xmlChild(bodyPr, 'a:noAutofit') || xmlChild(bodyPr, 'a:spAutoFit')) p.autoFit = false
  return p
}

/* ------------------------------------------------------------------ */
/* Slides                                                               */
/* ------------------------------------------------------------------ */

interface Transform {
  (r: EmuRect): EmuRect
}

const identity: Transform = (r) => r

function xfrmRect(xfrm: XmlNode | undefined): EmuRect | null {
  const off = xmlChild(xfrm, 'a:off')
  const ext = xmlChild(xfrm, 'a:ext')
  if (!off || !ext) return null
  return { x: num(off.attrs.x), y: num(off.attrs.y), width: num(ext.attrs.cx), height: num(ext.attrs.cy) }
}

interface SlideCtx extends Ctx {
  layout: Part | null
  master: Part | null
  /** presentation defaultTextStyle, master titleStyle / bodyStyle / otherStyle (level 1) */
  defaults: RunProps
  titleStyle: RunProps
  bodyStyle: RunProps
  otherStyle: RunProps
  rels: Map<string, Rel>
  images: Set<string>
  svgs: Map<string, string>
  svgImages: Set<string>
  skipped: string[]
}

function textItem(sp: XmlNode, frame: EmuRect, rotation: number, ctx: SlideCtx, name: string): PptItem | null {
  const txBody = xmlChild(sp, 'p:txBody')
  if (!txBody) return null
  const ph = phOf(sp)
  const layoutPh = ph ? findPlaceholder(ctx.layout, ph, true) : undefined
  const masterPh = ph ? findPlaceholder(ctx.master, ph, false) : undefined
  const isTitle = !!ph && ['title', 'ctrTitle'].includes(ph.type)
  const base = ph ? (isTitle ? ctx.titleStyle : ctx.bodyStyle) : ctx.otherStyle
  const inherited = merge(
    ctx.defaults,
    base,
    level1(xmlPath(masterPh, 'p:txBody', 'a:lstStyle'), ctx),
    level1(xmlPath(layoutPh, 'p:txBody', 'a:lstStyle'), ctx),
    level1(xmlChild(txBody, 'a:lstStyle'), ctx)
  )
  const body = { ...bodyProps(xmlPath(masterPh, 'p:txBody', 'a:bodyPr')), ...bodyProps(xmlPath(layoutPh, 'p:txBody', 'a:bodyPr')), ...bodyProps(xmlChild(txBody, 'a:bodyPr')) }

  let first: RunProps | null = null
  const lines: string[] = []
  for (const p of xmlChildren(txBody, 'a:p')) {
    const pp = merge(inherited, paraProps(xmlChild(p, 'a:pPr'), ctx))
    let line = ''
    for (const r of p.children) {
      if (r.name === 'a:r' || r.name === 'a:fld') {
        const t = xmlChild(r, 'a:t')?.text ?? ''
        if (t && !first) first = merge(pp, runProps(xmlChild(r, 'a:rPr'), ctx))
        line += t
      } else if (r.name === 'a:br') line += '\n'
    }
    // Body placeholders show bullets unless turned off (titles never do).
    if (line.trim() && pp.bullet && !isTitle) line = `• ${line}`
    lines.push(line)
    first ??= line.trim() ? pp : null
  }
  while (lines.length && !lines[lines.length - 1]?.trim()) lines.pop()
  // Leading empty paragraphs stay: decks use them to push text down within its box.
  const text = lines.join('\n')
  if (!text.trim()) return null
  const s = merge(inherited, first ?? {})
  const font = s.font === '+mj-lt' ? ctx.theme.majorFont : s.font === '+mn-lt' ? ctx.theme.minorFont : s.font?.startsWith('+') ? null : (s.font ?? (isTitle ? ctx.theme.majorFont : ctx.theme.minorFont))
  const align: TextAlign = s.algn === 'ctr' ? 'center' : s.algn === 'r' ? 'right' : s.algn === 'just' || s.algn === 'dist' ? 'justify' : 'left'
  return {
    kind: 'text',
    name,
    frame,
    rotation,
    text,
    style: {
      sizePt: s.sz ?? 18,
      bold: !!s.b,
      italic: !!s.i,
      underline: !!s.u,
      color: s.color ?? colorFrom({ name: 'a:schemeClr', attrs: { val: 'tx1' }, children: [], text: '' }, ctx) ?? '#000000',
      font: font || null,
      align,
      anchor: body.anchor ?? 'top',
      lineSpacing: s.lnSpc ?? 1,
      lineSpacingPt: s.lnSpcPt ?? null,
      letterSpacingPt: s.spc ?? 0
    },
    autoFit: body.autoFit ?? false,
    fontScale: body.fontScale ?? 1,
    insetEmu: body.inset ?? 91440
  }
}

function shapeItem(sp: XmlNode, frame: EmuRect, rotation: number, ctx: SlideCtx, name: string): PptItem | null {
  const spPr = xmlChild(sp, 'p:spPr')
  const style = xmlChild(sp, 'p:style')
  let fill = fillOf(spPr, ctx, ctx.rels)
  // No fill of its own: the shape style's fill (PowerPoint's default blue shapes).
  if (!fill && style && num(xmlChild(style, 'a:fillRef')?.attrs.idx) > 0 && !xmlPath(sp, 'p:nvSpPr', 'p:cNvSpPr')?.attrs.txBox) {
    const color = colorIn(xmlChild(style, 'a:fillRef'), ctx)
    fill = color ? { kind: 'solid', color } : null
  }
  const ln = xmlChild(spPr, 'a:ln')
  let line: { color: string; widthEmu: number } | null = null
  if (ln && !xmlChild(ln, 'a:noFill')) {
    const color = colorIn(xmlChild(ln, 'a:solidFill'), ctx)
    if (color) line = { color, widthEmu: num(ln.attrs.w, 12700) }
  } else if (!ln && style && num(xmlChild(style, 'a:lnRef')?.attrs.idx) > 0 && !xmlPath(sp, 'p:nvSpPr', 'p:cNvSpPr')?.attrs.txBox) {
    const color = colorIn(xmlChild(style, 'a:lnRef'), ctx)
    if (color) line = { color, widthEmu: 12700 }
  }
  // Freeform shapes and lines: drawn exactly, as a small SVG picture.
  const xfrm = xmlChild(spPr, 'a:xfrm')
  const custGeom = xmlChild(spPr, 'a:custGeom')
  const prstName = xmlChild(spPr, 'a:prstGeom')?.attrs.prst ?? (custGeom ? null : 'rect')
  const isLine = !!prstName && (prstName === 'line' || /Connector/.test(prstName))
  if ((custGeom || isLine) && (fill || line)) {
    const drawn = shapeSvg(frame, custGeom, isLine, fill, line, { h: xfrm?.attrs.flipH === '1', v: xfrm?.attrs.flipV === '1' }, isCropped(xmlChild(spPr, 'a:blipFill')))
    if (drawn) {
      const key = 'svg:' + (ctx.svgs.size + 1)
      ctx.svgs.set(key, drawn.svg)
      if (fill?.kind === 'image') ctx.svgImages.add(fill.image)
      return { kind: 'svg', name, frame: drawn.frame, rotation, key }
    }
    if (isLine) return null
  }
  if (fill?.kind === 'image') {
    ctx.images.add(fill.image)
    return { kind: 'image', name, frame, rotation, image: fill.image, cropped: isCropped(xmlChild(spPr, 'a:blipFill')) }
  }
  const visibleFill = fill && (fill.kind === 'solid' || fill.kind === 'gradient') ? (fill.kind === 'solid' ? { type: 'solid' as const, color: fill.color } : { type: 'gradient' as const, gradient: fill.gradient }) : null
  if (!visibleFill && !line) return null
  const prst = xmlChild(spPr, 'a:prstGeom')?.attrs.prst ?? 'rect'
  return { kind: 'shape', name, frame, rotation, shape: prst === 'ellipse' ? 'ellipse' : 'rectangle', rounded: prst.startsWith('round'), fill: visibleFill, line }
}

/* ------------------------------------------------------------------ */
/* Freeform shapes → SVG                                                */
/* ------------------------------------------------------------------ */

const fmt = (n: number): string => String(Math.round(n * 10) / 10)
const escAttr = (s: string): string => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

/** One a:path of a custom geometry as SVG path data, in the path's own w × h space; null when unreadable. */
function pathData(path: XmlNode): string | null {
  let d = ''
  let x = 0
  let y = 0
  const pt = (n: XmlNode | undefined): [number, number] | null => {
    const a = Number(n?.attrs.x)
    const b = Number(n?.attrs.y)
    return Number.isFinite(a) && Number.isFinite(b) ? [a, b] : null
  }
  for (const c of path.children) {
    const pts = xmlChildren(c, 'a:pt').map(pt)
    if (pts.some((p) => !p)) return null
    const ps = pts as [number, number][]
    if (c.name === 'a:moveTo' && ps[0]) {
      ;[x, y] = ps[0]
      d += 'M' + fmt(x) + ' ' + fmt(y)
    } else if (c.name === 'a:lnTo' && ps[0]) {
      ;[x, y] = ps[0]
      d += 'L' + fmt(x) + ' ' + fmt(y)
    } else if (c.name === 'a:cubicBezTo' && ps.length === 3) {
      d += 'C' + ps.map((p) => fmt(p[0]) + ' ' + fmt(p[1])).join(' ')
      ;[x, y] = ps[2] as [number, number]
    } else if (c.name === 'a:quadBezTo' && ps.length === 2) {
      d += 'Q' + ps.map((p) => fmt(p[0]) + ' ' + fmt(p[1])).join(' ')
      ;[x, y] = ps[1] as [number, number]
    } else if (c.name === 'a:arcTo') {
      const wR = Number(c.attrs.wR)
      const hR = Number(c.attrs.hR)
      const st = (Number(c.attrs.stAng) / 60000) * (Math.PI / 180)
      const sw = (Number(c.attrs.swAng) / 60000) * (Math.PI / 180)
      if (![wR, hR, st, sw].every(Number.isFinite)) return null
      if (!wR || !hR || !sw) continue
      // DrawingML angles are "visual"; convert to the ellipse's parametric angle.
      const param = (a: number): number => Math.atan2(wR * Math.sin(a), hR * Math.cos(a))
      const cx = x - wR * Math.cos(param(st))
      const cy = y - hR * Math.sin(param(st))
      // A full turn is drawn as two halves (an SVG arc cannot end where it starts).
      const steps = Math.abs(sw) >= 2 * Math.PI - 1e-6 ? 2 : 1
      for (let i = 1; i <= steps; i++) {
        const a = param(st + (sw * i) / steps)
        const nx = cx + wR * Math.cos(a)
        const ny = cy + hR * Math.sin(a)
        d += 'A' + fmt(wR) + ' ' + fmt(hR) + ' 0 ' + (Math.abs(sw / steps) > Math.PI ? 1 : 0) + ' ' + (sw > 0 ? 1 : 0) + ' ' + fmt(nx) + ' ' + fmt(ny)
        x = nx
        y = ny
      }
    } else if (c.name === 'a:close') d += 'Z'
  }
  return d || null
}

/**
 * An SVG picture of a freeform shape or a line: fill (colour, gradient or a picture cut to the
 * shape) and outline. Coordinates are EMU; the picture is stretched over the returned frame.
 */
function shapeSvg(
  frame: EmuRect,
  custGeom: XmlNode | undefined,
  isLine: boolean,
  fill: FillResult,
  line: { color: string; widthEmu: number } | null,
  flip: { h: boolean; v: boolean },
  cropped: boolean
): { svg: string; frame: EmuRect } | null {
  const W = Math.max(frame.width, 1)
  const H = Math.max(frame.height, 1)
  // Room for the outline around the shape.
  const pad = line ? line.widthEmu : 0
  const defs: string[] = []
  const body: string[] = []
  const stroke = line ? ' stroke="' + escAttr(line.color) + '" stroke-width="' + fmt(line.widthEmu) + '" stroke-linejoin="round" stroke-linecap="round"' : ' stroke="none"'
  let fillAttr = 'none'
  if (fill?.kind === 'solid') fillAttr = escAttr(fill.color)
  else if (fill?.kind === 'gradient') {
    const stops = fill.gradient.stops.map((s) => '<stop offset="' + s.position + '" stop-color="' + escAttr(s.color) + '"/>').join('')
    defs.push('<linearGradient id="g" gradientTransform="rotate(' + fmt(fill.gradient.angle - 90) + ' .5 .5)">' + stops + '</linearGradient>')
    fillAttr = 'url(#g)'
  }
  const flipT = 'translate(' + (flip.h ? W : 0) + ' ' + (flip.v ? H : 0) + ') scale(' + (flip.h ? -1 : 1) + ' ' + (flip.v ? -1 : 1) + ')'

  if (isLine) {
    if (!line) return null
    body.push('<line x1="0" y1="0" x2="' + fmt(W) + '" y2="' + fmt(H) + '"' + stroke + ' transform="' + flipT + '"/>')
  } else {
    const paths = xmlChildren(xmlChild(custGeom, 'a:pathLst'), 'a:path')
    if (paths.length === 0) return null
    const shapes: { d: string; t: string; fill: boolean; stroke: boolean }[] = []
    for (const p of paths) {
      const d = pathData(p)
      if (!d) return null
      const pw = Number(p.attrs.w) || W
      const ph = Number(p.attrs.h) || H
      shapes.push({ d, t: flipT + ' scale(' + W / pw + ' ' + H / ph + ')', fill: p.attrs.fill !== 'none', stroke: p.attrs.stroke !== '0' && p.attrs.stroke !== 'false' })
    }
    if (fill?.kind === 'image') {
      // The picture, cut to the shape.
      defs.push('<clipPath id="c">' + shapes.filter((s) => s.fill).map((s) => '<path d="' + s.d + '" transform="' + s.t + '"/>').join('') + '</clipPath>')
      body.push('<image href="{{img:' + escAttr(fill.image) + '}}" x="0" y="0" width="' + fmt(W) + '" height="' + fmt(H) + '" preserveAspectRatio="' + (cropped ? 'xMidYMid slice' : 'none') + '" clip-path="url(#c)"/>')
      fillAttr = 'none'
    }
    for (const s of shapes) {
      body.push('<path d="' + s.d + '" transform="' + s.t + '" fill="' + (s.fill ? fillAttr : 'none') + '"' + (s.stroke ? stroke : ' stroke="none"') + '/>')
    }
  }
  const vb = fmt(-pad) + ' ' + fmt(-pad) + ' ' + fmt(W + pad * 2) + ' ' + fmt(H + pad * 2)
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb + '" preserveAspectRatio="none">' + (defs.length ? '<defs>' + defs.join('') + '</defs>' : '') + body.join('') + '</svg>'
  return { svg, frame: { x: frame.x - pad, y: frame.y - pad, width: W + pad * 2, height: H + pad * 2 } }
}

/** A picture fill showing only part of the image (cropped in PowerPoint). */
function isCropped(blipFill: XmlNode | undefined): boolean {
  const r = xmlChild(blipFill, 'a:srcRect')
  return !!r && ['l', 't', 'r', 'b'].some((k) => num(r.attrs[k]) !== 0)
}

/** Every item of a shape tree, groups flattened into slide coordinates. */
function walk(tree: XmlNode | undefined, ctx: SlideCtx, transform: Transform, out: PptItem[]): void {
  for (const node of tree?.children ?? []) {
    const nvName = (xmlFind(node, 'p:cNvPr')?.attrs.name ?? '').slice(0, 60)
    if (node.name === 'p:grpSp') {
      const x = xmlPath(node, 'p:grpSpPr', 'a:xfrm')
      const outer = xfrmRect(x)
      const chOff = xmlChild(x, 'a:chOff')
      const chExt = xmlChild(x, 'a:chExt')
      if (outer && chOff && chExt && num(chExt.attrs.cx) && num(chExt.attrs.cy)) {
        const sx = outer.width / num(chExt.attrs.cx)
        const sy = outer.height / num(chExt.attrs.cy)
        const cx = num(chOff.attrs.x)
        const cy = num(chOff.attrs.y)
        const inner: Transform = (r) => transform({ x: outer.x + (r.x - cx) * sx, y: outer.y + (r.y - cy) * sy, width: r.width * sx, height: r.height * sy })
        walk(node, ctx, inner, out)
      } else walk(node, ctx, transform, out)
      continue
    }
    if (node.name === 'mc:AlternateContent') {
      // Newer features with a fallback for older readers: use the fallback.
      walk(xmlChild(node, 'mc:Fallback'), ctx, transform, out)
      continue
    }
    const ph = node.name === 'p:sp' || node.name === 'p:pic' ? phOf(node) : null
    let rect = xfrmRect(xmlPath(node, node.name === 'p:graphicFrame' ? 'p:xfrm' : 'p:spPr', 'a:xfrm') ?? (node.name === 'p:graphicFrame' ? xmlChild(node, 'p:xfrm') : undefined))
    const xfrm = xmlPath(node, 'p:spPr', 'a:xfrm') ?? xmlChild(node, 'p:xfrm')
    if (!rect && ph) {
      const inherited = findPlaceholder(ctx.layout, ph, true) ?? findPlaceholder(ctx.master, ph, false)
      rect = xfrmRect(xmlPath(inherited, 'p:spPr', 'a:xfrm'))
    }
    if (!rect) continue
    const frame = transform(rect)
    const rotation = Math.round(num(xfrm?.attrs.rot) / 60000)
    if (node.name === 'p:sp') {
      const shape = shapeItem(node, frame, rotation, ctx, nvName || 'Shape')
      if (shape) out.push(shape)
      const text = textItem(node, frame, rotation, ctx, nvName || 'Text')
      if (text) out.push(text)
    } else if (node.name === 'p:pic') {
      if (xmlFind(node, 'a:videoFile') || xmlFind(node, 'a:audioFile')) ctx.skipped.push('a video or sound (its preview picture was kept)')
      const fill = fillOf(node, ctx, ctx.rels)
      if (fill?.kind === 'image') {
        ctx.images.add(fill.image)
        out.push({ kind: 'image', name: nvName || 'Picture', frame, rotation, image: fill.image, cropped: isCropped(xmlChild(node, 'p:blipFill')) })
      }
    } else if (node.name === 'p:graphicFrame') {
      const tbl = xmlFind(node, 'a:tbl')
      if (tbl) {
        const rows = xmlChildren(tbl, 'a:tr').map((tr) =>
          xmlChildren(tr, 'a:tc')
            .map((tc) => xmlChildren(xmlChild(tc, 'a:txBody'), 'a:p').map((p) => xmlChildren(p, 'a:r').map((r) => xmlChild(r, 'a:t')?.text ?? '').join('')).join(' '))
            .join('    ')
        )
        const text = rows.join('\n').trim()
        if (text) {
          const style = merge(ctx.defaults, ctx.otherStyle)
          out.push({
            kind: 'text',
            name: nvName || 'Table',
            frame,
            rotation: 0,
            text,
            style: { sizePt: style.sz ?? 18, bold: false, italic: false, underline: false, color: style.color ?? '#000000', font: ctx.theme.minorFont, align: 'left', anchor: 'top', lineSpacing: 1, lineSpacingPt: null, letterSpacingPt: 0 },
            autoFit: true,
            fontScale: 1,
            insetEmu: 91440
          })
        }
      } else ctx.skipped.push('a chart or diagram')
    }
  }
}

function backgroundOf(part: Part | null, ctx: SlideCtx): PptBackground | null {
  const bg = xmlPath(part?.root.children.find((c) => c.name !== '?xml'), 'p:cSld', 'p:bg')
  if (!bg || !part) return null
  const bgPr = xmlChild(bg, 'p:bgPr')
  if (bgPr) {
    const f = fillOf(bgPr, ctx, part.rels)
    if (f?.kind === 'solid') return { type: 'color', color: f.color }
    if (f?.kind === 'gradient') return { type: 'gradient', gradient: f.gradient }
    if (f?.kind === 'image') {
      ctx.images.add(f.image)
      return { type: 'image', image: f.image }
    }
    return null
  }
  // A theme background style tinted with the given colour; use that colour.
  const color = colorIn(xmlChild(bg, 'p:bgRef'), ctx)
  return color ? { type: 'color', color } : null
}

function notesOf(read: PartReader, rels: Map<string, Rel>): string {
  const part = loadPart(read, relOfType(rels, '/notesSlide'))
  const body = xmlChildren(shapeTree(part)).find((s) => s.name === 'p:sp' && phOf(s)?.type === 'body')
  return xmlChildren(xmlChild(body, 'p:txBody'), 'a:p')
    .map((p) => xmlChildren(p, 'a:r').map((r) => xmlChild(r, 'a:t')?.text ?? '').join(''))
    .join('\n')
    .trim()
}

/** Reads a .pptx (its parts via `read`) into plain slide data. */
export function parsePptx(read: PartReader): PptDeck {
  const presPath = 'ppt/presentation.xml'
  const presXml = read(presPath)
  if (!presXml) throw new Error('This is not a PowerPoint presentation (.pptx).')
  const pres = parseXml(presXml)
  const presRoot = xmlChild(pres, 'p:presentation')
  const sz = xmlChild(presRoot, 'p:sldSz')
  const width = num(sz?.attrs.cx, 12192000)
  const height = num(sz?.attrs.cy, 6858000)
  const presRels = relsOf(read, presPath)
  const defaults = level1(xmlChild(presRoot, 'p:defaultTextStyle'), { theme: { colors: {}, majorFont: null, minorFont: null }, clrMap: {} })
  const slidePaths = xmlChildren(xmlChild(presRoot, 'p:sldIdLst'), 'p:sldId').flatMap((s) => {
    const rel = presRels.get(s.attrs['r:id'] ?? '')
    return rel && !rel.external ? [rel.target] : []
  })

  const images = new Set<string>()
  const svgs = new Map<string, string>()
  const svgImages = new Set<string>()
  const skipped: string[] = []
  const masters = new Map<string, { part: Part | null; ctx: Ctx; title: XmlNode | undefined; body: XmlNode | undefined; other: XmlNode | undefined }>()
  const slides: PptSlide[] = []

  for (const path of slidePaths) {
    const slide = loadPart(read, path)
    if (!slide) continue
    const layout = loadPart(read, relOfType(slide.rels, '/slideLayout'))
    const masterPath = layout ? relOfType(layout.rels, '/slideMaster') : null
    let m = masterPath ? masters.get(masterPath) : undefined
    if (!m) {
      const master = loadPart(read, masterPath)
      const theme = readTheme(master ? read(relOfType(master.rels, '/theme') ?? '') : null)
      const clrMapNode = xmlChild(master?.root.children.find((c) => c.name !== '?xml'), 'p:clrMap')
      const clrMap = clrMapNode?.attrs ?? { bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2' }
      const txStyles = xmlChild(master?.root.children.find((c) => c.name !== '?xml'), 'p:txStyles')
      m = { part: master, ctx: { theme, clrMap }, title: xmlChild(txStyles, 'p:titleStyle'), body: xmlChild(txStyles, 'p:bodyStyle'), other: xmlChild(txStyles, 'p:otherStyle') }
      if (masterPath) masters.set(masterPath, m)
    }
    // A slide or layout can override the master's colour map.
    const override = xmlPath(slide.root.children.find((c) => c.name !== '?xml'), 'p:clrMapOvr', 'a:overrideClrMapping')?.attrs
    const base: Ctx = { theme: m.ctx.theme, clrMap: override ?? m.ctx.clrMap }
    const ctx: SlideCtx = {
      ...base,
      layout,
      master: m.part,
      defaults: merge(defaults),
      titleStyle: level1(m.title, base),
      bodyStyle: level1(m.body, base),
      otherStyle: level1(m.other, base),
      rels: slide.rels,
      images,
      svgs,
      svgImages,
      skipped
    }
    const items: PptItem[] = []
    walk(shapeTree(slide), ctx, identity, items)
    slides.push({
      background: backgroundOf(slide, ctx) ?? backgroundOf(layout, ctx) ?? backgroundOf(m.part, ctx),
      items,
      notes: notesOf(read, slide.rels),
      hidden: slide.root.children.find((c) => c.name === 'p:sld')?.attrs.show === '0'
    })
  }
  return { width, height, slides, images: [...images], skipped: [...new Set(skipped)], svgs: Object.fromEntries(svgs), svgImages: [...svgImages] }
}

/* ------------------------------------------------------------------ */
/* Deck → BHCF slides                                                   */
/* ------------------------------------------------------------------ */

/**
 * Slides for a canvas: the deck is scaled to fit (centred if the shapes differ, e.g. a 4:3 deck
 * on a 16:9 screen). `media` maps a picture's zip path to its imported media id.
 */
export function deckToSlides(deck: PptDeck, canvas: CanvasSize, media: (image: string) => Id | null): Slide[] {
  const scale = Math.min(canvas.width / deck.width, canvas.height / deck.height)
  const ox = (canvas.width - deck.width * scale) / 2
  const oy = (canvas.height - deck.height * scale) / 2
  const rect = (r: EmuRect): Rect => ({ x: Math.round(ox + r.x * scale), y: Math.round(oy + r.y * scale), width: Math.max(1, Math.round(r.width * scale)), height: Math.max(1, Math.round(r.height * scale)) })
  const pxPerPt = 12700 * scale
  const letterbox = ox > 1 || oy > 1

  return deck.slides.map((s, index) => {
    const elements: SlideElement[] = []
    for (const item of s.items) {
      if (item.kind === 'text') {
        const st = item.style
        const fontSize = Math.max(8, Math.round(st.sizePt * item.fontScale * pxPerPt))
        const el = createTextElement(
          canvas,
          item.text,
          {
            ...defaultTextStyle(),
            fontFamily: st.font ? `"${st.font.replace(/"/g, '')}", Segoe UI, Arial, sans-serif` : defaultTextStyle().fontFamily,
            fontSize,
            fontWeight: st.bold ? 700 : 400,
            italic: st.italic,
            underline: st.underline,
            color: st.color,
            align: st.align,
            verticalAlign: st.anchor,
            // PowerPoint's single spacing is about 1.2 lines in CSS.
            lineHeight: Math.round((st.lineSpacingPt ? (st.lineSpacingPt * pxPerPt) / fontSize : st.lineSpacing * 1.2) * 100) / 100,
            letterSpacing: Math.round(st.letterSpacingPt * item.fontScale * pxPerPt * 10) / 10
          },
          rect(item.frame)
        )
        el.name = item.name
        el.rotation = item.rotation
        el.shadow = null
        // The box's inner margin (PowerPoint's default is 0.1").
        el.padding = Math.round(item.insetEmu * scale)
        // PowerPoint already shrank "shrink on overflow" text (fontScale) and lets text run past
        // its box; do the same rather than shrinking again or cutting it off.
        el.autoFit = false
        el.overflow = true
        elements.push(el)
      } else if (item.kind === 'shape') {
        const frame = rect(item.frame)
        const shape: ShapeElement = {
          id: newId(),
          name: item.name,
          frame,
          rotation: item.rotation,
          opacity: 1,
          locked: false,
          hidden: false,
          shadow: null,
          type: 'shape',
          shape: item.shape,
          fill: item.fill ?? { type: 'solid', color: 'rgba(0,0,0,0)' },
          strokeColor: item.line?.color ?? '#000000',
          strokeWidth: item.line ? Math.max(1, Math.round(item.line.widthEmu * scale)) : 0,
          cornerRadius: item.rounded ? Math.round(Math.min(frame.width, frame.height) * 0.1667) : 0
        }
        elements.push(shape)
      } else if (item.kind === 'svg') {
        const mediaId = media(item.key)
        if (mediaId) elements.push({ id: newId(), name: item.name, frame: rect(item.frame), rotation: item.rotation, opacity: 1, locked: false, hidden: false, shadow: null, type: 'image', mediaId, fit: 'fill' })
      } else {
        const mediaId = media(item.image)
        if (mediaId) elements.push({ id: newId(), name: item.name, frame: rect(item.frame), rotation: item.rotation, opacity: 1, locked: false, hidden: false, shadow: null, type: 'image', mediaId, fit: item.cropped ? 'cover' : 'fill' })
      }
    }
    let background: Background | null = null
    const bg = s.background
    if (bg?.type === 'color') background = { type: 'color', color: bg.color }
    else if (bg?.type === 'gradient') background = { type: 'gradient', gradient: bg.gradient }
    else if (bg?.type === 'image') {
      const mediaId = media(bg.image)
      if (mediaId) background = { type: 'image', mediaId, fit: letterbox ? 'contain' : 'cover' }
    }
    // White, like PowerPoint, when the deck sets no background at all.
    background ??= { type: 'color', color: '#ffffff' }
    const label = (s.items.find((i) => i.kind === 'text') as { text: string } | undefined)?.text.split('\n').find((l) => l.trim())?.trim().slice(0, 40) ?? ''
    return { id: newId(), label: label || `Slide ${index + 1}`, color: null, groupId: null, elements, background, notes: s.notes, transition: null, enabled: !s.hidden }
  })
}
