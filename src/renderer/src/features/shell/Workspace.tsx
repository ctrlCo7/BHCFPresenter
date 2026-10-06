import { useRef, type ReactElement } from 'react'
import { ErrorBoundary } from '../../app/ErrorBoundary'
import { Splitter } from '../../components/ui/Splitter'
import { ui, useUiStore } from '../../store/uiStore'
import { LibrarySidebar } from '../library/LibrarySidebar'
import { PreviewMonitor } from '../monitor/PreviewMonitor'
import { PresentationPanel } from '../presentation/PresentationPanel'
import { BottomPanel } from './BottomPanel'

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v))

/** Show-mode layout: library | slides + tabbed bottom panel | program & preview, with resizable splitters. */
export function Workspace(): ReactElement {
  const layout = useUiStore((s) => s.layout)
  const start = useRef(layout)
  const remember = (): void => {
    start.current = ui.get().layout
  }

  return (
    <div className="workspace">
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
        {layout.bottomOpen && (
          <>
            <Splitter
              orientation="horizontal"
              onDragStart={remember}
              onDrag={(dy) => ui.setLayout({ bottomHeight: clamp(start.current.bottomHeight - dy, 140, window.innerHeight * 0.65) })}
            />
            <div className="ws-bottom" style={{ height: layout.bottomHeight }}>
              <BottomPanel />
            </div>
          </>
        )}
      </div>
      <Splitter orientation="vertical" onDragStart={remember} onDrag={(dx) => ui.setLayout({ rightWidth: clamp(start.current.rightWidth - dx, 300, 760) })} />
      <div className="ws-right" style={{ width: layout.rightWidth }}>
        <ErrorBoundary compact>
          <PreviewMonitor />
        </ErrorBoundary>
      </div>
    </div>
  )
}
