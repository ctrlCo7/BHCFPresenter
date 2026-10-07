/** Media-tab playlists: typed collections of images, backgrounds (images + videos), videos or audio. */
import { mediaPlaylistAccepts, type Id, type MediaKind, type MediaPlaylistKind } from '@shared/model/types'
import { addMediaPlaylist, addToMediaPlaylist, deleteMediaPlaylist, moveInMediaPlaylist, removeFromMediaPlaylist, renameMediaPlaylist } from '../../engine/projectOps'
import { dialogs, toast } from '../../store/overlayStore'
import { applyChange, requireProject } from '../../store/projectStore'
import { ui } from '../../store/uiStore'
import { activeProfile } from '../../engine/tree'

export const KIND_LABEL: Record<MediaPlaylistKind, string> = { image: 'Image', background: 'Background', video: 'Video', audio: 'Audio' }

/** What each playlist kind holds, for messages. */
export const KIND_ITEMS: Record<MediaPlaylistKind, string> = { image: 'images', background: 'images or videos', video: 'videos', audio: 'audio files' }

/** Prompts for a name and creates a playlist; returns its id (null if cancelled). */
export async function newMediaPlaylist(kind: MediaPlaylistKind, show = true): Promise<Id | null> {
  const name = await dialogs.prompt({
    title: `New ${KIND_LABEL[kind]} Playlist`,
    label: 'Playlist name',
    defaultValue: `${KIND_LABEL[kind]} Playlist`,
    confirmLabel: 'Create'
  })
  if (!name?.trim()) return null
  let id: Id = ''
  applyChange('New media playlist', (d) => {
    id = addMediaPlaylist(d, name.trim(), kind).id
  })
  if (show) ui.set({ mediaPlaylistId: id })
  return id
}

/** Creates a playlist (of the first item's kind unless given) and adds the media to it. */
export async function addToNewMediaPlaylist(mediaIds: Id[], kind?: MediaPlaylistKind): Promise<void> {
  const k = kind ?? requireProject().media[mediaIds[0] ?? '']?.kind
  if (!k) return
  const id = await newMediaPlaylist(k, false)
  if (id) addToMediaPlaylistWithToast(id, mediaIds)
}

/** The playlist a quick "Add to Playlist" uses for this media: the one being viewed, else the last edited that accepts it. */
export function defaultMediaPlaylistFor(kind: MediaKind): Id | null {
  const p = requireProject()
  const viewing = p.mediaPlaylists[ui.get().mediaPlaylistId ?? '']
  if (viewing && mediaPlaylistAccepts(viewing.kind, kind)) return viewing.id
  let best: Id | null = null
  for (const id of activeProfile(p).mediaPlaylistOrder) {
    const pl = p.mediaPlaylists[id]
    if (pl && mediaPlaylistAccepts(pl.kind, kind) && (!best || pl.updatedAt > (p.mediaPlaylists[best]?.updatedAt ?? ''))) best = id
  }
  return best
}

export function addToMediaPlaylistWithToast(playlistId: Id, mediaIds: Id[]): void {
  let added: Id[] = []
  applyChange('Add to media playlist', (d) => {
    added = addToMediaPlaylist(d, playlistId, mediaIds)
  })
  const name = requireProject().mediaPlaylists[playlistId]?.name ?? 'playlist'
  if (added.length) toast.success(`Added ${added.length === 1 ? '1 item' : `${added.length} items`} to "${name}"`)
  else toast.info(`Already in "${name}"`)
}

export function removeFromMediaPlaylistAction(playlistId: Id, mediaIds: Id[]): void {
  applyChange('Remove from media playlist', (d) => removeFromMediaPlaylist(d, playlistId, mediaIds))
}

export function moveInMediaPlaylistAction(playlistId: Id, mediaIds: Id[], beforeId: Id | null): void {
  applyChange('Reorder media playlist', (d) => moveInMediaPlaylist(d, playlistId, mediaIds, beforeId))
}

export async function renameMediaPlaylistAction(id: Id): Promise<void> {
  const pl = requireProject().mediaPlaylists[id]
  if (!pl) return
  const name = await dialogs.prompt({ title: 'Rename Playlist', label: 'Playlist name', defaultValue: pl.name, confirmLabel: 'Rename' })
  if (name?.trim() && name.trim() !== pl.name) applyChange('Rename media playlist', (d) => renameMediaPlaylist(d, id, name))
}

export async function deleteMediaPlaylistAction(id: Id): Promise<void> {
  const pl = requireProject().mediaPlaylists[id]
  if (!pl) return
  const ok = await dialogs.confirm({
    title: 'Delete playlist',
    message: `Delete the playlist "${pl.name}"? Its media stays in the project.`,
    confirmLabel: 'Delete',
    danger: true
  })
  if (!ok) return
  applyChange('Delete media playlist', (d) => deleteMediaPlaylist(d, id))
  if (ui.get().mediaPlaylistId === id) ui.set({ mediaPlaylistId: null })
}
