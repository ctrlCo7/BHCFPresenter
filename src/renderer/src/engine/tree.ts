/**
 * Read-only helpers for the library and playlist trees.
 *
 * Trees are stored as ordered id lists: the active profile's `trees[scope]` for the root and
 * `folder.childIds` for each folder. Leaves are presentations (library) or playlists (playlists).
 */
import type { Folder, Id, MediaAsset, Playlist, Presentation, Profile, Project, TreeScope } from '@shared/model/types'

export type TreeItem =
  | { kind: 'folder'; id: Id; folder: Folder }
  | { kind: 'presentation'; id: Id; presentation: Presentation }
  | { kind: 'playlist'; id: Id; playlist: Playlist }

export function getTreeItem(project: Project, id: Id): TreeItem | null {
  const folder = project.folders[id]
  if (folder) return { kind: 'folder', id, folder }
  const presentation = project.presentations[id]
  if (presentation) return { kind: 'presentation', id, presentation }
  const playlist = project.playlists[id]
  if (playlist) return { kind: 'playlist', id, playlist }
  return null
}

export function itemName(project: Project, id: Id): string {
  const item = getTreeItem(project, id)
  if (!item) return ''
  switch (item.kind) {
    case 'folder':
      return item.folder.name
    case 'presentation':
      return item.presentation.name
    case 'playlist':
      return item.playlist.name
  }
}

export function scopeOf(project: Project, id: Id): TreeScope | null {
  if (project.folders[id]) return project.folders[id].scope
  if (project.presentations[id]) return 'library'
  if (project.playlists[id]) return 'playlists'
  return null
}

/** The child list that holds items of a parent (null = tree root). */
export function childList(project: Project, scope: TreeScope, parentId: Id | null): Id[] {
  if (parentId === null) return rootList(project, scope)
  return project.folders[parentId]?.childIds ?? []
}

/** Parent folder id, null if at root, undefined if the item is not in the tree. */
export function findParentId(project: Project, scope: TreeScope, id: Id): Id | null | undefined {
  if (rootList(project, scope).includes(id)) return null
  for (const folder of Object.values(project.folders)) {
    if (folder.scope === scope && folder.childIds.includes(id)) return folder.id
  }
  return undefined
}

/** True when `id` is `ancestorId` or lives somewhere beneath it. */
export function isSelfOrDescendant(project: Project, ancestorId: Id, id: Id): boolean {
  if (ancestorId === id) return true
  const folder = project.folders[ancestorId]
  if (!folder) return false
  return folder.childIds.some((child) => isSelfOrDescendant(project, child, id))
}

/** Path of folder names from the root down to (excluding) the item. */
export function folderPath(project: Project, scope: TreeScope, id: Id): string[] {
  const out: string[] = []
  let parent = findParentId(project, scope, id)
  let guard = 0
  while (parent && guard++ < 256) {
    out.unshift(project.folders[parent]?.name ?? '')
    parent = findParentId(project, scope, parent)
  }
  return out
}

/** All leaf ids beneath a folder (depth-first, in display order). */
export function leafIdsUnder(project: Project, id: Id): Id[] {
  const folder = project.folders[id]
  if (!folder) return [id]
  return folder.childIds.flatMap((child) => leafIdsUnder(project, child))
}

/** Depth-first visible rows, honouring the expanded state of folders and playlists. */
export interface FlatRow {
  id: Id
  depth: number
  parentId: Id | null
}

export function flattenTree(project: Project, scope: TreeScope, expanded: Record<Id, boolean>): FlatRow[] {
  const rows: FlatRow[] = []
  const walk = (ids: Id[], depth: number, parentId: Id | null): void => {
    for (const id of ids) {
      rows.push({ id, depth, parentId })
      const folder = project.folders[id]
      if (folder && expanded[id]) walk(folder.childIds, depth + 1, id)
    }
  }
  walk(rootList(project, scope), 0, null)
  return rows
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
export const compareNames = (a: string, b: string): number => collator.compare(a, b)

/** The profile the workspace shows. */
export function activeProfile(project: Project): Profile {
  return (project.profiles[project.activeProfileId] ?? project.profiles[project.profileOrder[0] ?? '']) as Profile
}

/** Root-level ids of a scope's tree in the active profile (or `profile`). */
export function rootList(project: Project, scope: TreeScope, profile: Profile = activeProfile(project)): Id[] {
  return profile.trees[scope]
}

/** Every folder and item in a profile's tree for `scope`. */
export function idsInProfile(project: Project, scope: TreeScope, profile: Profile = activeProfile(project)): Set<Id> {
  const out = new Set<Id>()
  const walk = (ids: Id[]): void => {
    for (const id of ids) {
      if (out.has(id)) continue
      out.add(id)
      const folder = project.folders[id]
      if (folder) walk(folder.childIds)
    }
  }
  walk(profile.trees[scope])
  return out
}

/** The profile whose `scope` tree holds `id` (null if none). */
export function profileOfItem(project: Project, scope: TreeScope, id: Id): Profile | null {
  for (const pid of project.profileOrder) {
    const profile = project.profiles[pid]
    if (profile && idsInProfile(project, scope, profile).has(id)) return profile
  }
  return null
}

const mediaCache = new WeakMap<Project, Record<Id, MediaAsset>>()

/** The active profile's media as a record (cached per project version). */
export function profileMediaRecord(project: Project): Record<Id, MediaAsset> {
  let out = mediaCache.get(project)
  if (!out) {
    out = {}
    for (const id of activeProfile(project).mediaIds) {
      const m = project.media[id]
      if (m) out[id] = m
    }
    mediaCache.set(project, out)
  }
  return out
}

/** The active profile's playlists, in tree order. */
export function profilePlaylists(project: Project): Playlist[] {
  return [...idsInProfile(project, 'playlists')].map((id) => project.playlists[id]).filter((pl): pl is Playlist => !!pl)
}
