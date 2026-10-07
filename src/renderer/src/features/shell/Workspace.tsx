import { useRef, type ReactElement } from 'react'
import { ErrorBoundary } from '../../app/ErrorBoundary'
import { Splitter } from '../../components/ui/Splitter'
import { ui, useUiStore } from '../../store/uiStore'
import { LibrarySidebar } from '../library/LibrarySidebar'
import { PresentationPanel } from '../presentation/PresentationPanel'
import { BottomPanel } from './BottomPanel'
import { RightPanel } from './RightPanel'

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v))

/**
 * Show-mode layout: library | slides on top, the media / Bible panel spanning underneath both,
 * and the Program monitor with its tabs down the right — all with resizable splitters.
 */
export function Workspace(): ReactElement {
  const layout = useUiStore((s) => s.layout)
  const start = useRef(layout)
  const remember = (): void => {
    start.current = ui.get().layout
  }

  return (
    <div className="workspace">
      <div className="ws-main">
        <div className="ws-top">
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
          </div>
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
          <RightPanel />
        </ErrorBoundary>
      </div>
    </div>
  )
}
