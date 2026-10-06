import { addMediaAssets, addPresentation } from '../../engine/projectOps'
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
