/**
 * Profiles: one workspace per church event. Switching profile swaps the library pages,
 * playlists and media the workspace shows; overlays, timers and settings stay shared.
 */
import type { Id, TreeScope } from '@shared/model/types'
import {
  addProfile,
  deleteProfile,
  moveProfile,
  removeMediaFromProfile,
  renameProfile,
  sendNodeToProfile,
  setActiveProfile,
  shareMediaWithProfile
} from '../../engine/projectOps'
import { activeProfile, idsInProfile, itemName } from '../../engine/tree'
import { dialogs, toast } from '../../store/overlayStore'
import { applyChange, requireProject, useProjectStore } from '../../store/projectStore'
import { ui, type UiState } from '../../store/uiStore'

/** What each profile was showing, restored when switching back to it. */
type View = Pick<UiState, 'treeSelection' | 'activePresentationId' | 'selectedSlideIds' | 'mediaPlaylistId'>
const views = new Map<Id, View>()

export function switchProfile(id: Id): void {
  const p = requireProject()
  if (!p.profiles[id] || id === p.activeProfileId) return
  const s = ui.get()
  views.set(p.activeProfileId, {
    treeSelection: s.treeSelection,
    activePresentationId: s.activePresentationId,
    selectedSlideIds: s.selectedSlideIds,
    mediaPlaylistId: s.mediaPlaylistId
  })
  // Navigation, not an edit: no undo step (it is still saved, so the project reopens here).
  applyChange('Switch profile', (d) => setActiveProfile(d, id), { history: false })
  showProfileView()
}

/** Restores (or resets) the UI for the active profile so nothing from another profile stays open. */
function showProfileView(): void {
  const p = requireProject()
  const saved = views.get(p.activeProfileId)
  const library = idsInProfile(p, 'library')
  const playlists = idsInProfile(p, 'playlists')
  const presId = saved?.activePresentationId && library.has(saved.activePresentationId) ? saved.activePresentationId : null
  const sel = saved?.treeSelection
  const s = ui.get()
  const editingOther = s.editTarget?.kind === 'slide' && !library.has(s.editTarget.presentationId)
  ui.set({
    activePresentationId: presId,
    selectedSlideIds: presId ? (saved?.selectedSlideIds ?? []) : [],
    slideAnchorId: null,
    treeSelection: sel && (sel.scope === 'library' ? library : playlists).has(sel.id) ? sel : null,
    entrySelection: null,
    selectedMediaIds: [],
    mediaPlaylistId: saved?.mediaPlaylistId ?? null,
    search: '',
    renamingId: null,
    ...(editingOther ? { editTarget: null, mode: s.mode === 'edit' ? 'show' : s.mode } : {})
  })
}

export async function newProfile(): Promise<void> {
  const name = await dialogs.prompt({
    title: 'New Profile',
    label: 'Church event',
    placeholder: 'e.g. Youth Service, Prayer Meeting, Christmas',
    confirmLabel: 'Create',
    validate: (v) => (v.trim() ? null : 'Enter a name')
  })
  if (!name?.trim()) return
  let id = ''
  applyChange('New profile', (d) => {
    id = addProfile(d, name.trim()).id
  })
  switchProfile(id)
}

export async function renameProfileAction(id: Id): Promise<void> {
  const profile = requireProject().profiles[id]
  if (!profile) return
  const name = await dialogs.prompt({ title: 'Rename Profile', label: 'Church event', defaultValue: profile.name, confirmLabel: 'Rename' })
  if (name?.trim() && name.trim() !== profile.name) applyChange('Rename profile', (d) => renameProfile(d, id, name))
}

export function moveProfileAction(id: Id, index: number): void {
  applyChange('Reorder profiles', (d) => moveProfile(d, id, index))
}

export async function deleteProfileAction(id: Id): Promise<void> {
  const p = requireProject()
  const profile = p.profiles[id]
  if (!profile) return
  if (p.profileOrder.length <= 1) {
    toast.info('Cannot delete the only profile', 'Create another profile first.')
    return
  }
  const pages = [...idsInProfile(p, 'library', profile)].filter((x) => p.presentations[x]).length
  const lists = [...idsInProfile(p, 'playlists', profile)].filter((x) => p.playlists[x]).length
  const ok = await dialogs.confirm({
    title: 'Delete profile',
    message: `Delete the "${profile.name}" profile with its ${pages} page(s), ${lists} playlist(s) and media playlists? Media other profiles use is kept. You can undo this.`,
    confirmLabel: 'Delete',
    danger: true
  })
  if (!ok) return
  const wasActive = p.activeProfileId === id
  applyChange('Delete profile', (d) => deleteProfile(d, id))
  views.delete(id)
  if (wasActive) showProfileView()
}

/** Copies or moves a sidebar item (page, folder or playlist) to another profile. */
export function sendToProfile(scope: TreeScope, id: Id, profileId: Id, mode: 'copy' | 'move'): void {
  const p = requireProject()
  const target = p.profiles[profileId]
  if (!target) return
  const name = itemName(p, id)
  let done: Id | null = null
  applyChange(mode === 'copy' ? 'Copy to profile' : 'Move to profile', (d) => {
    done = sendNodeToProfile(d, scope, id, profileId, mode)
  })
  if (!done) return
  if (mode === 'move') {
    const s = ui.get()
    const after = useProjectStore.getState().project
    const still = after ? idsInProfile(after, 'library') : new Set<Id>()
    ui.set({
      treeSelection: s.treeSelection?.id === id ? null : s.treeSelection,
      activePresentationId: s.activePresentationId && !still.has(s.activePresentationId) ? null : s.activePresentationId
    })
  }
  toast.success(`${mode === 'copy' ? 'Copied' : 'Moved'} "${name}" to ${target.name}`)
}

/** Shares media with another profile; "move" also takes it out of this one. */
export function sendMediaToProfile(ids: Id[], profileId: Id, mode: 'copy' | 'move'): void {
  const p = requireProject()
  const target = p.profiles[profileId]
  if (!target || ids.length === 0) return
  applyChange(mode === 'copy' ? 'Add media to profile' : 'Move media to profile', (d) => {
    shareMediaWithProfile(d, profileId, ids)
    if (mode === 'move') removeMediaFromProfile(d, ids)
  })
  if (mode === 'move') ui.set({ selectedMediaIds: [] })
  toast.success(`${mode === 'copy' ? 'Added' : 'Moved'} ${ids.length === 1 ? '1 item' : `${ids.length} items`} to ${target.name}`)
}

/** Other profiles, for "Copy to / Move to" menus. */
export function otherProfiles(): { id: Id; name: string }[] {
  const p = requireProject()
  const active = activeProfile(p).id
  return p.profileOrder.filter((id) => id !== active).map((id) => ({ id, name: p.profiles[id]?.name ?? '' }))
}
