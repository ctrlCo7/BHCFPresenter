import { createPresentation } from '@shared/model/factory'
import { deckToSlides } from '@shared/pptx'
import { addMediaAssets, addPresentation, addToMediaPlaylist, slidePicturesPlaylist } from '../../engine/projectOps'
import { errorMessage, toast } from '../../store/overlayStore'
import { applyChange, requireProject } from '../../store/projectStore'
import { ui } from '../../store/uiStore'

export async function exportPresentation(presentationId: string): Promise<void> {
  const p = requireProject()
  const pres = p.presentations[presentationId]
  if (!pres) return
  try {
    const path = await window.bhcf.presentation.export(pres, Object.values(p.media))
    if (path) toast.success('Presentation exported', path)
  } catch (err) {
    toast.error('Export failed', errorMessage(err))
  }
}

export async function exportActivePresentation(): Promise<void> {
  const id = ui.get().activePresentationId
  if (!id) {
    toast.info('Open a presentation first', 'Select the presentation to export in the library.')
    return
  }
  await exportPresentation(id)
}

export async function importPresentationFile(): Promise<void> {
  try {
    const result = await window.bhcf.presentation.import()
    if (!result) return
    applyChange('Import presentation', (d) => {
      addMediaAssets(d, result.media)
      addPresentation(d, result.presentation)
    })
    ui.set({ treeSelection: { scope: 'library', id: result.presentation.id } })
    ui.openPresentation(result.presentation.id)
    toast.success('Presentation imported', `${result.presentation.name} · ${result.presentation.slides.length} slides${result.media.length ? ` · ${result.media.length} media` : ''}`)
    if (result.repairs.length) toast.warning('Some content was repaired', result.repairs.slice(0, 3).join('\n'))
  } catch (err) {
    toast.error('Import failed', errorMessage(err))
  }
}

/**
 * File → Import PowerPoint: each .pptx (or .ppt, converted by PowerPoint) becomes a presentation
 * whose text boxes, shapes, pictures and backgrounds can all be edited in the slide editor.
 */
export async function importPowerPoint(paths?: string[]): Promise<void> {
  let res: Awaited<ReturnType<typeof window.bhcf.presentation.importPowerPoint>>
  try {
    toast.info('Importing PowerPoint…', 'Large files and old .ppt files can take a moment.')
    res = await window.bhcf.presentation.importPowerPoint(paths)
  } catch (err) {
    toast.error('Import failed', errorMessage(err))
    return
  }
  if (!res) return
  const p = requireProject()
  const made = res.decks.map((d) => {
    const pres = createPresentation(d.name, deckToSlides(d.deck, p.settings.canvas, (image) => d.mediaFor[image] ?? null))
    pres.meta = { source: 'PowerPoint' }
    return { pres, media: d.media, skipped: d.deck.skipped }
  })
  const first = made[0]
  if (first) {
    applyChange(made.length === 1 ? 'Import PowerPoint' : `Import ${made.length} PowerPoint files`, (d) => {
      for (const m of made) {
        addMediaAssets(d, m.media)
        // Kept out of All Media: they belong to the slides.
        if (m.media.length) addToMediaPlaylist(d, slidePicturesPlaylist(d).id, m.media.map((a) => a.id))
        addPresentation(d, m.pres)
      }
    })
    ui.set({ treeSelection: { scope: 'library', id: first.pres.id } })
    ui.openPresentation(first.pres.id)
    const slides = made.reduce((n, m) => n + m.pres.slides.length, 0)
    toast.success(
      made.length === 1 ? `Imported “${first.pres.name}”` : `Imported ${made.length} presentations`,
      `${slides} slide${slides === 1 ? '' : 's'}. Double-click a slide (or press E) to edit it.`
    )
    const skipped = [...new Set(made.flatMap((m) => m.skipped))]
    if (skipped.length) toast.warning('Some parts could not be brought over', `Left out: ${skipped.join('; ')}.`)
  }
  if (res.errors.length) toast.error(first ? 'Some files were not imported' : 'Nothing imported', res.errors.slice(0, 3).join('\n'))
}
