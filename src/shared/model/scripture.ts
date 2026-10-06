/** Scripture → slides, formatted for readability on a projector. */
import { formatReference, superscriptNumber, type Verse } from '../bible'
import { createPresentation, createTextElement, defaultTextStyle, newId } from './factory'
import type { CanvasSize, Presentation, Slide, TextStyle } from './types'

export interface ScriptureOptions {
  versesPerSlide: number
  showVerseNumbers: boolean
  /** Translation abbreviation shown after the reference, e.g. "KJV" */
  translation: string
  baseStyle?: TextStyle
}

export function scriptureSlides(bookName: string, verses: Verse[], canvas: CanvasSize, opts: ScriptureOptions): Slide[] {
  const W = canvas.width
  const H = canvas.height
  const base = opts.baseStyle ?? defaultTextStyle()
  const bodyStyle: TextStyle = { ...base, fontSize: Math.round(base.fontSize * 0.8), fontWeight: 500, lineHeight: 1.3 }
  const refStyle: TextStyle = { ...base, fontSize: Math.round(base.fontSize * 0.5), fontWeight: 700, align: 'right', verticalAlign: 'bottom' }
  const per = Math.max(1, opts.versesPerSlide)
  const slides: Slide[] = []
  for (let i = 0; i < verses.length; i += per) {
    const group = verses.slice(i, i + per)
    const first = group[0] as Verse
    const body = group.map((v) => (opts.showVerseNumbers ? `${superscriptNumber(v.verse)} ${v.text}` : v.text)).join(' ')
    const reference = formatReference(bookName, first.chapter, group.map((v) => v.verse)) + (opts.translation ? ` (${opts.translation})` : '')
    const text = createTextElement(canvas, body, bodyStyle, { x: Math.round(W * 0.06), y: Math.round(H * 0.07), width: Math.round(W * 0.88), height: Math.round(H * 0.7) })
    text.name = 'Verse'
    const ref = createTextElement(canvas, reference, refStyle, { x: Math.round(W * 0.06), y: Math.round(H * 0.8), width: Math.round(W * 0.88), height: Math.round(H * 0.13) })
    ref.name = 'Reference'
    ref.autoFit = true
    slides.push({ id: newId(), label: reference, color: '#a16207', groupId: null, elements: [text, ref], background: null, notes: '', transition: null, enabled: true })
  }
  return slides
}

export function scripturePresentation(bookName: string, verses: Verse[], canvas: CanvasSize, opts: ScriptureOptions): Presentation {
  const first = verses[0]
  const name = first ? formatReference(bookName, first.chapter, verses.map((v) => v.verse)) + (opts.translation ? ` ${opts.translation}` : '') : 'Scripture'
  const pres = createPresentation(name, scriptureSlides(bookName, verses, canvas, opts), 'scripture')
  pres.meta = { reference: name, translation: opts.translation }
  return pres
}
