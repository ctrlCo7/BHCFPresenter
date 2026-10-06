import { produce } from 'immer'
import { describe, expect, it } from 'vitest'
import { createEmptySlide, createPresentation, createShapeElement, createSlide } from '@shared/model/factory'
import type { Presentation, Slide, TextElement } from '@shared/model/types'
import { alignElements, applyDesignToSlides, distributeElements, duplicateElementsIn, reorderElements, type ApplyDesignOptions } from './elementOps'

const canvas = { width: 1920, height: 1080 }

function slideWith(n: number): Slide {
  const s = createEmptySlide()
  for (let i = 0; i < n; i++) {
    const e = createShapeElement(canvas, 'rectangle')
    e.frame = { x: i * 100, y: 0, width: 50, height: 50 }
    e.name = `e${i}`
    s.elements.push(e)
  }
  return s
}

const names = (s: Slide): string[] => s.elements.map((e) => e.name)

describe('element ordering', () => {
  it('moves a selection forward / backward / to front / to back', () => {
    const s = slideWith(4)
    const id = (i: number): string => s.elements[i]?.id as string
    expect(names(produce(s, (d) => reorderElements(d, [id(0)], 'forward')))).toEqual(['e1', 'e0', 'e2', 'e3'])
    expect(names(produce(s, (d) => reorderElements(d, [id(3)], 'backward')))).toEqual(['e0', 'e1', 'e3', 'e2'])
    expect(names(produce(s, (d) => reorderElements(d, [id(0), id(1)], 'front')))).toEqual(['e2', 'e3', 'e0', 'e1'])
    expect(names(produce(s, (d) => reorderElements(d, [id(2), id(3)], 'back')))).toEqual(['e2', 'e3', 'e0', 'e1'])
  })
})

describe('align and distribute', () => {
  it('aligns a single element to the canvas', () => {
    const s = slideWith(1)
    const out = produce(s, (d) => alignElements(d, [s.elements[0]?.id as string], 'hcenter', canvas))
    expect(out.elements[0]?.frame.x).toBe((1920 - 50) / 2)
  })

  it('aligns several elements to their combined bounds', () => {
    const s = slideWith(3)
    const out = produce(s, (d) => alignElements(d, s.elements.map((e) => e.id), 'right', canvas))
    expect(out.elements.map((e) => e.frame.x)).toEqual([200, 200, 200])
  })

  it('distributes with equal gaps', () => {
    const s = produce(slideWith(3), (d) => {
      ;(d.elements[1] as { frame: { x: number } }).frame.x = 20
    })
    const out = produce(s, (d) => distributeElements(d, s.elements.map((e) => e.id), 'h'))
    expect(out.elements.map((e) => e.frame.x)).toEqual([0, 100, 200])
  })

  it('duplicates inside a draft with fresh ids', () => {
    const s = slideWith(1)
    let ids: string[] = []
    const out = produce(s, (d) => {
      ids = duplicateElementsIn(d, [s.elements[0]?.id as string])
    })
    expect(out.elements).toHaveLength(2)
    expect(out.elements[1]?.id).toBe(ids[0])
    expect(out.elements[1]?.frame.x).toBe(24)
  })
})

describe('apply design to all slides', () => {
  const canvas2 = { width: 1920, height: 1080 }
  function deck(): Presentation {
    const a = createSlide(canvas2, 'Line A')
    const b = createSlide(canvas2, 'Line B')
    const c = createSlide(canvas2, 'Line C')
    const ref = createSlide(canvas2, 'John 3:16').elements[0] as TextElement
    a.elements.push({ ...ref, id: 'ref-a', text: 'Ref A' })
    return { ...createPresentation('Deck', [a, b, c]) }
  }
  const all: ApplyDesignOptions = { textStyle: true, background: true, decorations: true, transition: true }

  it('copies text style, background, decorations and transition but keeps each slide’s words', () => {
    const p0 = deck()
    const src = p0.slides[0] as Slide
    const p1 = produce(p0, (d) => {
      const s = d.slides[0] as Slide
      const t = s.elements[0] as TextElement
      t.style.color = '#ff0000'
      t.style.fontSize = 40
      t.frame = { x: 10, y: 20, width: 300, height: 100 }
      s.background = { type: 'none' }
      s.transition = { type: 'push', durationMs: 300, direction: 'left' }
      s.elements.unshift({ ...createShapeElement(canvas2, 'rectangle'), id: 'bar' })
    })
    let n = 0
    const p2 = produce(p1, (d) => {
      n = applyDesignToSlides(d, src.id, d.slides.map((s) => s.id), all)
    })
    expect(n).toBe(2)
    const b = p2.slides[1] as Slide
    const bt = b.elements.find((e) => e.type === 'text') as TextElement
    expect(bt.text).toBe('Line B')
    expect(bt.id).toBe(p0.slides[1]?.elements[0]?.id)
    expect(bt.style.color).toBe('#ff0000')
    expect(bt.frame).toEqual({ x: 10, y: 20, width: 300, height: 100 })
    expect(b.background).toEqual({ type: 'none' })
    expect(b.transition?.type).toBe('push')
    // Decoration copied with a fresh id, placed in the same stacking position (bottom).
    expect(b.elements[0]?.type).toBe('shape')
    expect(b.elements[0]?.id).not.toBe('bar')
    // The source's second text box (reference) has no counterpart on B, so nothing is invented.
    expect(b.elements.filter((e) => e.type === 'text')).toHaveLength(1)
  })

  it('only restyles text when other options are off, and never drops extra text boxes', () => {
    const p0 = produce(deck(), (d) => {
      const c = d.slides[2] as Slide
      c.elements.push({ ...(c.elements[0] as TextElement), id: 'extra', text: 'Extra' })
      const t = (d.slides[0] as Slide).elements[0] as TextElement
      t.style.italic = true
    })
    const p1 = produce(p0, (d) => {
      applyDesignToSlides(d, p0.slides[0]?.id as string, [p0.slides[2]?.id as string], { textStyle: true, background: false, decorations: false, transition: false })
    })
    const c = p1.slides[2] as Slide
    expect(c.elements.map((e) => (e.type === 'text' ? e.text : ''))).toEqual(['Line C', 'Extra'])
    expect((c.elements[0] as TextElement).style.italic).toBe(true)
    // Second text box takes the style of the source's second text box (the reference).
    expect((c.elements[1] as TextElement).style.italic).toBe(false)
    expect(p1.slides[1]).toBe(p0.slides[1])
  })
})
