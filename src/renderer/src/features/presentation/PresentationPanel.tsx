import {
  BookOpen,
  ClipboardPaste,
  Copy,
  CopyPlus,
  EyeOff,
  FileText,
  ImageOff,
  Music,
  Palette,
  Pencil,
  Plus,
  Tag,
  Trash2,
  Type,
  PenTool,
  Radio,
  Download,
  Palette as PaletteIcon
} from 'lucide-react'
import { memo, useMemo, useRef, useState, type ReactElement } from 'react'
import type { Background, CanvasSize, Id, MediaAsset, Presentation, Project, Slide } from '@shared/model/types'
import { useStableCallback } from '../../components/hooks'
import { EmptyState, IconButton, PanelHeader } from '../../components/ui/Panel'
import { SlideRenderer } from '../../render/SlideRenderer'
import { shortcutLabel } from '../../services/commands'
import { beginDrag, currentDrag, endDrag } from '../../services/dragState'
import { setFocusZone, useZoneHandlers } from '../../services/focusZones'
import { contextMenu, type MenuItem } from '../../store/overlayStore'
import { useProjectStore } from '../../store/projectStore'
import { ui, useUiStore } from '../../store/uiStore'
import { newPresentation, newPresentationFromText } from '../library/libraryActions'
import {
  addSlide,
  copySelectedSlides,
  deleteSelectedSlides,
  duplicateSelectedSlides,
  editSlideText,
  labelSelectedSlides,
  moveSelectedSlides,
  pasteSlides,
  patchSlides,
  selectAllSlides,
  SLIDE_COLORS
} from './slideActions'
import { take } from '../../live/liveActions'
import { useLiveStore } from '../../live/liveStore'
import { openEditor } from '../editor/editorActions'
import { editSong, newSong } from '../songs/songActions'
import { exportPresentation } from './transferActions'
import { openTemplates } from '../backgrounds/TemplatesDialog'
import './presentation.css'

const GRID_GAP = 12

export function inheritedBackground(project: Project, pres: Presentation): Background {
  return pres.background ?? project.settings.defaultBackground
}

/** First text of a slide, for accessibility labels and empty-slide hints. */
function slideText(slide: Slide): string {
  for (const el of slide.elements) if (el.type === 'text' && el.text.trim()) return el.text
  return ''
}

interface ThumbProps {
  slide: Slide
  index: number
  width: number
  selected: boolean
  drop: 'before' | 'after' | null
  mediaDrop: boolean
  live: boolean
  canvas: CanvasSize
  media: Record<Id, MediaAsset>
  bg: Background
  onPointer: (e: React.MouseEvent, slide: Slide) => void
  onTake: (slide: Slide) => void
  onContext: (e: React.MouseEvent, slide: Slide) => void
  onDragStart: (e: React.DragEvent, slide: Slide) => void
  onDragOver: (e: React.DragEvent, index: number) => void
  onDrop: (e: React.DragEvent, index: number) => void
}

const SlideThumb = memo(function SlideThumb({ slide, index, width, selected, drop, mediaDrop, live, canvas, media, bg, onPointer, onTake, onContext, onDragStart, onDragOver, onDrop }: ThumbProps): ReactElement {
  const text = slideText(slide)
  return (
    <div
      className={`thumb${selected ? ' selected' : ''}${live ? ' live' : ''}${slide.enabled ? '' : ' disabled'}${drop ? ` drop-${drop}` : ''}${mediaDrop ? ' media-drop' : ''}`}
      style={{ width, ['--slide-color' as string]: slide.color ?? 'transparent' }}
      data-slide-id={slide.id}
      draggable
      onMouseDown={(e) => onPointer(e, slide)}
      // click (not mousedown) so starting a drag to reorder never sends a slide live
      onClick={(e) => !e.shiftKey && !e.ctrlKey && !e.metaKey && e.button === 0 && onTake(slide)}
      onContextMenu={(e) => onContext(e, slide)}
      onDragStart={(e) => onDragStart(e, slide)}
      onDragEnd={endDrag}
      onDragOver={(e) => onDragOver(e, index)}
      onDrop={(e) => onDrop(e, index)}
      aria-label={`Slide ${index + 1}${slide.label ? `, ${slide.label}` : ''}${text ? `: ${text}` : ''}`}
      role="option"
      aria-selected={selected}
    >
      <div className="thumb-frame">
        <SlideRenderer slide={slide} inheritedBackground={bg} canvas={canvas} media={media} width={width - 4} mode="thumbnail" />
        {!slide.enabled && (
          <div className="thumb-disabled-badge" title="Disabled — skipped during live navigation">
            <EyeOff size={14} />
          </div>
        )}
      </div>
      <div className="thumb-footer">
        <span className="thumb-index">{index + 1}</span>
        <span className="thumb-label">{slide.label || (text ? '' : 'Empty')}</span>
      </div>
    </div>
  )
})

export function PresentationPanel(): ReactElement {
  const project = useProjectStore((s) => s.project) as Project
  const activeId = useUiStore((s) => s.activePresentationId)
  const pres = activeId ? project.presentations[activeId] : undefined

  if (!pres) {
    return (
      <section className="pres-panel">
        <PanelHeader title="Presentation" icon={<FileText size={13} />} />
        <EmptyState icon={<FileText size={40} strokeWidth={1.2} />} title="No presentation open">
          <p>Select a presentation in the library or a playlist, or create a new one.</p>
          <div className="empty-actions">
            <button className="btn primary" onClick={newPresentation}>
              <Plus size={14} /> New Presentation
            </button>
            <button className="btn" onClick={() => void newPresentationFromText()}>
              <Type size={14} /> From Text…
            </button>
            <button className="btn" onClick={() => void newSong()}>
              <Music size={14} /> New Song…
            </button>
          </div>
        </EmptyState>
      </section>
    )
  }
  return <SlideGrid key={pres.id} project={project} pres={pres} />
}

function SlideGrid({ project, pres }: { project: Project; pres: Presentation }): ReactElement {
  const selectedIds = useUiStore((s) => s.selectedSlideIds)
  const anchorId = useUiStore((s) => s.slideAnchorId)
  const thumbWidth = useUiStore((s) => s.thumbWidth)
  const selected = useMemo(() => new Set(selectedIds), [selectedIds])
  const liveSlideId = useLiveStore((s) => (s.cursor?.presentationId === pres.id ? s.cursor.slideId : null))
  const gridRef = useRef<HTMLDivElement>(null)
  const [drop, setDrop] = useState<{ index: number; side: 'before' | 'after' } | null>(null)
  const [mediaDropId, setMediaDropId] = useState<Id | null>(null)
  const bg = inheritedBackground(project, pres)
  const slides = pres.slides

  useZoneHandlers('slides', {
    delete: deleteSelectedSlides,
    duplicate: duplicateSelectedSlides,
    selectAll: selectAllSlides,
    copy: copySelectedSlides,
    paste: pasteSlides,
    rename: () => void labelSelectedSlides()
  })

  const onPointer = (e: React.MouseEvent, slide: Slide): void => {
    if (e.button !== 0 && selected.has(slide.id)) return
    setFocusZone('slides')
    gridRef.current?.focus({ preventScroll: true })
    if (e.shiftKey && anchorId) {
      const a = slides.findIndex((s) => s.id === anchorId)
      const b = slides.findIndex((s) => s.id === slide.id)
      const [from, to] = a < b ? [a, b] : [b, a]
      ui.selectSlides(slides.slice(from, to + 1).map((s) => s.id), anchorId)
    } else if (e.ctrlKey || e.metaKey) {
      ui.selectSlides(selected.has(slide.id) ? selectedIds.filter((id) => id !== slide.id) : [...selectedIds, slide.id], slide.id)
    } else if (e.button === 0 && !(selected.has(slide.id) && selectedIds.length > 1)) {
      // Keep a multi-selection on mousedown so it can be dragged; the click sends live.
      ui.selectSlides([slide.id])
    }
  }

  const contextItems = (slide: Slide): MenuItem[] => {
    const ids = selected.has(slide.id) ? selectedIds : [slide.id]
    const many = ids.length > 1
    return [
      { label: 'Send Live', icon: <Radio size={14} />, disabled: many, shortcut: 'Click', onSelect: () => take(pres.id, slide.id) },
      { label: 'Open in Slide Editor', icon: <PenTool size={14} />, disabled: many, shortcut: shortcutLabel('slides.edit'), onSelect: () => openEditor(pres.id, slide.id) },
      { label: 'Quick Edit Text…', icon: <Pencil size={14} />, disabled: many, onSelect: () => void editSlideText(slide.id) },
      { label: many ? `Label ${ids.length} Slides…` : 'Label…', icon: <Tag size={14} />, shortcut: shortcutLabel('edit.rename'), onSelect: () => void labelSelectedSlides() },
      {
        type: 'submenu',
        label: 'Color',
        icon: <Palette size={14} />,
        items: SLIDE_COLORS.map((c) => ({
          label: c.name,
          icon: <span className="color-dot" style={{ background: c.value ?? 'transparent' }} />,
          checked: ids.length === 1 && slide.color === c.value,
          onSelect: () => patchSlides(ids, { color: c.value }, 'Slide color')
        }))
      },
      {
        label: slide.enabled ? 'Disable Slide' : 'Enable Slide',
        icon: <EyeOff size={14} />,
        onSelect: () => patchSlides(ids, { enabled: !slide.enabled }, slide.enabled ? 'Disable slides' : 'Enable slides')
      },
      ...(slide.background ? [{ label: 'Clear Slide Background', icon: <ImageOff size={14} />, onSelect: () => patchSlides(ids, { background: null }, 'Clear background') }] : []),
      { type: 'separator' },
      { label: 'Copy', icon: <Copy size={14} />, shortcut: shortcutLabel('edit.copy'), onSelect: copySelectedSlides },
      { label: 'Paste After', icon: <ClipboardPaste size={14} />, shortcut: shortcutLabel('edit.paste'), onSelect: pasteSlides },
      { label: 'Duplicate', icon: <CopyPlus size={14} />, shortcut: shortcutLabel('edit.duplicate'), onSelect: duplicateSelectedSlides },
      { label: 'New Slide After', icon: <Plus size={14} />, onSelect: addSlide },
      { type: 'separator' },
      { label: many ? `Delete ${ids.length} Slides` : 'Delete Slide', icon: <Trash2 size={14} />, danger: true, shortcut: shortcutLabel('edit.delete'), onSelect: deleteSelectedSlides }
    ]
  }

  const onContext = (e: React.MouseEvent, slide: Slide): void => {
    if (!selected.has(slide.id)) ui.selectSlides([slide.id])
    contextMenu.fromEvent(e, contextItems(slide))
  }

  const onDragStart = (e: React.DragEvent, slide: Slide): void => {
    const ids = selected.has(slide.id) ? slides.filter((s) => selected.has(s.id)).map((s) => s.id) : [slide.id]
    if (!selected.has(slide.id)) ui.selectSlides([slide.id])
    beginDrag(e, { type: 'slides', presentationId: pres.id, ids }, `${ids.length} slide(s)`)
  }

  const mediaBackground = (): Background | null => {
    const payload = currentDrag()
    if (payload?.type !== 'media' || payload.ids.length !== 1) return null
    const asset = project.media[payload.ids[0] as Id]
    if (asset?.kind === 'image') return { type: 'image', mediaId: asset.id, fit: 'cover' }
    if (asset?.kind === 'video') return { type: 'video', mediaId: asset.id, fit: 'cover', loop: true, muted: true }
    return null
  }

  const onDragOver = (e: React.DragEvent, index: number): void => {
    const payload = currentDrag()
    if (payload?.type === 'slides' && payload.presentationId === pres.id) {
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = 'move'
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const side = e.clientX < r.left + r.width / 2 ? 'before' : 'after'
      if (drop?.index !== index || drop.side !== side) setDrop({ index, side })
      if (mediaDropId) setMediaDropId(null)
    } else if (mediaBackground()) {
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = 'copy'
      const id = slides[index]?.id ?? null
      if (mediaDropId !== id) setMediaDropId(id)
      if (drop) setDrop(null)
    }
  }

  const onDrop = (e: React.DragEvent, index: number): void => {
    const payload = currentDrag()
    const target = slides[index]
    setDrop(null)
    setMediaDropId(null)
    if (payload?.type === 'slides' && payload.presentationId === pres.id && drop) {
      e.preventDefault()
      e.stopPropagation()
      moveSelectedSlides(payload.ids, drop.index + (drop.side === 'after' ? 1 : 0))
    } else if (target) {
      const background = mediaBackground()
      if (!background) return
      e.preventDefault()
      e.stopPropagation()
      const ids = selected.has(target.id) ? selectedIds : [target.id]
      patchSlides(ids, { background }, 'Set slide background')
    }
    endDrag()
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (slides.length === 0) return
    const current = slides.findIndex((s) => s.id === (anchorId ?? selectedIds[selectedIds.length - 1]))
    const grid = gridRef.current
    const cols = grid ? Math.max(1, Math.floor((grid.clientWidth - GRID_GAP) / (thumbWidth + GRID_GAP))) : 1
    // Left/Right/Space are live navigation (global); Up/Down/Home/End move the selection only.
    const delta: Record<string, number> = { ArrowUp: -cols, ArrowDown: cols, Home: -Infinity, End: Infinity }
    const d = delta[e.key]
    if (d !== undefined) {
      e.preventDefault()
      const next = Math.max(0, Math.min(slides.length - 1, current < 0 ? 0 : current + d))
      const target = slides[next]
      if (target) {
        ui.selectSlides([target.id])
        grid?.querySelector(`[data-slide-id="${target.id}"]`)?.scrollIntoView({ block: 'nearest' })
      }
    } else if (e.key === 'Enter') {
      const target = slides[current]
      if (target) {
        e.preventDefault()
        take(pres.id, target.id)
      }
    }
  }

  const stable = {
    onPointer: useStableCallback(onPointer),
    onTake: useStableCallback((s: Slide) => take(pres.id, s.id)),
    onContext: useStableCallback(onContext),
    onDragStart: useStableCallback(onDragStart),
    onDragOver: useStableCallback(onDragOver),
    onDrop: useStableCallback(onDrop)
  }

  const kindIcon = pres.kind === 'song' ? <Music size={13} /> : pres.kind === 'scripture' ? <BookOpen size={13} /> : <FileText size={13} />

  return (
    <section className="pres-panel">
      <PanelHeader
        title={
          <>
            {pres.name}
            <span className="pres-count">
              {slides.length} slide{slides.length === 1 ? '' : 's'}
              {selectedIds.length > 1 ? ` · ${selectedIds.length} selected` : ''}
            </span>
          </>
        }
        icon={kindIcon}
      >
        <input
          type="range"
          className="thumb-size"
          min={120}
          max={420}
          step={10}
          value={thumbWidth}
          onChange={(e) => ui.set({ thumbWidth: Number(e.target.value) })}
          title="Thumbnail size"
          aria-label="Thumbnail size"
        />
        <IconButton icon={<Music size={14} />} title={pres.kind === 'song' ? 'Edit song lyrics' : 'Edit as song (lyrics)'} onClick={() => void editSong(pres.id)} />
        <IconButton icon={<PaletteIcon size={14} />} title="Lyric theme (text style)" onClick={() => openTemplates('themes')} />
        <IconButton icon={<PenTool size={14} />} title="Open in slide editor" onClick={() => openEditor(pres.id)} />
        <IconButton icon={<Download size={14} />} title="Export presentation (.bhcfpres)" onClick={() => void exportPresentation(pres.id)} />
        <IconButton icon={<Plus size={15} />} title="New slide" onClick={addSlide} />
      </PanelHeader>
      <div
        ref={gridRef}
        className="slide-grid"
        style={{ gap: GRID_GAP, gridTemplateColumns: `repeat(auto-fill, ${thumbWidth}px)` }}
        tabIndex={0}
        role="listbox"
        aria-multiselectable
        aria-label={`Slides of ${pres.name}`}
        onKeyDown={onKeyDown}
        onPointerDown={() => setFocusZone('slides')}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) ui.selectSlides([])
        }}
        onContextMenu={(e) =>
          contextMenu.fromEvent(e, [
            { label: 'New Slide', icon: <Plus size={14} />, onSelect: addSlide },
            { label: 'Paste', icon: <ClipboardPaste size={14} />, shortcut: shortcutLabel('edit.paste'), onSelect: pasteSlides },
            { label: 'Select All', shortcut: shortcutLabel('edit.selectAll'), onSelect: selectAllSlides }
          ])
        }
        onDragOver={(e) => {
          const payload = currentDrag()
          if (payload?.type === 'slides' && payload.presentationId === pres.id && e.target === e.currentTarget) {
            e.preventDefault()
            if (drop?.index !== slides.length - 1 || drop.side !== 'after') setDrop({ index: slides.length - 1, side: 'after' })
          }
        }}
        onDrop={(e) => {
          if (e.target === e.currentTarget) onDrop(e, slides.length - 1)
        }}
        onDragLeave={(e) => {
          if (!gridRef.current?.contains(e.relatedTarget as Node)) {
            setDrop(null)
            setMediaDropId(null)
          }
        }}
      >
        {slides.map((slide, i) => (
          <SlideThumb
            key={slide.id}
            slide={slide}
            index={i}
            width={thumbWidth}
            selected={selected.has(slide.id)}
            drop={drop?.index === i ? drop.side : null}
            mediaDrop={mediaDropId === slide.id}
            live={liveSlideId === slide.id}
            canvas={project.settings.canvas}
            media={project.media}
            bg={bg}
            onPointer={stable.onPointer}
            onTake={stable.onTake}
            onContext={stable.onContext}
            onDragStart={stable.onDragStart}
            onDragOver={stable.onDragOver}
            onDrop={stable.onDrop}
          />
        ))}
        <button className="thumb-add" style={{ width: thumbWidth, height: Math.round((thumbWidth - 4) * (project.settings.canvas.height / project.settings.canvas.width)) }} onClick={addSlide} title="Add slide">
          <Plus size={22} />
        </button>
      </div>
    </section>
  )
}
