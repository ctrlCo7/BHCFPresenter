/**
 * Slide-element operations for the editor (run inside Immer recipes, like projectOps).
 * An edit target is either a presentation slide or an overlay's slide.
 */
import { current, isDraft, type Draft } from 'immer'
import { newId, nowIso } from '@shared/model/factory'
import type { CanvasSize, Id, Presentation, Project, Rect, Slide, SlideElement, TextElement } from '@shared/model/types'
import type { EditTarget } from '../store/uiStore'

export function targetSlide(p: Project, t: EditTarget | null): Slide | undefined {
  if (!t) return undefined
  if (t.kind === 'overlay') return p.overlays[t.overlayId]?.slide
  return p.presentations[t.presentationId]?.slides.find((s) => s.id === t.slideId)
}

/** Runs `fn` on the target slide inside a draft, touching the presentation's updatedAt. */
export function withTargetSlide(p: Project, t: EditTarget, fn: (slide: Slide) => void): void {
  const slide = targetSlide(p, t)
  if (!slide) return
  fn(slide)
  if (t.kind === 'slide') {
    const pres = p.presentations[t.presentationId]
    if (pres) pres.updatedAt = nowIso()
  }
}

export function addElements(slide: Slide, elements: SlideElement[], index = slide.elements.length): void {
  slide.elements.splice(Math.max(0, Math.min(index, slide.elements.length)), 0, ...elements)
}

export function patchElements(slide: Slide, ids: Id[], fn: (el: SlideElement) => void): void {
  const set = new Set(ids)
  for (const el of slide.elements) if (set.has(el.id)) fn(el)
}

export function removeElements(slide: Slide, ids: Id[]): void {
  const set = new Set(ids)
  slide.elements = slide.elements.filter((e) => !set.has(e.id))
}

/** Copies elements (fresh ids, offset) above the topmost original; returns new ids. */
export function duplicateElementsIn(slide: Slide, ids: Id[], offset = 24): Id[] {
  const set = new Set(ids)
  const originals = slide.elements.filter((e) => set.has(e.id))
  const copies = originals.map((e) => {
    const plain = isDraft(e) ? current(e as Draft<SlideElement>) : e
    const c = structuredClone(plain) as SlideElement
    c.id = newId()
    c.frame = { ...c.frame, x: c.frame.x + offset, y: c.frame.y + offset }
    return c
  })
  slide.elements.push(...copies)
  return copies.map((c) => c.id)
}

export function insertCopies(slide: Slide, elements: SlideElement[], offset = 24): Id[] {
  const copies = elements.map((e) => ({ ...structuredClone(e), id: newId(), frame: { ...e.frame, x: e.frame.x + offset, y: e.frame.y + offset } }))
  slide.elements.push(...copies)
  return copies.map((c) => c.id)
}

export type OrderOp = 'front' | 'forward' | 'backward' | 'back'

/** Changes stacking order (index 0 = bottom). Selected elements keep their relative order. */
export function reorderElements(slide: Slide, ids: Id[], op: OrderOp): void {
  const set = new Set(ids)
  const els = slide.elements
  if (op === 'front' || op === 'back') {
    const moving = els.filter((e) => set.has(e.id))
    const rest = els.filter((e) => !set.has(e.id))
    slide.elements = op === 'front' ? [...rest, ...moving] : [...moving, ...rest]
    return
  }
  const list = [...els]
  if (op === 'forward') {
    for (let i = list.length - 2; i >= 0; i--) {
      if (set.has((list[i] as SlideElement).id) && !set.has((list[i + 1] as SlideElement).id)) [list[i], list[i + 1]] = [list[i + 1] as SlideElement, list[i] as SlideElement]
    }
  } else {
    for (let i = 1; i < list.length; i++) {
      if (set.has((list[i] as SlideElement).id) && !set.has((list[i - 1] as SlideElement).id)) [list[i], list[i - 1]] = [list[i - 1] as SlideElement, list[i] as SlideElement]
    }
  }
  slide.elements = list
}

/** Moves one element to a stacking index (layers panel drag). */
export function moveElementTo(slide: Slide, id: Id, index: number): void {
  const from = slide.elements.findIndex((e) => e.id === id)
  if (from < 0) return
  const [el] = slide.elements.splice(from, 1)
  if (el) slide.elements.splice(Math.max(0, Math.min(index, slide.elements.length)), 0, el)
}

export function boundsOf(frames: Rect[]): Rect {
  const x = Math.min(...frames.map((f) => f.x))
  const y = Math.min(...frames.map((f) => f.y))
  const r = Math.max(...frames.map((f) => f.x + f.width))
  const b = Math.max(...frames.map((f) => f.y + f.height))
  return { x, y, width: r - x, height: b - y }
}

export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom'

/** One element aligns to the canvas; several align to their combined bounds. */
export function alignElements(slide: Slide, ids: Id[], mode: AlignMode, canvas: CanvasSize): void {
  const set = new Set(ids)
  const els = slide.elements.filter((e) => set.has(e.id) && !e.locked)
  if (els.length === 0) return
  const ref = els.length === 1 ? { x: 0, y: 0, width: canvas.width, height: canvas.height } : boundsOf(els.map((e) => e.frame))
  for (const e of els) {
    const f = e.frame
    switch (mode) {
      case 'left':
        f.x = ref.x
        break
      case 'hcenter':
        f.x = Math.round(ref.x + (ref.width - f.width) / 2)
        break
      case 'right':
        f.x = ref.x + ref.width - f.width
        break
      case 'top':
        f.y = ref.y
        break
      case 'vcenter':
        f.y = Math.round(ref.y + (ref.height - f.height) / 2)
        break
      case 'bottom':
        f.y = ref.y + ref.height - f.height
        break
    }
  }
}

/** Equal gaps between 3+ elements along an axis, keeping the outermost ones in place. */
export function distributeElements(slide: Slide, ids: Id[], axis: 'h' | 'v'): void {
  const set = new Set(ids)
  const els = slide.elements.filter((e) => set.has(e.id) && !e.locked)
  if (els.length < 3) return
  const pos = (e: SlideElement): number => (axis === 'h' ? e.frame.x : e.frame.y)
  const size = (e: SlideElement): number => (axis === 'h' ? e.frame.width : e.frame.height)
  const sorted = [...els].sort((a, b) => pos(a) - pos(b))
  const first = sorted[0] as SlideElement
  const last = sorted[sorted.length - 1] as SlideElement
  const span = pos(last) + size(last) - pos(first)
  const total = sorted.reduce((n, e) => n + size(e), 0)
  const gap = (span - total) / (sorted.length - 1)
  let cursor = pos(first)
  for (const e of sorted) {
    if (axis === 'h') e.frame.x = Math.round(cursor)
    else e.frame.y = Math.round(cursor)
    cursor += size(e) + gap
  }
}

/* ------------------------------------------------------------------ */
/* Apply one slide's design to other slides                            */
/* ------------------------------------------------------------------ */

export interface ApplyDesignOptions {
  /** Font, size, colour, alignment, outline, shadow, box, position of each text box */
  textStyle: boolean
  background: boolean
  /** Shapes, images and videos (logos, bars, frames…) */
  decorations: boolean
  transition: boolean
}

const plainCopy = <T>(v: T): T => structuredClone(isDraft(v) ? current(v as Draft<T>) : v)

/** Copies everything visual from `src` onto `dst` while keeping `dst`'s words, id and visibility. */
function styledText(src: TextElement, dst: TextElement): TextElement {
  const s = plainCopy(src)
  return { ...s, id: dst.id, name: dst.name, text: dst.text, hidden: dst.hidden }
}

/**
 * Makes `targetIds` look like the source slide. Text boxes are matched by order (first text box
 * ↔ first text box, so a verse and its reference line both line up); each target keeps its own
 * words. Target text boxes without a counterpart are kept unchanged so no lyrics are ever lost.
 * Returns how many slides changed.
 */
export function applyDesignToSlides(pres: Presentation, sourceId: Id, targetIds: Id[], opts: ApplyDesignOptions): number {
  const source = pres.slides.find((s) => s.id === sourceId)
  if (!source) return 0
  const srcTexts = source.elements.filter((e): e is TextElement => e.type === 'text')
  const targets = new Set(targetIds)
  let changed = 0
  for (const slide of pres.slides) {
    if (slide.id === sourceId || !targets.has(slide.id)) continue
    const dstTexts = slide.elements.filter((e): e is TextElement => e.type === 'text')
    if (opts.decorations) {
      // Rebuild the element list in the source's stacking order.
      const next: SlideElement[] = []
      let ti = 0
      for (const el of source.elements) {
        if (el.type === 'text') {
          const dst = dstTexts[ti++]
          if (dst) next.push(opts.textStyle ? styledText(el, dst) : dst)
        } else {
          next.push({ ...plainCopy(el), id: newId() })
        }
      }
      // Extra text boxes on the target (beyond the source's count) stay as they are.
      next.push(...dstTexts.slice(ti))
      slide.elements = next
    } else if (opts.textStyle) {
      slide.elements = slide.elements.map((el) => {
        if (el.type !== 'text') return el
        const idx = dstTexts.indexOf(el)
        const src = srcTexts[idx]
        return src ? styledText(src, el) : el
      })
    }
    if (opts.background) slide.background = source.background ? plainCopy(source.background) : null
    if (opts.transition) slide.transition = source.transition ? plainCopy(source.transition) : null
    changed++
  }
  if (changed) pres.updatedAt = nowIso()
  return changed
}
