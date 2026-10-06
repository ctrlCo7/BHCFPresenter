import { cloneSlide, createSlide } from '@shared/model/factory'
import type { Id, Slide } from '@shared/model/types'
import { deleteSlides, duplicateSlides, insertSlides, moveSlides, setSlideText, updateSlides, type SlidePatch } from '../../engine/projectOps'
import { dialogs, toast } from '../../store/overlayStore'
import { applyChange, requireProject } from '../../store/projectStore'
import { ui } from '../../store/uiStore'

/** In-app slide clipboard (slides are rich objects; the OS clipboard is not needed here). */
let clipboard: Slide[] = []

function active(): { presId: Id; slides: Slide[] } | null {
  const presId = ui.get().activePresentationId
  const pres = presId ? requireProject().presentations[presId] : undefined
  return pres && presId ? { presId, slides: pres.slides } : null
}

function insertIndexAfterSelection(slides: Slide[]): number {
  const selected = new Set(ui.get().selectedSlideIds)
  let last = -1
  slides.forEach((s, i) => {
    if (selected.has(s.id)) last = i
  })
  return last >= 0 ? last + 1 : slides.length
}

export function addSlide(): void {
  const a = active()
  if (!a) return
  const p = requireProject()
  const slide = createSlide(p.settings.canvas, '', p.settings.defaultTextStyle)
  applyChange('Add slide', (d) => insertSlides(d, a.presId, [slide], insertIndexAfterSelection(a.slides)))
  ui.selectSlides([slide.id])
}

export function duplicateSelectedSlides(): void {
  const a = active()
  const ids = ui.get().selectedSlideIds
  if (!a || ids.length === 0) return
  let copies: Id[] = []
  applyChange('Duplicate slides', (d) => {
    copies = duplicateSlides(d, a.presId, ids)
  })
  ui.selectSlides(copies)
}

export function deleteSelectedSlides(): void {
  const a = active()
  const ids = ui.get().selectedSlideIds
  if (!a || ids.length === 0) return
  // Keep the selection near where it was so repeated Delete walks through the deck.
  const firstIndex = a.slides.findIndex((s) => ids.includes(s.id))
  applyChange(ids.length === 1 ? 'Delete slide' : `Delete ${ids.length} slides`, (d) => deleteSlides(d, a.presId, ids))
  const remaining = requireProject().presentations[a.presId]?.slides ?? []
  const next = remaining[Math.min(firstIndex, remaining.length - 1)]
  ui.selectSlides(next ? [next.id] : [])
}

export function moveSelectedSlides(slideIds: Id[], toIndex: number): void {
  const a = active()
  if (!a || slideIds.length === 0) return
  applyChange('Reorder slides', (d) => moveSlides(d, a.presId, slideIds, toIndex))
}

export function selectAllSlides(): void {
  const a = active()
  if (a) ui.selectSlides(a.slides.map((s) => s.id))
}

export function copySelectedSlides(): void {
  const a = active()
  if (!a) return
  const selected = new Set(ui.get().selectedSlideIds)
  clipboard = a.slides.filter((s) => selected.has(s.id))
  if (clipboard.length) toast.info(`Copied ${clipboard.length} slide(s)`)
}

export function pasteSlides(): void {
  const a = active()
  if (!a || clipboard.length === 0) return
  // Pasting into another presentation must not carry over its group ids.
  const sameDeck = clipboard.every((s) => a.slides.some((x) => x.id === s.id))
  const copies = clipboard.map((s) => {
    const c = cloneSlide(s)
    if (!sameDeck) c.groupId = null
    return c
  })
  applyChange('Paste slides', (d) => insertSlides(d, a.presId, copies, insertIndexAfterSelection(a.slides)))
  ui.selectSlides(copies.map((c) => c.id))
}

export function patchSlides(slideIds: Id[], patch: SlidePatch, label: string): void {
  const a = active()
  if (a) applyChange(label, (d) => updateSlides(d, a.presId, slideIds, patch))
}

export async function editSlideText(slideId: Id): Promise<void> {
  const a = active()
  const slide = a?.slides.find((s) => s.id === slideId)
  if (!a || !slide) return
  const textEl = slide.elements.find((e) => e.type === 'text')
  if (!textEl || textEl.type !== 'text') {
    toast.info('This slide has no text box', 'Text boxes can be added in the slide editor.')
    return
  }
  const text = await dialogs.prompt({ title: 'Edit Slide Text', defaultValue: textEl.text, multiline: true, confirmLabel: 'Apply' })
  if (text === null) return
  applyChange('Edit slide text', (d) => setSlideText(d, a.presId, slideId, text))
}

export async function labelSelectedSlides(): Promise<void> {
  const a = active()
  const ids = ui.get().selectedSlideIds
  if (!a || ids.length === 0) return
  const current = a.slides.find((s) => s.id === ids[0])?.label ?? ''
  const label = await dialogs.prompt({ title: 'Slide Label', label: 'Label (leave empty to clear)', defaultValue: current, confirmLabel: 'Apply' })
  if (label === null) return
  patchSlides(ids, { label: label.trim() }, 'Label slides')
}

export const SLIDE_COLORS: { name: string; value: string | null }[] = [
  { name: 'None', value: null },
  { name: 'Red', value: '#e5484d' },
  { name: 'Orange', value: '#f76b15' },
  { name: 'Yellow', value: '#ffc53d' },
  { name: 'Green', value: '#30a46c' },
  { name: 'Teal', value: '#12a594' },
  { name: 'Blue', value: '#3e63dd' },
  { name: 'Purple', value: '#8e4ec6' },
  { name: 'Pink', value: '#d6409f' }
]
