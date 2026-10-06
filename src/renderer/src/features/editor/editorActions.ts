/** Editor commands acting on the current edit target and element selection. */
import { createElement } from 'react'
import { createImageElement, createShapeElement, createTextElement, createVideoElement } from '@shared/model/factory'
import type { Id, MediaAsset, ShapeKind, Slide, SlideElement } from '@shared/model/types'
import {
  addElements,
  alignElements,
  applyDesignToSlides,
  distributeElements,
  duplicateElementsIn,
  insertCopies,
  patchElements,
  removeElements,
  reorderElements,
  targetSlide,
  withTargetSlide,
  type AlignMode,
  type OrderOp
} from '../../engine/elementOps'
import { dialogs, toast } from '../../store/overlayStore'
import { ApplyToAllDialog, type ApplyToAllResult } from './ApplyToAllDialog'
import { applyChange, requireProject, useProjectStore } from '../../store/projectStore'
import { ui, type EditTarget } from '../../store/uiStore'

let clipboard: SlideElement[] = []

export function currentTarget(): EditTarget | null {
  return ui.get().editTarget
}

export function currentSlide(): Slide | undefined {
  const p = useProjectStore.getState().project
  return p ? targetSlide(p, currentTarget()) : undefined
}

function selected(): Id[] {
  return ui.get().selectedElementIds
}

/** Applies `fn` to the target slide as one undoable change. */
export function editSlide(label: string, fn: (slide: Slide) => void, coalesce?: string): void {
  const t = currentTarget()
  if (t) applyChange(label, (d) => withTargetSlide(d, t, fn), { coalesce })
}

/** Applies `fn` to each selected element (or `ids`). */
export function editElements(label: string, fn: (el: SlideElement) => void, coalesce?: string, ids: Id[] = selected()): void {
  if (ids.length === 0) return
  editSlide(label, (s) => patchElements(s, ids, fn), coalesce)
}

function addAndSelect(label: string, el: SlideElement): void {
  editSlide(label, (s) => addElements(s, [el]))
  ui.set({ selectedElementIds: [el.id] })
}

export function addText(): void {
  const p = requireProject()
  const c = p.settings.canvas
  const frame = { x: Math.round(c.width * 0.2), y: Math.round(c.height * 0.38), width: Math.round(c.width * 0.6), height: Math.round(c.height * 0.24) }
  const el = createTextElement(c, 'Text', p.settings.defaultTextStyle, frame)
  addAndSelect('Add text', el)
}

export function addShape(kind: ShapeKind): void {
  addAndSelect(kind === 'ellipse' ? 'Add ellipse' : 'Add rectangle', createShapeElement(requireProject().settings.canvas, kind))
}

export function addMediaElement(asset: MediaAsset): void {
  const c = requireProject().settings.canvas
  if (asset.kind === 'image') addAndSelect('Add image', createImageElement(c, asset))
  else if (asset.kind === 'video') addAndSelect('Add video', createVideoElement(c, asset))
  else toast.info('Audio cannot be placed on a slide', 'Play audio from the media bin or a playlist instead.')
}

export function deleteSelectedElements(): void {
  const ids = selected()
  if (ids.length === 0) return
  editSlide(ids.length === 1 ? 'Delete element' : 'Delete elements', (s) => removeElements(s, ids))
  ui.set({ selectedElementIds: [] })
}

export function duplicateSelectedElements(): void {
  const ids = selected()
  if (ids.length === 0) return
  let copies: Id[] = []
  editSlide('Duplicate elements', (s) => {
    copies = duplicateElementsIn(s, ids)
  })
  ui.set({ selectedElementIds: copies })
}

export function copyElements(): void {
  const slide = currentSlide()
  const ids = new Set(selected())
  clipboard = slide ? slide.elements.filter((e) => ids.has(e.id)) : []
  if (clipboard.length) toast.info(`Copied ${clipboard.length} element(s)`)
}

export function pasteElements(): void {
  if (clipboard.length === 0) return
  const items = clipboard
  let ids: Id[] = []
  editSlide('Paste elements', (s) => {
    ids = insertCopies(s, items)
  })
  ui.set({ selectedElementIds: ids })
}

export function selectAllElements(): void {
  const slide = currentSlide()
  if (slide) ui.set({ selectedElementIds: slide.elements.filter((e) => !e.hidden).map((e) => e.id) })
}

export function alignSelected(mode: AlignMode): void {
  const ids = selected()
  const c = requireProject().settings.canvas
  if (ids.length) editSlide('Align', (s) => alignElements(s, ids, mode, c))
}

export function distributeSelected(axis: 'h' | 'v'): void {
  const ids = selected()
  if (ids.length >= 3) editSlide('Distribute', (s) => distributeElements(s, ids, axis))
}

export function orderSelected(op: OrderOp): void {
  const ids = selected()
  if (ids.length) editSlide('Arrange', (s) => reorderElements(s, ids, op))
}

export function nudgeSelected(dx: number, dy: number): void {
  editElements(
    'Nudge',
    (el) => {
      if (el.locked) return
      el.frame.x += dx
      el.frame.y += dy
    },
    'nudge'
  )
}

/** Asks what to copy from the slide being edited, then applies it to the chosen slides. */
export async function applyCurrentSlideToAll(): Promise<void> {
  const t = currentTarget()
  if (!t || t.kind !== 'slide') return
  const pres = requireProject().presentations[t.presentationId]
  const source = pres?.slides.find((s) => s.id === t.slideId)
  if (!pres || !source) return
  if (pres.slides.length < 2) {
    toast.info('Only one slide', 'Add more slides first.')
    return
  }
  const result = await dialogs.custom<ApplyToAllResult>({
    title: 'Apply to All Slides',
    width: 560,
    render: (close) => createElement(ApplyToAllDialog, { pres, source, onClose: close })
  })
  if (!result) return
  let changed = 0
  applyChange('Apply to all slides', (d) => {
    const p = d.presentations[t.presentationId]
    if (p) changed = applyDesignToSlides(p, t.slideId, result.targetIds, result.options)
  })
  toast.success(`Updated ${changed} slide${changed === 1 ? '' : 's'}`, 'Undo with Ctrl+Z if needed.')
}

/** One-click: copy the text style of the slide being edited to every other slide. */
export function applyTextStyleToAll(): void {
  const t = currentTarget()
  if (!t || t.kind !== 'slide') return
  const pres = requireProject().presentations[t.presentationId]
  if (!pres || pres.slides.length < 2) return
  let changed = 0
  applyChange('Apply text style to all slides', (d) => {
    const p = d.presentations[t.presentationId]
    if (p) changed = applyDesignToSlides(p, t.slideId, p.slides.map((s) => s.id), { textStyle: true, background: false, decorations: false, transition: false })
  })
  toast.success(`Text style applied to ${changed} slide${changed === 1 ? '' : 's'}`, 'Every slide kept its own words. Undo with Ctrl+Z.')
}

/** Opens the editor on a presentation (selected or first slide). */
export function openEditor(presentationId: Id, slideId?: Id): void {
  const pres = requireProject().presentations[presentationId]
  if (!pres) return
  const slide = pres.slides.find((s) => s.id === slideId) ?? pres.slides.find((s) => s.id === ui.get().selectedSlideIds[0]) ?? pres.slides[0]
  if (!slide) {
    toast.info('This presentation has no slides', 'Add a slide first.')
    return
  }
  ui.openPresentation(presentationId, ui.get().entrySelection)
  ui.selectSlides([slide.id])
  ui.edit({ kind: 'slide', presentationId, slideId: slide.id })
}

export function openOverlayEditor(overlayId: Id): void {
  if (requireProject().overlays[overlayId]) ui.edit({ kind: 'overlay', overlayId })
}

/** Enters Edit mode for whatever is currently open. */
export function enterEditMode(): void {
  const s = ui.get()
  const p = requireProject()
  if (s.editTarget && targetSlide(p, s.editTarget)) {
    ui.set({ mode: 'edit' })
    return
  }
  if (s.activePresentationId && p.presentations[s.activePresentationId]) {
    openEditor(s.activePresentationId)
    return
  }
  toast.info('Nothing to edit', 'Open a presentation (or an overlay) first.')
}
