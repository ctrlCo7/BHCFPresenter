import { Copy, Layers, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import type { ReactElement } from 'react'
import type { Project } from '@shared/model/types'
import { EmptyState, IconButton, PanelHeader } from '../../components/ui/Panel'
import { toggleOverlay } from '../../live/liveActions'
import { useLiveStore } from '../../live/liveStore'
import { SlideRenderer } from '../../render/SlideRenderer'
import { contextMenu, type MenuItem } from '../../store/overlayStore'
import { useProjectStore } from '../../store/projectStore'
import { openOverlayEditor } from '../editor/editorActions'
import { deleteOverlay, duplicateOverlay, newOverlay, renameOverlay } from './overlayActions'
import './overlays.css'

export function newOverlayMenu(anchor: HTMLElement, project: Project): void {
  const r = anchor.getBoundingClientRect()
  const timers = project.timerOrder.flatMap((id) => (project.timers[id] ? [project.timers[id]] : []))
  const items: MenuItem[] = [
    { label: 'Lower Third (speaker name)', onSelect: () => newOverlay('lower-third') },
    { label: 'Social Media Handle', onSelect: () => newOverlay('social') },
    { label: 'Announcement Banner', onSelect: () => newOverlay('announcement') },
    { label: 'Logo Bug (corner logo)', onSelect: () => newOverlay('logo') },
    {
      type: 'submenu',
      label: 'Countdown Timer',
      items: timers.length
        ? timers.map((t) => ({ label: t.name, onSelect: () => newOverlay('countdown', t.name) }))
        : [{ label: 'Create a timer first (Timers tab)', disabled: true, onSelect: () => undefined }]
    },
    { type: 'separator' },
    { label: 'Blank Overlay', onSelect: () => newOverlay('blank') }
  ]
  contextMenu.open({ x: r.left, y: r.bottom + 4, items })
}

/** Reusable overlays with live on/off toggles. */
export function OverlaysPanel({ compact = false }: { compact?: boolean }): ReactElement {
  const project = useProjectStore((s) => s.project) as Project
  const active = useLiveStore((s) => s.overlays)
  const overlays = project.overlayOrder.flatMap((id) => (project.overlays[id] ? [project.overlays[id]] : []))

  const menu = (id: string): MenuItem[] => [
    { label: 'Edit…', icon: <Pencil size={14} />, onSelect: () => openOverlayEditor(id) },
    { label: 'Rename…', onSelect: () => void renameOverlay(id) },
    { label: 'Duplicate', icon: <Copy size={14} />, onSelect: () => duplicateOverlay(id) },
    { type: 'separator' },
    { label: 'Delete', icon: <Trash2 size={14} />, danger: true, onSelect: () => void deleteOverlay(id) }
  ]

  return (
    <section className={`overlays-panel${compact ? ' compact' : ''}`}>
      {!compact && (
        <PanelHeader title="Overlays" icon={<Layers size={13} />}>
          <IconButton icon={<Plus size={15} />} title="New overlay" onClick={(e) => newOverlayMenu(e.currentTarget, project)} />
        </PanelHeader>
      )}
      <div className="overlay-list">
        {overlays.length === 0 ? (
          <EmptyState icon={compact ? undefined : <Layers size={28} strokeWidth={1.3} />} title="No overlays yet">
            <p>Logos, lower thirds and banners that sit on top of any slide. Create one with +.</p>
          </EmptyState>
        ) : (
          overlays.map((o) => {
            const on = active.includes(o.id)
            return (
              <div key={o.id} className={`overlay-item${on ? ' on' : ''}`} onContextMenu={(e) => contextMenu.fromEvent(e, menu(o.id))}>
                <button className="overlay-toggle" onClick={() => toggleOverlay(o.id)} title={on ? 'Take off air' : 'Put on air'}>
                  {!compact && (
                    <span className="overlay-thumb">
                      <SlideRenderer slide={o.slide} inheritedBackground={{ type: 'none' }} canvas={project.settings.canvas} media={project.media} width={112} mode="thumbnail" />
                    </span>
                  )}
                  <span className="overlay-name">{o.name}</span>
                  <span className="overlay-state">{on ? 'ON AIR' : 'OFF'}</span>
                </button>
                <IconButton icon={<Pencil size={13} />} title="Edit overlay" onClick={() => openOverlayEditor(o.id)} />
                <IconButton icon={<MoreHorizontal size={13} />} title="More" onClick={(e) => contextMenu.fromEvent(e, menu(o.id))} />
              </div>
            )
          })
        )}
      </div>
    </section>
  )
}
