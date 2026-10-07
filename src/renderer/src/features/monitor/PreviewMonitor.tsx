/**
 * Right-hand monitor column: the Program monitor (exactly what the audience sees, rendered
 * from the same LiveState as the outputs), live buttons, media transport, and a Preview of
 * the selected slide with next slide and notes.
 */
import { Eraser, Image as ImageIcon, MonitorOff, MonitorPlay, MonitorUp, Moon, StickyNote, XCircle } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type ReactElement } from 'react'
import type { Project } from '@shared/model/types'
import { EmptyState, PanelHeader } from '../../components/ui/Panel'
import { clearAll, clearSlide, toggleBlack, toggleLogo, toggleOutputs } from '../../live/liveActions'
import { useLiveStore } from '../../live/liveStore'
import { useLiveView } from '../../live/livePublisher'
import { ProgramRenderer } from '../../render/ProgramRenderer'
import { SlideRenderer } from '../../render/SlideRenderer'
import { shortcutLabel } from '../../services/commands'
import { useProjectStore } from '../../store/projectStore'
import { useUiStore } from '../../store/uiStore'
import { inheritedBackground } from '../presentation/PresentationPanel'
import { patchSlides } from '../presentation/slideActions'
import { MediaTransport } from './MediaTransport'
import './monitor.css'

export function useElementWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry?.contentRect.width ?? 0)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width]
}

function NotesEditor({ slideId, notes }: { slideId: string; notes: string }): ReactElement {
  const [value, setValue] = useState(notes)
  useEffect(() => setValue(notes), [notes, slideId])
  const commit = (): void => {
    if (value !== notes) patchSlides([slideId], { notes: value }, 'Edit notes')
  }
  return <textarea className="input notes-input" placeholder="Speaker / stage notes for this slide…" value={value} onChange={(e) => setValue(e.target.value)} onBlur={commit} />
}

function LiveButton({ active, danger, onClick, icon, label, shortcut }: { active?: boolean; danger?: boolean; onClick: () => void; icon: ReactElement; label: string; shortcut?: string }): ReactElement {
  return (
    <button className={`live-btn${active ? ' active' : ''}${danger ? ' danger' : ''}`} onClick={onClick} title={shortcut ? `${label} (${shortcut})` : label}>
      {icon}
      <span>{label}</span>
      {shortcut && <kbd>{shortcut}</kbd>}
    </button>
  )
}

/** The Program monitor with status and live buttons. */
export function ProgramMonitor({ compact = false }: { compact?: boolean }): ReactElement {
  const view = useLiveView((s) => s.state)
  const black = useLiveStore((s) => s.black)
  const logo = useLiveStore((s) => s.logo)
  const cursor = useLiveStore((s) => s.cursor)
  const outputsActive = useLiveStore((s) => s.outputsActive)
  const outputs = useLiveStore((s) => s.outputs)
  const [frameRef, width] = useElementWidth<HTMLDivElement>()
  const aspect = view.canvas.height / view.canvas.width
  const onAir = !!(view.slide || view.media || view.backgroundMedia || view.background || view.overlays.length || view.logo) && !black
  const openOutputs = outputs.filter((o) => o.open)

  return (
    <div className="program">
      <PanelHeader title="Program" icon={<MonitorPlay size={13} />}>
        <span className={`onair${onAir ? ' on' : ''}${black ? ' black' : ''}`}>{black ? 'BLACK' : onAir ? 'LIVE' : 'CLEAR'}</span>
      </PanelHeader>
      <div className="program-body">
        <div ref={frameRef} className="monitor-frame program-frame" style={{ height: width ? Math.round(width * aspect) : undefined }}>
          {width > 0 && <ProgramRenderer live={view} width={width} height={Math.round(width * aspect)} audio={view.audioTarget === 'operator'} />}
        </div>
        <div className="program-status">
          {view.slide && cursor ? (
            <span>
              <b>{view.presentationName}</b> · {view.slideIndex + 1}/{view.slideCount}
            </span>
          ) : (
            <span className="muted">{view.media ? 'Media cue' : 'No slide on screen'}</span>
          )}
          <span className="muted">{openOutputs.length ? openOutputs.map((o) => `${o.name} → ${o.displayLabel}`).join(' · ') : 'Outputs off'}</span>
        </div>
        <div className={`live-btns${compact ? ' compact' : ''}`}>
          <LiveButton icon={<Eraser size={15} />} label="Clear" shortcut={shortcutLabel('live.clear')} onClick={clearSlide} />
          <LiveButton icon={<Moon size={15} />} label="Black" active={black} danger shortcut={shortcutLabel('live.black')} onClick={toggleBlack} />
          <LiveButton icon={<ImageIcon size={15} />} label="Logo" active={logo} shortcut={shortcutLabel('live.logo')} onClick={toggleLogo} />
          <LiveButton icon={<XCircle size={15} />} label="Clear All" shortcut={shortcutLabel('live.clearAll')} onClick={clearAll} />
          <LiveButton
            icon={outputsActive ? <MonitorUp size={15} /> : <MonitorOff size={15} />}
            label={outputsActive ? 'Outputs On' : 'Outputs Off'}
            active={outputsActive}
            shortcut={shortcutLabel('live.outputs')}
            onClick={toggleOutputs}
          />
        </div>
        <MediaTransport />
      </div>
    </div>
  )
}

/** Preview of the selected slide (not live) with next slide and notes. */
export function SlidePreview(): ReactElement {
  const project = useProjectStore((s) => s.project) as Project
  const activeId = useUiStore((s) => s.activePresentationId)
  const selectedIds = useUiStore((s) => s.selectedSlideIds)
  const [frameRef, width] = useElementWidth<HTMLDivElement>()

  const pres = activeId ? project.presentations[activeId] : undefined
  const focusId = selectedIds[selectedIds.length - 1]
  const index = pres ? pres.slides.findIndex((s) => s.id === focusId) : -1
  const slide = pres && index >= 0 ? pres.slides[index] : undefined
  const next = pres && index >= 0 ? pres.slides.slice(index + 1).find((s) => s.enabled) : undefined
  const bg = pres ? inheritedBackground(project, pres) : project.settings.defaultBackground
  const aspect = project.settings.canvas.height / project.settings.canvas.width

  return (
    <div className="preview">
      <PanelHeader title="Preview" icon={<MonitorPlay size={13} />}>
        {slide && pres && (
          <span className="monitor-pos">
            {index + 1} / {pres.slides.length}
          </span>
        )}
      </PanelHeader>
      <div className="monitor-body">
        <div ref={frameRef} className="monitor-frame" style={{ height: width ? Math.round(width * aspect) : undefined }}>
          {slide && width > 0 ? (
            <SlideRenderer slide={slide} inheritedBackground={bg} canvas={project.settings.canvas} media={project.media} width={width} mode="preview" />
          ) : (
            <div className="monitor-blank">{pres ? 'Select a slide' : 'Nothing selected'}</div>
          )}
        </div>
        {slide && pres ? (
          <>
            <div className="monitor-next">
              <div className="monitor-subtitle">Next</div>
              <div className="monitor-next-row">
                <div className="monitor-next-frame">
                  {next ? (
                    <SlideRenderer slide={next} inheritedBackground={bg} canvas={project.settings.canvas} media={project.media} width={120} mode="thumbnail" />
                  ) : (
                    <div className="monitor-blank small">End</div>
                  )}
                </div>
                <div className="monitor-next-text">{next ? next.elements.map((e) => (e.type === 'text' ? e.text : '')).join(' ').trim() || next.label || '—' : 'Last slide'}</div>
              </div>
            </div>
            <div className="monitor-notes">
              <div className="monitor-subtitle">
                <StickyNote size={12} /> Notes
              </div>
              <NotesEditor key={slide.id} slideId={slide.id} notes={slide.notes} />
            </div>
          </>
        ) : (
          <EmptyState title="Preview">
            <p>Click a slide to send it live. The selected slide is previewed here.</p>
          </EmptyState>
        )}
      </div>
    </div>
  )
}
