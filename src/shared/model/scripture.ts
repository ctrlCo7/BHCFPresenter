/** Scripture → slides, formatted for readability on a projector. */
import { formatReference, superscriptNumber, type BibleBook, type Verse } from '../bible'
import { createPresentation, createTextElement, defaultTextStyle, newId } from './factory'
import type { CanvasSize, Presentation, Rect, Slide, TextStyle } from './types'

/** How two translations share a slide: columns, or one above the other. */
export type ParallelLayout = 'side' | 'stacked'

export interface ScriptureOptions {
  versesPerSlide: number
  showVerseNumbers: boolean
  /** Translation abbreviation shown after the reference, e.g. "KJV" */
  translation: string
  baseStyle?: TextStyle
  /** A second translation shown with the first (bilingual services) */
  parallel?: {
    translation: string
    /** The same chapter in the second translation; matched by verse number */
    verses: Verse[]
    layout: ParallelLayout
  }
}

const verseText = (group: Verse[], numbers: boolean): string => group.map((v) => (numbers ? `${superscriptNumber(v.verse)} ${v.text}` : v.text)).join(' ')

export function scriptureSlides(bookName: string, verses: Verse[], canvas: CanvasSize, opts: ScriptureOptions): Slide[] {
  const W = canvas.width
  const H = canvas.height
  const base = opts.baseStyle ?? defaultTextStyle()
  const second = opts.parallel
  const bodyStyle: TextStyle = { ...base, fontSize: Math.round(base.fontSize * (second ? 0.6 : 0.8)), fontWeight: 500, lineHeight: 1.3 }
  const refStyle: TextStyle = { ...base, fontSize: Math.round(base.fontSize * 0.5), fontWeight: 700, align: 'right', verticalAlign: 'bottom' }
  const x = Math.round(W * 0.06)
  const w = Math.round(W * 0.88)
  const top = Math.round(H * 0.07)
  const h = Math.round(H * 0.7)
  // Text boxes for one translation, or for both.
  const gap = Math.round(W * 0.03)
  const boxes: Rect[] = !second
    ? [{ x, y: top, width: w, height: h }]
    : second.layout === 'side'
      ? [
          { x, y: top, width: Math.round((w - gap) / 2), height: h },
          { x: x + Math.round((w + gap) / 2), y: top, width: Math.round((w - gap) / 2), height: h }
        ]
      : [
          { x, y: top, width: w, height: Math.round((h - gap) / 2) },
          { x, y: top + Math.round((h + gap) / 2), width: w, height: Math.round((h - gap) / 2) }
        ]
  const label = opts.translation + (second?.translation ? ` · ${second.translation}` : '')
  const byVerse = new Map((second?.verses ?? []).map((v) => [v.verse, v]))
  const per = Math.max(1, opts.versesPerSlide)
  const slides: Slide[] = []
  for (let i = 0; i < verses.length; i += per) {
    const group = verses.slice(i, i + per)
    const first = group[0] as Verse
    const reference = formatReference(bookName, first.chapter, group.map((v) => v.verse)) + (label ? ` (${label})` : '')
    const texts = [verseText(group, opts.showVerseNumbers)]
    if (second) texts.push(verseText(group.flatMap((v) => (byVerse.get(v.verse)?.text ? [byVerse.get(v.verse) as Verse] : [])), opts.showVerseNumbers))
    const bodies = texts.map((t, k) => {
      const el = createTextElement(canvas, t, { ...bodyStyle, ...(second && second.layout === 'side' ? { verticalAlign: 'top' as const } : {}) }, boxes[k] as Rect)
      el.name = second ? `Verse (${k === 0 ? opts.translation : second.translation})` : 'Verse'
      if (second) el.autoFit = true
      return el
    })
    const ref = createTextElement(canvas, reference, refStyle, { x, y: Math.round(H * 0.8), width: w, height: Math.round(H * 0.13) })
    ref.name = 'Reference'
    ref.autoFit = true
    slides.push({ id: newId(), label: reference, color: '#a16207', groupId: null, elements: [...bodies, ref], background: null, notes: '', transition: null, enabled: true })
  }
  return slides
}

export function scripturePresentation(bookName: string, verses: Verse[], canvas: CanvasSize, opts: ScriptureOptions): Presentation {
  const first = verses[0]
  const label = opts.translation + (opts.parallel?.translation ? ` + ${opts.parallel.translation}` : '')
  const name = first ? formatReference(bookName, first.chapter, verses.map((v) => v.verse)) + (label ? ` ${label}` : '') : 'Scripture'
  const pres = createPresentation(name, scriptureSlides(bookName, verses, canvas, opts), 'scripture')
  pres.meta = { reference: name, translation: label }
  return pres
}

/**
 * The index of `book` (from `from`) in another translation's book list: the same position when
 * both have the same books, else matched by abbreviation or name; null when it has no such book.
 */
export function matchingBook(from: BibleBook[], to: BibleBook[], book: number): number | null {
  if (from.length === to.length) return to[book] ? book : null
  const b = from[book]
  if (!b) return null
  const key = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const hit = to.find((t) => key(t.abbrev) === key(b.abbrev)) ?? to.find((t) => key(t.name) === key(b.name))
  return hit ? hit.index : null
}
