/**
 * Mutating operations on a Project.
 *
 * These run inside an Immer `produce` recipe (see the project store), so they are written as
 * plain mutations of a draft while the store keeps every previous version immutable. They
 * contain all domain rules (no cycles, no dangling references) so the UI layer stays thin.
 */
import { current, isDraft, type Draft } from 'immer'
import {
  cloneSlide,
  clonePresentation,
  createFolder,
  createMediaPlaylist,
  createPlaylist,
  createProfile,
  newId,
  nowIso
} from '@shared/model/factory'
import type {
  Folder,
  Id,
  MediaAsset,
  MediaPlaylistKind,
  MediaPlaylist,
  Playlist,
  Profile,
  PlaylistEntry,
  Presentation,
  Project,
  Slide,
  TreeScope
} from '@shared/model/types'
import { mediaPlaylistAccepts } from '@shared/model/types'
import { activeProfile, childList, findParentId, getTreeItem, idsInProfile, isSelfOrDescendant, leafIdsUnder, rootList } from './tree'

/** Immer drafts are proxies that structuredClone cannot copy; snapshot them first. */
function plain<T>(value: T): T {
  return isDraft(value) ? (current(value as Draft<T>) as T) : value
}

/* ------------------------------------------------------------------ */
/* Tree structure                                                      */
/* ------------------------------------------------------------------ */

function insertAt(list: Id[], id: Id, index?: number): void {
  const i = index === undefined ? list.length : Math.max(0, Math.min(index, list.length))
  list.splice(i, 0, id)
}

/** Removes an item from its parent list. Returns where it was, or null if it was not found. */
export function detachNode(p: Project, scope: TreeScope, id: Id): { parentId: Id | null; index: number } | null {
  const parentId = findParentId(p, scope, id)
  if (parentId === undefined) return null
  const list = childList(p, scope, parentId)
  const index = list.indexOf(id)
  list.splice(index, 1)
  return { parentId, index }
}

/** Resolves a drop target: folders accept children, anything else means "root". */
function targetList(p: Project, scope: TreeScope, parentId: Id | null): Id[] {
  if (parentId !== null) {
    const folder = p.folders[parentId]
    if (!folder || folder.scope !== scope) throw new Error('Target folder does not exist.')
    return folder.childIds
  }
  return rootList(p, scope)
}

/**
 * Moves an item to `index` within `parentId` (null = root). `index` is the insertion
 * position in the target list as it looks *before* the move. Returns false for invalid moves
 * (into itself or one of its own descendants).
 */
export function moveNode(p: Project, scope: TreeScope, id: Id, parentId: Id | null, index: number): boolean {
  if (parentId !== null && isSelfOrDescendant(p, id, parentId)) return false
  const from = detachNode(p, scope, id)
  if (!from) return false
  const list = targetList(p, scope, parentId)
  const adjusted = from.parentId === parentId && from.index < index ? index - 1 : index
  insertAt(list, id, adjusted)
  return true
}

export function addFolder(p: Project, scope: TreeScope, name: string, parentId: Id | null = null, index?: number): Folder {
  const folder = createFolder(scope, name)
  p.folders[folder.id] = folder
  insertAt(targetList(p, scope, parentId), folder.id, index)
  return folder
}

export function addPresentation(p: Project, presentation: Presentation, parentId: Id | null = null, index?: number): void {
  p.presentations[presentation.id] = presentation
  insertAt(targetList(p, 'library', parentId), presentation.id, index)
}

export function addPlaylist(p: Project, name: string, parentId: Id | null = null, index?: number): Playlist {
  const playlist = createPlaylist(name)
  p.playlists[playlist.id] = playlist
  insertAt(targetList(p, 'playlists', parentId), playlist.id, index)
  return playlist
}

export function renameNode(p: Project, id: Id, name: string): void {
  const clean = name.trim()
  if (!clean) return
  const item = getTreeItem(p, id)
  if (!item) return
  if (item.kind === 'folder') item.folder.name = clean
  else if (item.kind === 'presentation') {
    item.presentation.name = clean
    item.presentation.updatedAt = nowIso()
  } else {
    item.playlist.name = clean
    item.playlist.updatedAt = nowIso()
  }
}

/** Picks "Name copy", "Name copy 2", … avoiding names already used by siblings. */
export function copyName(name: string, siblingNames: Iterable<string>): string {
  const taken = new Set(Array.from(siblingNames, (n) => n.toLowerCase()))
  const base = `${name} copy`
  if (!taken.has(base.toLowerCase())) return base
  for (let i = 2; ; i++) {
    const candidate = `${base} ${i}`
    if (!taken.has(candidate.toLowerCase())) return candidate
  }
}

function siblingNames(p: Project, scope: TreeScope, parentId: Id | null): string[] {
  return childList(p, scope, parentId).map((id) => {
    const item = getTreeItem(p, id)
    if (!item) return ''
    return item.kind === 'folder' ? item.folder.name : item.kind === 'presentation' ? item.presentation.name : item.playlist.name
  })
}

/** Deep-copies an item, recursively for folders. Returns the new id. */
function cloneSubtree(p: Project, scope: TreeScope, id: Id, name?: string): Id | null {
  const item = getTreeItem(p, id)
  if (!item) return null
  switch (item.kind) {
    case 'presentation': {
      const copy = clonePresentation(plain(item.presentation), name ?? item.presentation.name)
      p.presentations[copy.id] = copy
      return copy.id
    }
    case 'playlist': {
      const now = nowIso()
      const copy: Playlist = {
        id: newId(),
        name: name ?? item.playlist.name,
        entries: item.playlist.entries.map((e) => ({ ...e, id: newId() })),
        createdAt: now,
        updatedAt: now
      }
      p.playlists[copy.id] = copy
      return copy.id
    }
    case 'folder': {
      const copy: Folder = { id: newId(), scope, name: name ?? item.folder.name, childIds: [] }
      p.folders[copy.id] = copy
      for (const child of item.folder.childIds) {
        const childCopy = cloneSubtree(p, scope, child)
        if (childCopy) copy.childIds.push(childCopy)
      }
      return copy.id
    }
  }
}

export function duplicateNode(p: Project, scope: TreeScope, id: Id): Id | null {
  const parentId = findParentId(p, scope, id)
  if (parentId === undefined) return null
  const list = childList(p, scope, parentId)
  const item = getTreeItem(p, id)
  if (!item) return null
  const currentName = item.kind === 'folder' ? item.folder.name : item.kind === 'presentation' ? item.presentation.name : item.playlist.name
  const copyId = cloneSubtree(p, scope, id, copyName(currentName, siblingNames(p, scope, parentId)))
  if (copyId) list.splice(list.indexOf(id) + 1, 0, copyId)
  return copyId
}

/** Deletes an item (recursively for folders) and every playlist reference to deleted presentations. */
export function deleteNode(p: Project, scope: TreeScope, id: Id): void {
  if (!detachNode(p, scope, id)) return
  const removeRec = (nodeId: Id): void => {
    const folder = p.folders[nodeId]
    if (folder) {
      for (const child of folder.childIds) removeRec(child)
      delete p.folders[nodeId]
      return
    }
    if (p.presentations[nodeId]) {
      delete p.presentations[nodeId]
      for (const pl of Object.values(p.playlists)) {
        pl.entries = pl.entries.filter((e) => !(e.kind === 'presentation' && e.presentationId === nodeId))
      }
    }
    delete p.playlists[nodeId]
  }
  removeRec(id)
}

/** Counts how many playlist entries would be removed by deleting an item. */
export function playlistReferencesTo(p: Project, id: Id): number {
  const presentationIds = new Set(leafIdsUnder(p, id).filter((x) => p.presentations[x]))
  let count = 0
  for (const pl of Object.values(p.playlists)) {
    for (const e of pl.entries) if (e.kind === 'presentation' && presentationIds.has(e.presentationId)) count++
  }
  return count
}

/* ------------------------------------------------------------------ */
/* Playlists                                                           */
/* ------------------------------------------------------------------ */

export type NewPlaylistEntry =
  | { kind: 'presentation'; presentationId: Id }
  | { kind: 'header'; title: string; color: string }

export function addPlaylistEntries(p: Project, playlistId: Id, entries: NewPlaylistEntry[], index?: number): Id[] {
  const pl = p.playlists[playlistId]
  if (!pl) return []
  const created: PlaylistEntry[] = []
  for (const e of entries) {
    if (e.kind === 'presentation' && !p.presentations[e.presentationId]) continue
    created.push({ ...e, id: newId() })
  }
  const i = index === undefined ? pl.entries.length : Math.max(0, Math.min(index, pl.entries.length))
  pl.entries.splice(i, 0, ...created)
  pl.updatedAt = nowIso()
  return created.map((e) => e.id)
}

/** Moves an entry within or between playlists. `index` is the insertion position before the move. */
export function movePlaylistEntry(p: Project, fromId: Id, entryId: Id, toId: Id, index: number): void {
  const from = p.playlists[fromId]
  const to = p.playlists[toId]
  if (!from || !to) return
  const fromIndex = from.entries.findIndex((e) => e.id === entryId)
  if (fromIndex < 0) return
  const [entry] = from.entries.splice(fromIndex, 1)
  if (!entry) return
  const adjusted = fromId === toId && fromIndex < index ? index - 1 : index
  to.entries.splice(Math.max(0, Math.min(adjusted, to.entries.length)), 0, entry)
  from.updatedAt = to.updatedAt = nowIso()
}

export function removePlaylistEntries(p: Project, playlistId: Id, entryIds: Id[]): void {
  const pl = p.playlists[playlistId]
  if (!pl) return
  const remove = new Set(entryIds)
  pl.entries = pl.entries.filter((e) => !remove.has(e.id))
  pl.updatedAt = nowIso()
}

export function updateHeaderEntry(p: Project, playlistId: Id, entryId: Id, patch: { title?: string; color?: string }): void {
  const entry = p.playlists[playlistId]?.entries.find((e) => e.id === entryId)
  if (!entry || entry.kind !== 'header') return
  if (patch.title !== undefined && patch.title.trim()) entry.title = patch.title.trim()
  if (patch.color !== undefined) entry.color = patch.color
}

/* ------------------------------------------------------------------ */
/* Slides                                                              */
/* ------------------------------------------------------------------ */

function touch(pres: Presentation): void {
  pres.updatedAt = nowIso()
}

export function insertSlides(p: Project, presentationId: Id, slides: Slide[], index?: number): void {
  const pres = p.presentations[presentationId]
  if (!pres) return
  const i = index === undefined ? pres.slides.length : Math.max(0, Math.min(index, pres.slides.length))
  pres.slides.splice(i, 0, ...slides)
  touch(pres)
}

/** Duplicates the given slides, placing each block of copies after the last selected slide. */
export function duplicateSlides(p: Project, presentationId: Id, slideIds: Id[]): Id[] {
  const pres = p.presentations[presentationId]
  if (!pres) return []
  const selected = new Set(slideIds)
  const indices = pres.slides.map((s, i) => (selected.has(s.id) ? i : -1)).filter((i) => i >= 0)
  if (indices.length === 0) return []
  const copies = indices.map((i) => cloneSlide(plain(pres.slides[i] as Slide)))
  pres.slides.splice((indices[indices.length - 1] as number) + 1, 0, ...copies)
  touch(pres)
  return copies.map((c) => c.id)
}

/**
 * Moves a set of slides (kept in their relative order) so they land before the slide that
 * is currently at `toIndex` (or at the end when `toIndex` equals the slide count).
 */
export function moveSlides(p: Project, presentationId: Id, slideIds: Id[], toIndex: number): void {
  const pres = p.presentations[presentationId]
  if (!pres) return
  const moving = new Set(slideIds)
  const before = pres.slides.slice(0, toIndex).filter((s) => !moving.has(s.id))
  const after = pres.slides.slice(toIndex).filter((s) => !moving.has(s.id))
  const moved = pres.slides.filter((s) => moving.has(s.id))
  if (moved.length === 0) return
  pres.slides = [...before, ...moved, ...after]
  touch(pres)
}

export function deleteSlides(p: Project, presentationId: Id, slideIds: Id[]): void {
  const pres = p.presentations[presentationId]
  if (!pres) return
  const remove = new Set(slideIds)
  pres.slides = pres.slides.filter((s) => !remove.has(s.id))
  touch(pres)
}

export type SlidePatch = Partial<Pick<Slide, 'label' | 'color' | 'enabled' | 'notes' | 'background' | 'transition' | 'groupId'>>

export function updateSlides(p: Project, presentationId: Id, slideIds: Id[], patch: SlidePatch): void {
  const pres = p.presentations[presentationId]
  if (!pres) return
  const ids = new Set(slideIds)
  for (const s of pres.slides) if (ids.has(s.id)) Object.assign(s, patch)
  touch(pres)
}

/** Replaces the text of the slide's first text element (quick edit before the full editor). */
export function setSlideText(p: Project, presentationId: Id, slideId: Id, text: string): void {
  const pres = p.presentations[presentationId]
  const slide = pres?.slides.find((s) => s.id === slideId)
  if (!pres || !slide) return
  const el = slide.elements.find((e) => e.type === 'text')
  if (el && el.type === 'text') el.text = text
  touch(pres)
}

/* ------------------------------------------------------------------ */
/* Media                                                               */
/* ------------------------------------------------------------------ */

/** Adds assets to the project and to the active profile's media. */
export function addMediaAssets(p: Project, assets: MediaAsset[]): void {
  const profile = activeProfile(p)
  for (const a of assets) {
    p.media[a.id] = a
    if (!profile.mediaIds.includes(a.id)) profile.mediaIds.push(a.id)
  }
}

export function updateMediaAsset(p: Project, id: Id, patch: Partial<Pick<MediaAsset, 'name' | 'width' | 'height' | 'durationSec'>>): void {
  const asset = p.media[id]
  if (asset) Object.assign(asset, patch)
}

/** Where a media asset is referenced: slide backgrounds/elements and playlist entries. */
export function mediaUsage(p: Project, mediaId: Id): { slides: number; playlistEntries: number } {
  let slides = 0
  let playlistEntries = 0
  const usesBg = (bg: Presentation['background']): boolean => !!bg && (bg.type === 'image' || bg.type === 'video') && bg.mediaId === mediaId
  for (const pres of Object.values(p.presentations)) {
    for (const s of pres.slides) {
      if (usesBg(s.background) || s.elements.some((e) => (e.type === 'image' || e.type === 'video') && e.mediaId === mediaId)) slides++
    }
  }
  for (const pl of Object.values(p.mediaPlaylists)) if (pl.mediaIds.includes(mediaId)) playlistEntries++
  return { slides, playlistEntries }
}

/**
 * Removes assets from the project and from media playlists. Slides that still reference them
 * render a "missing media" placeholder. Files stay on disk so undo can bring the asset back.
 */
export function removeMediaAssets(p: Project, ids: Id[]): void {
  const remove = new Set(ids)
  for (const id of ids) delete p.media[id]
  for (const pl of Object.values(p.mediaPlaylists)) {
    if (pl.mediaIds.some((id) => remove.has(id))) pl.mediaIds = pl.mediaIds.filter((id) => !remove.has(id))
  }
  for (const profile of Object.values(p.profiles)) {
    if (profile.mediaIds.some((id) => remove.has(id))) profile.mediaIds = profile.mediaIds.filter((id) => !remove.has(id))
  }
}

/**
 * Takes media out of the active profile (and its media playlists). Assets no other profile
 * uses are removed from the project. Returns the ids removed from the project.
 */
export function removeMediaFromProfile(p: Project, ids: Id[]): Id[] {
  const profile = activeProfile(p)
  const remove = new Set(ids)
  profile.mediaIds = profile.mediaIds.filter((id) => !remove.has(id))
  for (const plId of profile.mediaPlaylistOrder) {
    const pl = p.mediaPlaylists[plId]
    if (pl && pl.mediaIds.some((id) => remove.has(id))) pl.mediaIds = pl.mediaIds.filter((id) => !remove.has(id))
  }
  const orphans = ids.filter((id) => !Object.values(p.profiles).some((pr) => pr.mediaIds.includes(id)))
  removeMediaAssets(p, orphans)
  return orphans
}

/** How many other profiles also show each of these assets. */
export function mediaSharedWith(p: Project, ids: Id[]): Profile[] {
  const active = activeProfile(p)
  return Object.values(p.profiles).filter((pr) => pr.id !== active.id && ids.some((id) => pr.mediaIds.includes(id)))
}

/* ------------------------------------------------------------------ */
/* Media playlists                                                     */
/* ------------------------------------------------------------------ */

export function addMediaPlaylist(p: Project, name: string, kind: MediaPlaylistKind): MediaPlaylist {
  const pl = createMediaPlaylist(name, kind)
  p.mediaPlaylists[pl.id] = pl
  activeProfile(p).mediaPlaylistOrder.push(pl.id)
  return pl
}

export const PW_PLAYLIST_NAME = 'P&W Backgrounds'

/** The profile's "P&W Backgrounds" playlist (Templates backgrounds); created after Backgrounds when missing. */
export function pwBackgroundsPlaylist(p: Project, profile: Profile = activeProfile(p)): MediaPlaylist {
  const found = profile.mediaPlaylistOrder.map((id) => p.mediaPlaylists[id]).find((pl) => pl?.role === 'pw-backgrounds')
  if (found) return found
  const pl: MediaPlaylist = { ...createMediaPlaylist(PW_PLAYLIST_NAME, 'background'), role: 'pw-backgrounds' }
  p.mediaPlaylists[pl.id] = pl
  const bg = profile.mediaPlaylistOrder.findIndex((id) => p.mediaPlaylists[id]?.kind === 'background')
  profile.mediaPlaylistOrder.splice(bg + 1, 0, pl.id)
  return p.mediaPlaylists[pl.id] as MediaPlaylist
}

/** Media that only shows when its playlist is opened: the items of the profile's P&W Backgrounds playlist. */
export function hiddenFromAllMedia(p: Project, profile: Profile = activeProfile(p)): Set<Id> {
  const hidden = new Set<Id>()
  for (const id of profile.mediaPlaylistOrder) {
    const pl = p.mediaPlaylists[id]
    if (pl?.role === 'pw-backgrounds') for (const m of pl.mediaIds) hidden.add(m)
  }
  return hidden
}

export function deleteMediaPlaylist(p: Project, id: Id): void {
  delete p.mediaPlaylists[id]
  for (const profile of Object.values(p.profiles)) profile.mediaPlaylistOrder = profile.mediaPlaylistOrder.filter((x) => x !== id)
}

export function renameMediaPlaylist(p: Project, id: Id, name: string): void {
  const pl = p.mediaPlaylists[id]
  if (!pl || !name.trim()) return
  pl.name = name.trim()
  pl.updatedAt = nowIso()
}

/** Appends media the playlist accepts and doesn't already hold. Returns the ids added. */
export function addToMediaPlaylist(p: Project, id: Id, mediaIds: Id[]): Id[] {
  const pl = p.mediaPlaylists[id]
  if (!pl) return []
  const have = new Set(pl.mediaIds)
  const added: Id[] = []
  for (const m of mediaIds) {
    if (!mediaPlaylistAccepts(pl.kind, p.media[m]?.kind) || have.has(m)) continue
    have.add(m)
    added.push(m)
  }
  if (added.length) {
    pl.mediaIds.push(...added)
    pl.updatedAt = nowIso()
  }
  return added
}

export function removeFromMediaPlaylist(p: Project, id: Id, mediaIds: Id[]): void {
  const pl = p.mediaPlaylists[id]
  if (!pl) return
  const remove = new Set(mediaIds)
  pl.mediaIds = pl.mediaIds.filter((m) => !remove.has(m))
  pl.updatedAt = nowIso()
}

/** Moves media within a playlist so they sit before `beforeId` (null = the end). */
export function moveInMediaPlaylist(p: Project, id: Id, mediaIds: Id[], beforeId: Id | null): void {
  const pl = p.mediaPlaylists[id]
  if (!pl) return
  const moving = new Set(mediaIds.filter((m) => pl.mediaIds.includes(m)))
  if (moving.size === 0 || (beforeId && moving.has(beforeId))) return
  const rest = pl.mediaIds.filter((m) => !moving.has(m))
  const at = beforeId ? rest.indexOf(beforeId) : rest.length
  rest.splice(at < 0 ? rest.length : at, 0, ...pl.mediaIds.filter((m) => moving.has(m)))
  pl.mediaIds = rest
  pl.updatedAt = nowIso()
}

/* ------------------------------------------------------------------ */
/* Profiles                                                            */
/* ------------------------------------------------------------------ */

export function addProfile(p: Project, name: string, index?: number): Profile {
  const { profile, mediaPlaylists } = createProfile(name)
  p.profiles[profile.id] = profile
  for (const m of mediaPlaylists) p.mediaPlaylists[m.id] = m
  insertAt(p.profileOrder, profile.id, index)
  return profile
}

export function setActiveProfile(p: Project, id: Id): void {
  if (p.profiles[id]) p.activeProfileId = id
}

export function renameProfile(p: Project, id: Id, name: string): void {
  const profile = p.profiles[id]
  if (!profile || !name.trim()) return
  profile.name = name.trim()
  profile.updatedAt = nowIso()
}

/** Moves a profile tab to `index` (position before the move). */
export function moveProfile(p: Project, id: Id, index: number): void {
  const from = p.profileOrder.indexOf(id)
  if (from < 0) return
  p.profileOrder.splice(from, 1)
  insertAt(p.profileOrder, id, from < index ? index - 1 : index)
}

/**
 * Deletes a profile with its pages, playlists and media playlists. Media only it uses is
 * removed from the project. The last profile cannot be deleted.
 */
export function deleteProfile(p: Project, id: Id): void {
  const profile = p.profiles[id]
  if (!profile || p.profileOrder.length <= 1) return
  const previous = p.activeProfileId
  p.activeProfileId = id
  for (const scope of ['library', 'playlists'] as const) for (const node of [...profile.trees[scope]]) deleteNode(p, scope, node)
  for (const plId of profile.mediaPlaylistOrder) delete p.mediaPlaylists[plId]
  const ids = [...profile.mediaIds]
  delete p.profiles[id]
  p.profileOrder = p.profileOrder.filter((x) => x !== id)
  removeMediaAssets(p, ids.filter((m) => !Object.values(p.profiles).some((pr) => pr.mediaIds.includes(m))))
  p.activeProfileId = previous !== id && p.profiles[previous] ? previous : (p.profileOrder[0] as Id)
}

/** Media used by slides of the given presentations (backgrounds and image/video elements). */
export function presentationMediaIds(p: Project, presentationIds: Id[]): Id[] {
  const out = new Set<Id>()
  const bg = (b: Presentation['background']): void => {
    if (b && (b.type === 'image' || b.type === 'video')) out.add(b.mediaId)
  }
  for (const id of presentationIds) {
    const pres = p.presentations[id]
    if (!pres) continue
    bg(pres.background)
    for (const s of pres.slides) {
      bg(s.background)
      for (const e of s.elements) if (e.type === 'image' || e.type === 'video') out.add(e.mediaId)
    }
  }
  return [...out].filter((id) => p.media[id])
}

/** Adds existing assets to another profile's media (they become shared). */
export function shareMediaWithProfile(p: Project, profileId: Id, ids: Id[]): void {
  const profile = p.profiles[profileId]
  if (!profile) return
  for (const id of ids) if (p.media[id] && !profile.mediaIds.includes(id)) profile.mediaIds.push(id)
}

/**
 * Copies (or moves) a library / playlists item from the active profile to the end of another
 * profile's tree. Media its pages use is shared with that profile. Returns the new id.
 */
export function sendNodeToProfile(p: Project, scope: TreeScope, id: Id, profileId: Id, mode: 'copy' | 'move'): Id | null {
  const target = p.profiles[profileId]
  if (!target || profileId === p.activeProfileId || !idsInProfile(p, scope).has(id)) return null
  let nodeId: Id | null = id
  if (mode === 'move') {
    if (!detachNode(p, scope, id)) return null
  } else {
    nodeId = cloneSubtree(p, scope, id)
    if (!nodeId) return null
  }
  target.trees[scope].push(nodeId)
  if (scope === 'library') shareMediaWithProfile(p, profileId, presentationMediaIds(p, leafIdsUnder(p, nodeId)))
  return nodeId
}
