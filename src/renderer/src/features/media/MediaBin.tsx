import { BadgeCheck, CalendarDays, CalendarPlus, Sparkles, Clapperboard, Film, FolderInput, Image as ImageIcon, ImagePlus, ListMinus, ListPlus, Music, Pencil, Play, Trash2, Upload, Wallpaper } from 'lucide-react'
import { memo, useMemo, useRef, useState, type ReactElement } from 'react'
import { mediaUrl, thumbnailUrl } from '@shared/media'
import { mediaPlaylistAccepts, type Id, type MediaAsset, type MediaPlaylist, type Project } from '@shared/model/types'
import { useStableCallback } from '../../components/hooks'
import { EmptyState, IconButton, PanelHeader } from '../../components/ui/Panel'
import { fold } from '../../engine/search'
import { shortcutLabel } from '../../services/commands'
import { beginDrag, currentDrag, endDrag, isFileDrag } from '../../services/dragState'
import { setFocusZone, useZoneHandlers } from '../../services/focusZones'
import { contextMenu, type MenuItem } from '../../store/overlayStore'
import { useProjectStore } from '../../store/projectStore'
import { ui, useUiStore } from '../../store/uiStore'
import { MediaPlaylists, newPlaylistMenu } from './MediaPlaylists'
import { otherProfiles, sendMediaToProfile } from '../profiles/profileActions'
import {
  addToMediaPlaylistWithToast,
  addToNewMediaPlaylist,
  defaultMediaPlaylistFor,
  KIND_ITEMS,
  KIND_LABEL,
  moveInMediaPlaylistAction,
  removeFromMediaPlaylistAction
} from './mediaPlaylistActions'
import { openTemplates } from '../backgrounds/TemplatesDialog'
import { patchSlides } from '../presentation/slideActions'
import { playBackground, playMedia } from '../../live/liveActions'
import { useLiveStore } from '../../live/liveStore'
import { deleteMedia, formatBytes, formatDuration, importMedia, renameMedia, setAsLogo } from './mediaActions'
import { activeProfile } from '../../engine/tree'
import { hiddenFromAllMedia } from '../../engine/projectOps'
import './media.css'

const KIND_ICON = { image: ImageIcon, video: Film, audio: Music } as const
/** Reorder target meaning "after the last tile" */
const END = '\u0000end'

const MediaTile = memo(function MediaTile({
  asset,
  selected,
  live,
  isBackground,
  dropBefore,
  onMouseDown,
  onContext,
  onDragStart,
  onPlay,
  onDragOverTile,
  onDropTile
}: {
  asset: MediaAsset
  selected: boolean
  live: boolean
  isBackground: boolean
  /** Reorder indicator while dragging within a playlist */
  dropBefore: boolean
  onMouseDown: (e: React.MouseEvent, asset: MediaAsset) => void
  onContext: (e: React.MouseEvent, asset: MediaAsset) => void
  onDragStart: (e: React.DragEvent, asset: MediaAsset) => void
  onPlay: (asset: MediaAsset) => void
  onDragOverTile: (e: React.DragEvent, asset: MediaAsset) => void
  onDropTile: (e: React.DragEvent, asset: MediaAsset) => void
}): ReactElement {
  const Icon = KIND_ICON[asset.kind]
  const meta = [asset.width && asset.height ? `${asset.width}×${asset.height}` : null, formatDuration(asset.durationSec) || null, formatBytes(asset.sizeBytes)]
    .filter(Boolean)
    .join(' · ')
  return (
    <div
      className={`media-tile${selected ? ' selected' : ''}${live ? ' live' : ''}${dropBefore ? ' drop-before' : ''}`}
      onDoubleClick={() => onPlay(asset)}
      draggable
      onMouseDown={(e) => onMouseDown(e, asset)}
      onContextMenu={(e) => onContext(e, asset)}
      onDragStart={(e) => onDragStart(e, asset)}
      onDragEnd={endDrag}
      onDragOver={(e) => onDragOverTile(e, asset)}
      onDrop={(e) => onDropTile(e, asset)}
      title={`${asset.name}\n${meta}`}
    >
      <div className="media-thumb">
        {asset.kind === 'image' && <img src={mediaUrl(asset.fileName)} alt="" loading="lazy" decoding="async" draggable={false} />}
        {asset.kind === 'video' &&
          (asset.thumbnail ? (
            <img src={thumbnailUrl(asset.thumbnail)} alt="" loading="lazy" decoding="async" draggable={false} />
          ) : (
            <video src={`${mediaUrl(asset.fileName)}#t=1`} preload="metadata" muted playsInline />
          ))}
        {asset.kind === 'audio' && <Music size={28} strokeWidth={1.4} className="media-audio-icon" />}
        <span className="media-kind">
          <Icon size={11} />
          {asset.durationSec !== null && <span>{formatDuration(asset.durationSec)}</span>}
        </span>
      </div>
      <div className="media-name">{asset.name}</div>
      <div className="media-actions" onMouseDown={(e) => e.stopPropagation()}>
        <button className="media-action" title={asset.kind === 'audio' ? 'Play audio' : 'Play full screen'} onClick={() => onPlay(asset)}>
          <Play size={12} /> Play
        </button>
        {asset.kind !== 'audio' && (
          <button
            className={`media-action${isBackground ? ' on' : ''}`}
            title="Loop behind the lyrics (shows through transparent slides)"
            onClick={() => playBackground(asset.id)}
          >
            <Clapperboard size={12} /> Background
          </button>
        )}
      </div>
    </div>
  )
})

export function MediaBin(): ReactElement {
  const project = useProjectStore((s) => s.project) as Project
  const filter = useUiStore((s) => s.mediaFilter)
  const selectedIds = useUiStore((s) => s.selectedMediaIds)
  const activePresentationId = useUiStore((s) => s.activePresentationId)
  const selectedSlideIds = useUiStore((s) => s.selectedSlideIds)
  const liveMediaId = useLiveStore((s) => s.media?.mediaId ?? null)
  const bgMediaId = useLiveStore((s) => s.bgMedia?.mediaId ?? null)
  const logoId = project.settings.logoMediaId
  const mediaPlaylistId = useUiStore((s) => s.mediaPlaylistId)
  const profile = activeProfile(project)
  const profileMedia = profile.mediaIds
  // Only this profile's playlists can be shown.
  const playlist = mediaPlaylistId && profile.mediaPlaylistOrder.includes(mediaPlaylistId) ? project.mediaPlaylists[mediaPlaylistId] : undefined
  const [query, setQuery] = useState('')
  const [fileDrop, setFileDrop] = useState(false)
  const [reorderBefore, setReorderBefore] = useState<Id | null>(null)
  const dragDepth = useRef(0)
  const selected = useMemo(() => new Set(selectedIds), [selectedIds])

  const assets = useMemo(() => {
    const q = fold(query.trim())
    const matches = (m: MediaAsset): boolean => !q || fold(m.name).includes(q)
    // A playlist shows its own items in playlist order; its kind replaces the type filter.
    if (playlist) return playlist.mediaIds.map((id) => project.media[id]).filter((m): m is MediaAsset => !!m && matches(m))
    // P&W Backgrounds items show only when that playlist is opened.
    const hidden = hiddenFromAllMedia(project)
    return profileMedia
      .filter((id) => !hidden.has(id))
      .map((id) => project.media[id])
      .filter((m): m is MediaAsset => !!m)
      .filter((m) => (filter === 'all' || m.kind === filter) && matches(m))
      .sort((a, b) => b.importedAt.localeCompare(a.importedAt) || a.name.localeCompare(b.name))
  }, [project, profileMedia, playlist, filter, query])

  const onPlay = useStableCallback((asset: MediaAsset) => {
    // From a playlist, Next / Previous continue through it.
    playMedia(asset.id, playlist ? { playlistId: playlist.id, entryId: asset.id } : null)
  })

  /** Ids being dragged when they can be reordered within the shown playlist. */
  const reorderIds = (): Id[] | null => {
    const payload = currentDrag()
    if (!playlist || query || payload?.type !== 'media') return null
    return payload.ids.every((id) => playlist.mediaIds.includes(id)) ? payload.ids : null
  }

  const onDragOverTile = useStableCallback((e: React.DragEvent, asset: MediaAsset) => {
    const ids = reorderIds()
    if (!ids || ids.includes(asset.id)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (reorderBefore !== asset.id) setReorderBefore(asset.id)
  })

  const onDropTile = useStableCallback((e: React.DragEvent, asset: MediaAsset) => {
    const ids = reorderIds()
    setReorderBefore(null)
    if (!ids || !playlist || ids.includes(asset.id)) return
    e.preventDefault()
    e.stopPropagation()
    moveInMediaPlaylistAction(playlist.id, ids, asset.id)
    endDrag()
  })

  useZoneHandlers('media', {
    // Inside a playlist, Delete takes items out of the playlist, not the project.
    delete: () => (playlist ? removeFromMediaPlaylistAction(playlist.id, selectedIds) : void deleteMedia(selectedIds)),
    rename: () => selectedIds[0] && void renameMedia(selectedIds[0]),
    selectAll: () => ui.set({ selectedMediaIds: assets.map((a) => a.id) })
  })

  const onMouseDown = useStableCallback((e: React.MouseEvent, asset: MediaAsset) => {
    setFocusZone('media')
    if (e.ctrlKey || e.metaKey) {
      ui.set({ selectedMediaIds: selected.has(asset.id) ? selectedIds.filter((id) => id !== asset.id) : [...selectedIds, asset.id] })
    } else if (!selected.has(asset.id)) {
      ui.set({ selectedMediaIds: [asset.id] })
    }
  })

  const onDragStart = useStableCallback((e: React.DragEvent, asset: MediaAsset) => {
    const ids = selected.has(asset.id) ? selectedIds : [asset.id]
    beginDrag(e, { type: 'media', ids }, asset.name)
  })

  const onContext = useStableCallback((e: React.MouseEvent, asset: MediaAsset) => {
    const ids = selected.has(asset.id) ? selectedIds : [asset.id]
    if (!selected.has(asset.id)) ui.set({ selectedMediaIds: [asset.id] })
    // Offer the playlists that accept the clicked item; adding skips selected items a playlist doesn't take.
    const playlists = activeProfile(project).mediaPlaylistOrder.map((id) => project.mediaPlaylists[id]).filter((pl) => pl && mediaPlaylistAccepts(pl.kind, asset.kind)) as MediaPlaylist[]
    const targetId = defaultMediaPlaylistFor(asset.kind)
    const target = targetId ? project.mediaPlaylists[targetId] : undefined
    const kindLabel = KIND_LABEL[asset.kind]
    const others = otherProfiles()
    const canBg = ids.length === 1 && asset.kind !== 'audio' && !!activePresentationId && selectedSlideIds.length > 0
    const items: MenuItem[] = [
      { label: asset.kind === 'audio' ? 'Play Audio' : 'Play Full Screen', icon: <Play size={14} />, shortcut: 'Double-click', onSelect: () => onPlay(asset) },
      ...(asset.kind !== 'audio'
        ? [{ label: 'Use as Live Background (behind lyrics)', icon: <Clapperboard size={14} />, onSelect: () => playBackground(asset.id) }]
        : []),
      ...(asset.kind === 'image'
        ? [{ label: logoId === asset.id ? 'Current Logo' : 'Use as Logo', icon: <BadgeCheck size={14} />, disabled: logoId === asset.id, onSelect: () => setAsLogo(asset.id) }]
        : []),
      { type: 'separator' },
      {
        label: `Set as Background of ${selectedSlideIds.length || ''} Selected Slide${selectedSlideIds.length === 1 ? '' : 's'}`.replace('  ', ' '),
        icon: <Wallpaper size={14} />,
        disabled: !canBg,
        onSelect: () =>
          patchSlides(
            selectedSlideIds,
            {
              background:
                asset.kind === 'video'
                  ? { type: 'video', mediaId: asset.id, fit: 'cover', loop: true, muted: true }
                  : { type: 'image', mediaId: asset.id, fit: 'cover' }
            },
            'Set slide background'
          )
      },
      {
        type: 'submenu',
        // Clicking adds straight to the viewed (or last edited) playlist that accepts it; hover to pick another.
        label: target ? `Add to Playlist "${target.name}"` : `Add to New ${kindLabel} Playlist…`,
        icon: <ListPlus size={14} />,
        onSelect: () => (target ? addToMediaPlaylistWithToast(target.id, ids) : void addToNewMediaPlaylist(ids, asset.kind)),
        items: [
          ...playlists.map((pl) => ({ label: pl.name, onSelect: () => addToMediaPlaylistWithToast(pl.id, ids) })),
          ...(playlists.length ? [{ type: 'separator' as const }] : []),
          { label: `New ${kindLabel} Playlist…`, icon: <ListPlus size={14} />, onSelect: () => void addToNewMediaPlaylist(ids, asset.kind) },
          ...(asset.kind !== 'audio'
            ? [{ label: 'New Background Playlist…', icon: <Wallpaper size={14} />, onSelect: () => void addToNewMediaPlaylist(ids, 'background') }]
            : [])
        ]
      },
      ...(playlist
        ? [
            {
              label: `Remove from "${playlist.name}"`,
              icon: <ListMinus size={14} />,
              onSelect: () => removeFromMediaPlaylistAction(playlist.id, ids)
            }
          ]
        : []),
      ...(others.length
        ? [
            { type: 'separator' as const },
            {
              type: 'submenu' as const,
              label: 'Add to Profile',
              icon: <CalendarPlus size={14} />,
              items: others.map((o) => ({ label: o.name, onSelect: () => sendMediaToProfile(ids, o.id, 'copy') }))
            },
            {
              type: 'submenu' as const,
              label: 'Move to Profile',
              icon: <CalendarDays size={14} />,
              items: others.map((o) => ({ label: o.name, onSelect: () => sendMediaToProfile(ids, o.id, 'move') }))
            }
          ]
        : []),
      { type: 'separator' },
      { label: 'Rename…', icon: <Pencil size={14} />, disabled: ids.length !== 1, shortcut: shortcutLabel('edit.rename'), onSelect: () => void renameMedia(asset.id) },
      { label: ids.length > 1 ? `Remove ${ids.length} Items…` : 'Remove…', icon: <Trash2 size={14} />, danger: true, shortcut: shortcutLabel('edit.delete'), onSelect: () => void deleteMedia(ids) }
    ]
    contextMenu.fromEvent(e, items)
  })

  /** Imports; while a playlist is shown, matching files are added to it too. */
  const importHere = async (paths?: string[]): Promise<void> => {
    const imported = await importMedia(paths)
    const target = playlist?.id
    const ids = imported.filter((m) => playlist && mediaPlaylistAccepts(playlist.kind, m.kind)).map((m) => m.id)
    if (target && ids.length) addToMediaPlaylistWithToast(target, ids)
  }

  const onFilesDropped = (e: React.DragEvent): void => {
    const paths = Array.from(e.dataTransfer.files)
      .map((f) => window.bhcf.media.pathForFile(f))
      .filter(Boolean)
    if (paths.length) void importHere(paths)
  }

  const filters: { key: typeof filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'image', label: 'Images' },
    { key: 'video', label: 'Videos' },
    { key: 'audio', label: 'Audio' }
  ]

  return (
    <section
      className={`media-bin${fileDrop ? ' file-drop' : ''}`}
      onPointerDown={() => setFocusZone('media')}
      onDragEnter={(e) => {
        if (!isFileDrag(e)) return
        dragDepth.current++
        setFileDrop(true)
      }}
      onDragLeave={(e) => {
        if (!isFileDrag(e)) return
        dragDepth.current = Math.max(0, dragDepth.current - 1)
        if (dragDepth.current === 0) setFileDrop(false)
      }}
      onDragOver={(e) => {
        if (isFileDrag(e)) {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
        }
      }}
      onDrop={(e) => {
        if (!isFileDrag(e)) return
        e.preventDefault()
        dragDepth.current = 0
        setFileDrop(false)
        onFilesDropped(e)
      }}
    >
      <PanelHeader title={playlist ? `Media › ${playlist.name}` : 'Media'} icon={<ImageIcon size={13} />}>
        {!playlist && (
          <div className="seg">
            {filters.map((f) => (
              <button key={f.key} className={`seg-btn${filter === f.key ? ' active' : ''}`} onClick={() => ui.set({ mediaFilter: f.key })}>
                {f.label}
              </button>
            ))}
          </div>
        )}
        <input className="input media-search" placeholder="Filter…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className="btn tpl-open" onClick={() => openTemplates('backgrounds')} title="Background videos from your backgrounds folder">
          <Sparkles size={13} /> Templates
        </button>
        <IconButton icon={<Upload size={14} />} title={`Import media… (${shortcutLabel('file.importMedia') ?? ''})`} onClick={() => void importHere()} />
      </PanelHeader>
      <div className="media-body">
        <MediaPlaylists project={project} />
        <div
          className={`media-grid${reorderBefore === END ? ' drop-end' : ''}`}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) ui.set({ selectedMediaIds: [] })
          }}
          onContextMenu={(e) =>
            contextMenu.fromEvent(e, [{ label: 'Import Media…', icon: <ImagePlus size={14} />, onSelect: () => void importHere() }, { type: 'separator' }, ...newPlaylistMenu()])
          }
          onDragOver={(e) => {
            // Empty space after the tiles = move to the end of the playlist.
            if (e.target !== e.currentTarget || !reorderIds()) return
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
            if (reorderBefore !== END) setReorderBefore(END)
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setReorderBefore(null)
          }}
          onDrop={(e) => {
            const ids = reorderIds()
            setReorderBefore(null)
            if (e.target !== e.currentTarget || !ids || !playlist) return
            e.preventDefault()
            moveInMediaPlaylistAction(playlist.id, ids, null)
            endDrag()
          }}
        >
          {assets.length === 0 ? (
            playlist ? (
              <EmptyState icon={<ListPlus size={30} strokeWidth={1.3} />} title={query ? 'No matching media' : `"${playlist.name}" is empty`}>
                <p>
                  Right-click {KIND_ITEMS[playlist.kind]} in All Media and choose Add to Playlist, drag them onto this playlist, or drop files here to
                  import and add them.
                </p>
              </EmptyState>
            ) : (
              <EmptyState icon={<FolderInput size={30} strokeWidth={1.3} />} title={profileMedia.length ? 'No matching media' : 'No media in this profile yet'}>
                <p>Drop images, videos or audio here, or click Import. Hover a video and click Background to loop it behind your lyrics — or pick one from Templates › My Backgrounds.</p>
                <button className="btn primary" onClick={() => openTemplates('backgrounds')}>
                  <Sparkles size={14} /> Background Templates
                </button>
              </EmptyState>
            )
          ) : (
            assets.map((a) => (
              <MediaTile
                key={a.id}
                asset={a}
                selected={selected.has(a.id)}
                live={liveMediaId === a.id}
                isBackground={bgMediaId === a.id}
                dropBefore={reorderBefore === a.id}
                onMouseDown={onMouseDown}
                onContext={onContext}
                onDragStart={onDragStart}
                onPlay={onPlay}
                onDragOverTile={onDragOverTile}
                onDropTile={onDropTile}
              />
            ))
          )}
        </div>
      </div>
      {fileDrop && <div className="drop-overlay">Drop to import into this project</div>}
    </section>
  )
}

