/**
 * Templates › My Backgrounds files used in a project live in media/P&W Backgrounds and the
 * "P&W Backgrounds" media playlist, which keeps them out of All Media. New ones are filed there when
 * added; this moves the ones added before that existed.
 */
import type { LibraryFile } from '@shared/ipc'
import type { Id, MediaAsset } from '@shared/model/types'
import { addToMediaPlaylist, pwBackgroundsPlaylist } from '../../engine/projectOps'
import { errorMessage } from '../../store/overlayStore'
import { applyChange, useProjectStore } from '../../store/projectStore'

/** Whether a loose media file is a copy of a backgrounds-folder file. `library` = "name|size" of those files. */
export function isTemplateBackground(a: MediaAsset, library: ReadonlySet<string>): boolean {
  return !a.fileName.includes('/') && library.has(`${a.originalName}|${a.sizeBytes}`)
}

export async function organizePwBackgrounds(): Promise<void> {
  const before = useProjectStore.getState().project
  if (!before) return
  let library: LibraryFile[] = []
  try {
    library = (await window.bhcf.library.list()).files
  } catch {
    return // no backgrounds folder
  }
  const fromLibrary = new Set(library.map((f) => `${f.name}|${f.sizeBytes}`))
  const found = Object.values(before.media).filter((a) => isTemplateBackground(a, fromLibrary))
  if (found.length === 0) return

  let moved: Record<string, string> = {}
  try {
    moved = await window.bhcf.media.moveToBackgrounds(found.map((a) => a.fileName))
  } catch (err) {
    window.bhcf.app.log('warn', `Moving backgrounds into P&W Backgrounds failed: ${errorMessage(err)}`)
    return
  }
  const ids = new Set<Id>(found.filter((a) => moved[a.fileName]).map((a) => a.id))
  if (ids.size === 0) return
  // Not undoable: the files have moved (the media protocol finds either place anyway).
  applyChange(
    'Organise P&W Backgrounds',
    (d) => {
      for (const id of ids) {
        const a = d.media[id]
        const to = a && moved[a.fileName]
        if (a && to) a.fileName = to
      }
      for (const profile of Object.values(d.profiles)) {
        const mine = profile.mediaIds.filter((id) => ids.has(id))
        if (mine.length) addToMediaPlaylist(d, pwBackgroundsPlaylist(d, profile).id, mine)
      }
    },
    { history: false }
  )
}
