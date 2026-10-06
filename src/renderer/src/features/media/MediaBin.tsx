import { BadgeCheck, Sparkles, Clapperboard, Film, FolderInput, Image as ImageIcon, ImagePlus, ListPlus, Music, Pencil, Play, Trash2, Upload, Wallpaper } from 'lucide-react'
import { memo, useMemo, useRef, useState, type ReactElement } from 'react'
import { mediaUrl, thumbnailUrl } from '@shared/media'
import type { MediaAsset, Project } from '@shared/model/types'
import { useStableCallback } from '../../components/hooks'
import { EmptyState, IconButton, PanelHeader } from '../../components/ui/Panel'
import { fold } from '../../engine/search'
import { shortcutLabel } from '../../services/commands'
import { beginDrag, endDrag, isFileDrag } from '../../services/dragState'
import { setFocusZone, useZoneHandlers } from '../../services/focusZones'
import { contextMenu, type MenuItem } from '../../store/overlayStore'
import { useProjectStore } from '../../store/projectStore'
import { ui, useUiStore } from '../../store/uiStore'
import { addToPlaylist } from '../library/libraryActions'
import { openTemplates } from '../backgrounds/TemplatesDialog'
import { patchSlides } from '../presentation/slideActions'
import { playBackground, playMedia } from '../../live/liveActions'
import { useLiveStore } from '../../live/liveStore'
import { deleteMedia, formatBytes, formatDuration, importMedia, renameMedia, setAsLogo } from './mediaActions'
import './media.css'

const KIND_ICON = { image: ImageIcon, video: Film, audio: Music } as const

const MediaTile = memo(function MediaTile({
  asset,
  selected,
  live,
  isBackground,
  onMouseDown,
  onContext,
  onDragStart
}: {
  asset: MediaAsset
  selected: boolean
  live: boolean
  isBackground: boolean
  onMouseDown: (e: React.MouseEvent, asset: MediaAsset) => void
  onContext: (e: React.MouseEvent, asset: MediaAsset) => void
  onDragStart: (e: React.DragEvent, asset: MediaAsset) => void
}): ReactElement {
  const Icon = KIND_ICON[asset.kind]
  const meta = [asset.width && asset.height ? `${asset.width}×${asset.height}` : null, formatDuration(asset.durationSec) || null, formatBytes(asset.sizeBytes)]
    .filter(Boolean)
    .join(' · ')
  return (
    <div
      className={`media-tile${selected ? ' selected' : ''}${live ? ' live' : ''}`}
      onDoubleClick={() => playMedia(asset.id)}
      draggable
      onMouseDown={(e) => onMouseDown(e, asset)}
      onContextMenu={(e) => onContext(e, asset)}
      onDragStart={(e) => onDragStart(e, asset)}
      onDragEnd={endDrag}
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
        <button className="media-action" title={asset.kind === 'audio' ? 'Play audio' : 'Play full screen'} onClick={() => playMedia(asset.id)}>
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
  const [query, setQuery] = useState('')
  const [fileDrop, setFileDrop] = useState(false)
  const dragDepth = useRef(0)
  const selected = useMemo(() => new Set(selectedIds), [selectedIds])

  const assets = useMemo(() => {
    const q = fold(query.trim())
    return Object.values(project.media)
      .filter((m) => (filter === 'all' || m.kind === filter) && (!q || fold(m.name).includes(q)))
      .sort((a, b) => b.importedAt.localeCompare(a.importedAt) || a.name.localeCompare(b.name))
  }, [project.media, filter, query])

  useZoneHandlers('media', {
    delete: () => void deleteMedia(selectedIds),
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
    const playlists = Object.values(project.playlists)
    const canBg = ids.length === 1 && asset.kind !== 'audio' && !!activePresentationId && selectedSlideIds.length > 0
    const items: MenuItem[] = [
      { label: asset.kind === 'audio' ? 'Play Audio' : 'Play Full Screen', icon: <Play size={14} />, shortcut: 'Double-click', onSelect: () => playMedia(asset.id) },
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
        label: 'Add to Playlist',
        icon: <ListPlus size={14} />,
        items: playlists.length
          ? playlists.map((pl) => ({ label: pl.name, onSelect: () => addToPlaylist(pl.id, ids.map((mediaId) => ({ kind: 'media', mediaId }))) }))
          : [{ label: 'No playlists yet', disabled: true, onSelect: () => undefined }]
      },
      { type: 'separator' },
      { label: 'Rename…', icon: <Pencil size={14} />, disabled: ids.length !== 1, shortcut: shortcutLabel('edit.rename'), onSelect: () => void renameMedia(asset.id) },
      { label: ids.length > 1 ? `Remove ${ids.length} Items…` : 'Remove…', icon: <Trash2 size={14} />, danger: true, shortcut: shortcutLabel('edit.delete'), onSelect: () => void deleteMedia(ids) }
    ]
    contextMenu.fromEvent(e, items)
  })

  const onFilesDropped = (e: React.DragEvent): void => {
    const paths = Array.from(e.dataTransfer.files)
      .map((f) => window.bhcf.media.pathForFile(f))
      .filter(Boolean)
    if (paths.length) void importMedia(paths)
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
      <PanelHeader title="Media" icon={<ImageIcon size={13} />}>
        <div className="seg">
          {filters.map((f) => (
            <button key={f.key} className={`seg-btn${filter === f.key ? ' active' : ''}`} onClick={() => ui.set({ mediaFilter: f.key })}>
              {f.label}
            </button>
          ))}
        </div>
        <input className="input media-search" placeholder="Filter…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className="btn tpl-open" onClick={() => openTemplates('backgrounds')} title="Free motion backgrounds made by the app">
          <Sparkles size={13} /> Templates
        </button>
        <IconButton icon={<Upload size={14} />} title={`Import media… (${shortcutLabel('file.importMedia') ?? ''})`} onClick={() => void importMedia()} />
      </PanelHeader>
      <div
        className="media-grid"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) ui.set({ selectedMediaIds: [] })
        }}
        onContextMenu={(e) => contextMenu.fromEvent(e, [{ label: 'Import Media…', icon: <ImagePlus size={14} />, onSelect: () => void importMedia() }])}
      >
        {assets.length === 0 ? (
          <EmptyState icon={<FolderInput size={30} strokeWidth={1.3} />} title={Object.keys(project.media).length ? 'No matching media' : 'No media yet'}>
            <p>Drop images, videos or audio here, or click Import. Hover a video and click Background to loop it behind your lyrics — or get free motion backgrounds from Templates.</p>
            <button className="btn primary" onClick={() => openTemplates('backgrounds')}>
              <Sparkles size={14} /> Background Templates
            </button>
          </EmptyState>
        ) : (
          assets.map((a) => <MediaTile key={a.id} asset={a} selected={selected.has(a.id)} live={liveMediaId === a.id} isBackground={bgMediaId === a.id} onMouseDown={onMouseDown} onContext={onContext} onDragStart={onDragStart} />)
        )}
      </div>
      {fileDrop && <div className="drop-overlay">Drop to import into this project</div>}
    </section>
  )
}

