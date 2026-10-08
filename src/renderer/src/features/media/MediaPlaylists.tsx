/**
 * The playlist column of the Media tab: "All Media" plus the project's media playlists (Images,
 * Backgrounds, Videos, Audio and any the user adds).
 * Selecting one shows only its items in the grid; media dragged from the grid drops onto a row.
 */
import { Film, Image as ImageIcon, LayoutGrid, Music, Pencil, Play, Plus, Sparkles, Trash2, Wallpaper } from 'lucide-react'
import { useState, type ReactElement } from 'react'
import { MEDIA_PLAYLIST_KINDS, mediaPlaylistAccepts, type Id, type MediaPlaylistKind, type Project } from '@shared/model/types'
import { currentDrag, endDrag } from '../../services/dragState'
import { contextMenu, type MenuItem } from '../../store/overlayStore'
import { ui, useUiStore } from '../../store/uiStore'
import { playMedia } from '../../live/liveActions'
import { addToMediaPlaylistWithToast, deleteMediaPlaylistAction, KIND_LABEL, newMediaPlaylist, renameMediaPlaylistAction } from './mediaPlaylistActions'
import { activeProfile } from '../../engine/tree'
import { hiddenFromAllMedia } from '../../engine/projectOps'

export const PLAYLIST_ICON: Record<MediaPlaylistKind, typeof Film> = { image: ImageIcon, background: Wallpaper, video: Film, audio: Music }

export function newPlaylistMenu(): MenuItem[] {
  return MEDIA_PLAYLIST_KINDS.map((kind) => {
    const Icon = PLAYLIST_ICON[kind]
    return { label: `New ${KIND_LABEL[kind]} Playlist…`, icon: <Icon size={14} />, onSelect: () => void newMediaPlaylist(kind) }
  })
}

export function MediaPlaylists({ project }: { project: Project }): ReactElement {
  const activeId = useUiStore((s) => s.mediaPlaylistId)
  const [dropId, setDropId] = useState<Id | null>(null)
  const active = activeId && activeProfile(project).mediaPlaylistOrder.includes(activeId) ? activeId : null
  const hidden = hiddenFromAllMedia(project)

  /** Media ids being dragged that this playlist accepts. */
  const acceptedIds = (id: Id): Id[] => {
    const payload = currentDrag()
    const kind = project.mediaPlaylists[id]?.kind
    if (payload?.type !== 'media' || !kind) return []
    return payload.ids.filter((m) => mediaPlaylistAccepts(kind, project.media[m]?.kind))
  }

  const onContext = (e: React.MouseEvent, id: Id): void => {
    e.preventDefault()
    e.stopPropagation()
    const pl = project.mediaPlaylists[id]
    if (!pl) return
    const first = pl.mediaIds.find((m) => project.media[m])
    contextMenu.fromEvent(e, [
      {
        label: 'Play from Start',
        icon: <Play size={14} />,
        disabled: !first,
        onSelect: () => first && playMedia(first, { playlistId: id, entryId: first })
      },
      { type: 'separator' },
      { label: 'Rename…', icon: <Pencil size={14} />, onSelect: () => void renameMediaPlaylistAction(id) },
      { label: 'Delete Playlist…', icon: <Trash2 size={14} />, danger: true, onSelect: () => void deleteMediaPlaylistAction(id) }
    ])
  }

  return (
    <aside className="media-lists" onContextMenu={(e) => contextMenu.fromEvent(e, newPlaylistMenu())}>
      <div className={`media-list-row${active ? '' : ' selected'}`} onClick={() => ui.set({ mediaPlaylistId: null })}>
        <LayoutGrid size={14} className="media-list-icon" />
        <span className="media-list-name">All Media</span>
        <span className="media-list-count">{activeProfile(project).mediaIds.filter((id) => !hidden.has(id)).length}</span>
      </div>
      <div className="media-lists-head">
        <span>Playlists</span>
        <button className="icon-btn" title="New playlist" aria-label="New playlist" onClick={(e) => contextMenu.fromEvent(e, newPlaylistMenu())}>
          <Plus size={13} />
        </button>
      </div>
      {activeProfile(project).mediaPlaylistOrder.map((id) => {
        const pl = project.mediaPlaylists[id]
        if (!pl) return null
        const Icon = pl.role === 'pw-backgrounds' ? Sparkles : PLAYLIST_ICON[pl.kind]
        return (
          <div
            key={id}
            className={`media-list-row${active === id ? ' selected' : ''}${dropId === id ? ' drop-inside' : ''}`}
            title={pl.role === 'pw-backgrounds' ? 'Backgrounds from Templates (hidden from All Media)' : `${KIND_LABEL[pl.kind]} playlist`}
            onClick={() => ui.set({ mediaPlaylistId: id })}
            onContextMenu={(e) => onContext(e, id)}
            onDragOver={(e) => {
              if (acceptedIds(id).length === 0) return
              e.preventDefault()
              e.dataTransfer.dropEffect = 'copy'
              if (dropId !== id) setDropId(id)
            }}
            onDragLeave={() => setDropId(null)}
            onDrop={(e) => {
              setDropId(null)
              const ids = acceptedIds(id)
              if (ids.length === 0) return
              e.preventDefault()
              addToMediaPlaylistWithToast(id, ids)
              endDrag()
            }}
          >
            <Icon size={14} className="media-list-icon" />
            <span className="media-list-name">{pl.name}</span>
            <span className="media-list-count">{pl.mediaIds.length}</span>
          </div>
        )
      })}
      {activeProfile(project).mediaPlaylistOrder.length === 0 && <div className="media-lists-empty">No playlists. Click + to create one.</div>}
    </aside>
  )
}
