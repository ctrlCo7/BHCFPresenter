import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  ArrowDownToLine,
  ArrowUpToLine,
  Circle,
  Copy,
  CopyCheck,
  Film,
  Image as ImageIcon,
  Layers,
  MonitorPlay,
  Plus,
  Redo2,
  Square,
  Trash2,
  Type,
  Undo2
} from 'lucide-react'
import { useMemo, useRef, type ReactElement } from 'react'
import type { Project, Slide } from '@shared/model/types'
import { EmptyState, IconButton } from '../../components/ui/Panel'
import { Splitter } from '../../components/ui/Splitter'
import { targetSlide } from '../../engine/elementOps'
import { SlideRenderer } from '../../render/SlideRenderer'
import { useZoneHandlers } from '../../services/focusZones'
import { contextMenu, type MenuItem } from '../../store/overlayStore'
import { redo, undo, useProjectStore } from '../../store/projectStore'
import { ui, useUiStore } from '../../store/uiStore'
import { importMedia } from '../media/mediaActions'
import { addSlide } from '../presentation/slideActions'
import { EditorCanvas } from './EditorCanvas'
import {
  addMediaElement,
  addShape,
  applyCurrentSlideToAll,
  addText,
  alignSelected,
  copyElements,
  deleteSelectedElements,
  distributeSelected,
  duplicateSelectedElements,
  orderSelected,
  pasteElements,
  selectAllElements
} from './editorActions'
import { ElementInspector, SlideInspector } from './Inspector'
import { LayersPanel } from './LayersPanel'
import { profileMediaRecord } from '../../engine/tree'
import './editor.css'

function mediaMenu(project: Project, kind: 'image' | 'video', anchor: HTMLElement): void {
  // Offer this profile's media.
  const assets = Object.values(profileMediaRecord(project)).filter((m) => m.kind === kind)
  const r = anchor.getBoundingClientRect()
  const items: MenuItem[] = [
    ...assets.map((a) => ({ label: a.name, onSelect: () => addMediaElement(a) })),
    ...(assets.length ? [{ type: 'separator' as const }] : []),
    {
      label: `Import ${kind === 'image' ? 'Image' : 'Video'}…`,
      onSelect: () =>
        void importMedia().then((imported) => {
          const first = imported.find((a) => a.kind === kind)
          if (first) addMediaElement(first)
        })
    }
  ]
  contextMenu.open({ x: r.left, y: r.bottom + 4, items })
}

function SlideStrip({ project, slides, activeId, onPick, isOverlay }: { project: Project; slides: { id: string; slide: Slide; label: string }[]; activeId: string; onPick: (id: string) => void; isOverlay: boolean }): ReactElement {
  return (
    <div className="edit-strip">
      {slides.map((s, i) => (
        <button key={s.id} className={`strip-item${s.id === activeId ? ' active' : ''}`} onClick={() => onPick(s.id)}>
          <span className="strip-num">{isOverlay ? '' : i + 1}</span>
          <div className={`strip-thumb${isOverlay ? ' transparent' : ''}`}>
            <SlideRenderer slide={s.slide} inheritedBackground={isOverlay ? { type: 'none' } : project.settings.defaultBackground} canvas={project.settings.canvas} media={project.media} width={150} mode="thumbnail" />
          </div>
          <span className="strip-label">{s.label}</span>
        </button>
      ))}
      {!isOverlay && (
        <button className="strip-add" onClick={addSlide} title="Add slide">
          <Plus size={16} /> Slide
        </button>
      )}
    </div>
  )
}

export function EditWorkspace(): ReactElement {
  const project = useProjectStore((s) => s.project) as Project
  const canUndo = useProjectStore((s) => s.past.length > 0)
  const canRedo = useProjectStore((s) => s.future.length > 0)
  const target = useUiStore((s) => s.editTarget)
  const selectedIds = useUiStore((s) => s.selectedElementIds)
  const rightWidth = useUiStore((s) => s.layout.rightWidth)
  const start = useRef(rightWidth)
  const slide = targetSlide(project, target)

  useZoneHandlers('editor', {
    delete: deleteSelectedElements,
    duplicate: duplicateSelectedElements,
    copy: copyElements,
    paste: pasteElements,
    selectAll: selectAllElements
  })

  const strip = useMemo(() => {
    if (!target) return []
    if (target.kind === 'overlay') return project.overlayOrder.flatMap((id) => (project.overlays[id] ? [{ id, slide: project.overlays[id].slide, label: project.overlays[id].name }] : []))
    const pres = project.presentations[target.presentationId]
    return pres ? pres.slides.map((s, i) => ({ id: s.id, slide: s, label: s.label || `Slide ${i + 1}` })) : []
  }, [project, target])

  if (!target || !slide) {
    return (
      <div className="edit-empty">
        <EmptyState icon={<Layers size={40} strokeWidth={1.2} />} title="Nothing to edit">
          <p>Open a presentation in Show mode and double-click a slide, or edit an overlay from the Overlays panel.</p>
          <button className="btn primary" onClick={() => ui.set({ mode: 'show' })}>
            Back to Show
          </button>
        </EmptyState>
      </div>
    )
  }

  const pres = target.kind === 'slide' ? project.presentations[target.presentationId] : undefined
  const background = target.kind === 'overlay' ? null : (slide.background ?? pres?.background ?? project.settings.defaultBackground)
  const selectedEls = slide.elements.filter((e) => selectedIds.includes(e.id))
  const has = selectedIds.length > 0

  const pick = (id: string): void => {
    if (target.kind === 'overlay') ui.edit({ kind: 'overlay', overlayId: id })
    else {
      ui.edit({ kind: 'slide', presentationId: target.presentationId, slideId: id })
      ui.selectSlides([id])
    }
  }

  return (
    <div className="edit-ws">
      <SlideStrip project={project} slides={strip} activeId={target.kind === 'overlay' ? target.overlayId : target.slideId} onPick={pick} isOverlay={target.kind === 'overlay'} />

      <div className="edit-center">
        <div className="edit-toolbar" role="toolbar" aria-label="Editor tools">
          <span className="edit-title">{target.kind === 'overlay' ? `Overlay · ${project.overlays[target.overlayId]?.name ?? ''}` : (pres?.name ?? '')}</span>
          <div className="tb-group">
            <button className="btn ghost" onClick={addText} title="Add text box">
              <Type size={14} /> Text
            </button>
            <IconButton icon={<Square size={14} />} title="Add rectangle" onClick={() => addShape('rectangle')} />
            <IconButton icon={<Circle size={14} />} title="Add ellipse" onClick={() => addShape('ellipse')} />
            <IconButton icon={<ImageIcon size={14} />} title="Add image" onClick={(e) => mediaMenu(project, 'image', e.currentTarget)} />
            <IconButton icon={<Film size={14} />} title="Add video" onClick={(e) => mediaMenu(project, 'video', e.currentTarget)} />
          </div>
          <div className="tb-group">
            <IconButton icon={<AlignStartVertical size={14} />} title="Align left" disabled={!has} onClick={() => alignSelected('left')} />
            <IconButton icon={<AlignCenterVertical size={14} />} title="Align centre" disabled={!has} onClick={() => alignSelected('hcenter')} />
            <IconButton icon={<AlignEndVertical size={14} />} title="Align right" disabled={!has} onClick={() => alignSelected('right')} />
            <IconButton icon={<AlignStartHorizontal size={14} />} title="Align top" disabled={!has} onClick={() => alignSelected('top')} />
            <IconButton icon={<AlignCenterHorizontal size={14} />} title="Align middle" disabled={!has} onClick={() => alignSelected('vcenter')} />
            <IconButton icon={<AlignEndHorizontal size={14} />} title="Align bottom" disabled={!has} onClick={() => alignSelected('bottom')} />
            <IconButton icon={<AlignHorizontalDistributeCenter size={14} />} title="Distribute horizontally (3+)" disabled={selectedIds.length < 3} onClick={() => distributeSelected('h')} />
            <IconButton icon={<AlignVerticalDistributeCenter size={14} />} title="Distribute vertically (3+)" disabled={selectedIds.length < 3} onClick={() => distributeSelected('v')} />
          </div>
          <div className="tb-group">
            <IconButton icon={<ArrowUpToLine size={14} />} title="Bring to front (right-click for more)" disabled={!has} onClick={() => orderSelected('front')} />
            <IconButton icon={<ArrowDownToLine size={14} />} title="Send to back" disabled={!has} onClick={() => orderSelected('back')} />
            <IconButton icon={<Copy size={14} />} title="Duplicate" disabled={!has} onClick={duplicateSelectedElements} />
            <IconButton icon={<Trash2 size={14} />} title="Delete" disabled={!has} onClick={deleteSelectedElements} />
          </div>
          <div className="tb-group">
            <IconButton icon={<Undo2 size={14} />} title="Undo" disabled={!canUndo} onClick={() => undo()} />
            <IconButton icon={<Redo2 size={14} />} title="Redo" disabled={!canRedo} onClick={() => redo()} />
          </div>
          <span className="tb-spacer" />
          {target.kind === 'slide' && (pres?.slides.length ?? 0) > 1 && (
            <button className="btn" onClick={() => void applyCurrentSlideToAll()} title="Copy this slide's text style, background, shapes and transition to other slides (each keeps its own words)">
              <CopyCheck size={14} /> Apply to All Slides
            </button>
          )}
          <button className="btn primary" onClick={() => ui.set({ mode: 'show' })}>
            <MonitorPlay size={14} /> Done
          </button>
        </div>
        <div
          className="edit-canvas-wrap"
          onContextMenu={(e) => {
            if (!has) return
            contextMenu.fromEvent(e, [
              { label: 'Bring to Front', onSelect: () => orderSelected('front') },
              { label: 'Bring Forward', onSelect: () => orderSelected('forward') },
              { label: 'Send Backward', onSelect: () => orderSelected('backward') },
              { label: 'Send to Back', onSelect: () => orderSelected('back') },
              { type: 'separator' },
              { label: 'Copy', onSelect: copyElements },
              { label: 'Paste', onSelect: pasteElements },
              { label: 'Duplicate', onSelect: duplicateSelectedElements },
              { type: 'separator' },
              { label: 'Delete', danger: true, onSelect: deleteSelectedElements }
            ])
          }}
        >
          <EditorCanvas slide={slide} background={background} canvas={project.settings.canvas} media={project.media} transparent={target.kind === 'overlay'} />
        </div>
      </div>

      <Splitter orientation="vertical" onDragStart={() => (start.current = ui.get().layout.rightWidth)} onDrag={(dx) => ui.setLayout({ rightWidth: Math.min(640, Math.max(300, start.current - dx)) })} />
      <aside className="edit-side" style={{ width: rightWidth }}>
        <div className="inspector">
          {selectedEls.length > 0 ? <ElementInspector key={selectedEls.map((e) => e.id).join(',')} elements={selectedEls} media={profileMediaRecord(project)} /> : <SlideInspector project={project} target={target} slide={slide} />}
        </div>
        <LayersPanel slide={slide} />
      </aside>
    </div>
  )
}
