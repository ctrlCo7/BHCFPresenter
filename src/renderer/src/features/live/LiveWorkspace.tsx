import { useRef, type ReactElement } from 'react'
import { ErrorBoundary } from '../../app/ErrorBoundary'
import { Splitter } from '../../components/ui/Splitter'
import { ui, useUiStore } from '../../store/uiStore'
import { LibrarySidebar } from '../library/LibrarySidebar'
import { ProgramMonitor, SlidePreview } from '../monitor/PreviewMonitor'
import { PresentationPanel } from '../presentation/PresentationPanel'
import { LiveControls } from './LiveControls'
import './live.css'

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v))

/**
 * Dedicated operator view: playlist + slides on the left/centre, a large Program monitor with
 * live buttons and transport, and the live controls (transitions, overlays, timers, stage).
 */
export function LiveWorkspace(): ReactElement {
  const layout = useUiStore((s) => s.layout)
  const start = useRef(layout)
  const remember = (): void => {
    start.current = ui.get().layout
  }
  const rightWidth = Math.max(layout.rightWidth, 460)
  return (
    <div className="workspace live-ws">
      <div className="ws-left" style={{ width: layout.leftWidth }}>
        <ErrorBoundary compact>
          <LibrarySidebar />
        </ErrorBoundary>
      </div>
      <Splitter orientation="vertical" onDragStart={remember} onDrag={(dx) => ui.setLayout({ leftWidth: clamp(start.current.leftWidth + dx, 200, 520) })} />
      <div className="ws-center">
        <div className="ws-center-main">
          <ErrorBoundary compact>
            <PresentationPanel />
          </ErrorBoundary>
        </div>
        <div className="live-preview-strip">
          <SlidePreview />
        </div>
      </div>
      <Splitter orientation="vertical" onDragStart={remember} onDrag={(dx) => ui.setLayout({ rightWidth: clamp(Math.max(start.current.rightWidth, 460) - dx, 380, 900) })} />
      <aside className="ws-right live-right" style={{ width: rightWidth }}>
        <ErrorBoundary compact>
          <ProgramMonitor />
          <LiveControls />
        </ErrorBoundary>
      </aside>
    </div>
  )
}
