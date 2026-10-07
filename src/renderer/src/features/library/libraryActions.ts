/** User-level library and playlist actions (they may prompt, confirm and update selection). */
import { createPresentation, createSlide, splitTextIntoSlides } from '@shared/model/factory'
import type { Id, TreeScope } from '@shared/model/types'
import {
  addFolder,
  addPlaylist,
  addPlaylistEntries,
  addPresentation,
  deleteNode,
  duplicateNode,
  playlistReferencesTo,
  removePlaylistEntries,
  renameNode,
  type NewPlaylistEntry
} from '../../engine/projectOps'
import { childList, findParentId, getTreeItem, itemName, leafIdsUnder } from '../../engine/tree'
import { dialogs } from '../../store/overlayStore'
import { applyChange, requireProject, useProjectStore } from '../../store/projectStore'
import { ui } from '../../store/uiStore'

/** Where a new item goes: inside the selected folder, after the selected item, or at the root end. */
function insertionPoint(scope: TreeScope): { parentId: Id | null; index?: number } {
  const p = requireProject()
  const sel = ui.get().treeSelection
  if (!sel || sel.scope !== scope) return { parentId: null }
  if (p.folders[sel.id]?.scope === scope) return { parentId: sel.id }
  const parentId = findParentId(p, scope, sel.id)
  if (parentId === undefined) return { parentId: null }
  return { parentId, index: childList(p, scope, parentId).indexOf(sel.id) + 1 }
}

function revealAndSelect(scope: TreeScope, id: Id, rename: boolean): void {
  const p = requireProject()
  const expanded = { ...ui.get().expanded }
  let parent = findParentId(p, scope, id)
  while (parent) {
    expanded[parent] = true
    parent = findParentId(p, scope, parent)
  }
  ui.set({ expanded, treeSelection: { scope, id }, renamingId: rename ? id : null })
}

export function newPresentation(): void {
  const p = requireProject()
  const { parentId, index } = insertionPoint('library')
  const pres = createPresentation('Untitled Presentation', [createSlide(p.settings.canvas, '', p.settings.defaultTextStyle)])
  applyChange('New presentation', (d) => addPresentation(d, pres, parentId, index))
  revealAndSelect('library', pres.id, true)
  ui.openPresentation(pres.id)
}

export async function newPresentationFromText(): Promise<void> {
  const text = await dialogs.prompt({
    title: 'New Presentation from Text',
    label: 'Paste or type text. Separate slides with a blank line. The first line can be the title.',
    multiline: true,
    confirmLabel: 'Create Slides',
    placeholder: 'Title\n\nFirst slide text\n\nSecond slide text',
    validate: (v) => (splitTextIntoSlides(v).length > 0 ? null : 'Enter some text')
  })
  if (!text) return
  const blocks = splitTextIntoSlides(text)
  const firstBlock = blocks[0] ?? ''
  // A single-line first block is treated as the title.
  const hasTitle = blocks.length > 1 && !firstBlock.includes('\n')
  const name = hasTitle ? firstBlock : 'Untitled Presentation'
  const p = requireProject()
  const slides = (hasTitle ? blocks.slice(1) : blocks).map((b) => createSlide(p.settings.canvas, b, p.settings.defaultTextStyle))
  const pres = createPresentation(name, slides)
  const { parentId, index } = insertionPoint('library')
  applyChange('New presentation from text', (d) => addPresentation(d, pres, parentId, index))
  revealAndSelect('library', pres.id, false)
  ui.openPresentation(pres.id)
}

export function newFolder(scope: TreeScope): void {
  const { parentId, index } = insertionPoint(scope)
  let id = ''
  applyChange('New folder', (d) => {
    id = addFolder(d, scope, 'New Folder', parentId, index).id
  })
  revealAndSelect(scope, id, true)
}

export function newPlaylist(): void {
  const { parentId, index } = insertionPoint('playlists')
  let id = ''
  applyChange('New playlist', (d) => {
    id = addPlaylist(d, 'New Playlist', parentId, index).id
  })
  ui.toggleExpanded(id, true)
  revealAndSelect('playlists', id, true)
}

export function renameItem(id: Id, name: string): void {
  if (!name.trim() || name.trim() === itemName(requireProject(), id)) return
  applyChange('Rename', (d) => renameNode(d, id, name))
}

export function duplicateItem(scope: TreeScope, id: Id): void {
  let copyId: Id | null = null
  applyChange('Duplicate', (d) => {
    copyId = duplicateNode(d, scope, id)
  })
  if (copyId) revealAndSelect(scope, copyId, false)
}

export async function deleteItem(scope: TreeScope, id: Id): Promise<void> {
  const p = requireProject()
  const item = getTreeItem(p, id)
  if (!item) return
  const name = itemName(p, id)
  const kind = item.kind
  let detail = ''
  if (item.kind === 'folder') {
    const count = leafIdsUnder(p, id).length
    if (count > 0) detail = ` It contains ${count} item(s), which will also be deleted.`
  }
  const refs = playlistReferencesTo(p, id)
  if (refs > 0) detail += ` It will be removed from ${refs} playlist item(s).`
  const ok = await dialogs.confirm({
    title: `Delete ${kind}`,
    message: `Delete "${name}"?${detail} You can undo this with ${navigator.userAgent.includes('Mac') ? '⌘Z' : 'Ctrl+Z'}.`,
    confirmLabel: 'Delete',
    danger: true
  })
  if (!ok) return
  applyChange(`Delete ${kind}`, (d) => deleteNode(d, scope, id))
  const s = ui.get()
  const after = useProjectStore.getState().project
  ui.set({
    treeSelection: s.treeSelection?.id === id ? null : s.treeSelection,
    activePresentationId: after && s.activePresentationId && !after.presentations[s.activePresentationId] ? null : s.activePresentationId,
    entrySelection: s.entrySelection && after && !after.playlists[s.entrySelection.playlistId]?.entries.some((e) => e.id === s.entrySelection?.entryId) ? null : s.entrySelection
  })
}

export function addToPlaylist(playlistId: Id, entries: NewPlaylistEntry[], index?: number): void {
  if (entries.length === 0) return
  applyChange('Add to playlist', (d) => addPlaylistEntries(d, playlistId, entries, index))
  // Expand the playlist and any folders above it so the new entries are visible.
  const p = requireProject()
  const expanded = { ...ui.get().expanded, [playlistId]: true }
  let parent = findParentId(p, 'playlists', playlistId)
  while (parent) {
    expanded[parent] = true
    parent = findParentId(p, 'playlists', parent)
  }
  ui.set({ expanded })
}

export async function addHeader(playlistId: Id, index?: number): Promise<void> {
  const title = await dialogs.prompt({ title: 'Add Header', label: 'Header text', placeholder: 'e.g. Worship, Sermon, Announcements', confirmLabel: 'Add' })
  if (!title?.trim()) return
  addToPlaylist(playlistId, [{ kind: 'header', title: title.trim(), color: '#6366f1' }], index)
}

export function removeEntry(playlistId: Id, entryId: Id): void {
  applyChange('Remove from playlist', (d) => removePlaylistEntries(d, playlistId, [entryId]))
  const s = ui.get()
  if (s.entrySelection?.entryId === entryId) ui.set({ entrySelection: null })
}

export async function renameHeader(playlistId: Id, entryId: Id): Promise<void> {
  const entry = requireProject().playlists[playlistId]?.entries.find((e) => e.id === entryId)
  if (!entry || entry.kind !== 'header') return
  const title = await dialogs.prompt({ title: 'Rename Header', label: 'Header text', defaultValue: entry.title, confirmLabel: 'Rename' })
  if (!title?.trim()) return
  applyChange('Rename header', (d) => {
    const e = d.playlists[playlistId]?.entries.find((x) => x.id === entryId)
    if (e && e.kind === 'header') e.title = title.trim()
  })
}
