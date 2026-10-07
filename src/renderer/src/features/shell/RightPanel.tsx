import { Layers, MonitorPlay, Timer } from 'lucide-react'
import type { ReactElement } from 'react'
import { ErrorBoundary } from '../../app/ErrorBoundary'
import { ui, useUiStore, type RightTab } from '../../store/uiStore'
import { ProgramMonitor, SlidePreview } from '../monitor/PreviewMonitor'
import { OverlaysPanel } from '../overlays/OverlaysPanel'
import { TimersPanel } from '../overlays/TimersPanel'

const TABS: { id: RightTab; label: string; icon: ReactElement }[] = [
  { id: 'preview', label: 'Preview & Notes', icon: <MonitorPlay size={16} /> },
  { id: 'overlays', label: 'Overlays', icon: <Layers size={16} /> },
  { id: 'timers', label: 'Timers', icon: <Timer size={16} /> }
]

/** Right column of Show mode: the Program monitor, then an icon tab strip over preview, overlays and timers. */
export function RightPanel(): ReactElement {
  const tab = useUiStore((s) => s.rightTab)
  return (
    <aside className="monitor right-panel">
      <ProgramMonitor />
      <div className="right-tabs" role="tablist" aria-label="Panels">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} aria-label={t.label} title={t.label} className={tab === t.id ? 'active' : ''} onClick={() => ui.set({ rightTab: t.id })}>
            {t.icon}
          </button>
        ))}
      </div>
      <div className="right-content">
        <ErrorBoundary compact key={tab}>
          {tab === 'preview' && <SlidePreview />}
          {tab === 'overlays' && <OverlaysPanel />}
          {tab === 'timers' && <TimersPanel />}
        </ErrorBoundary>
      </div>
    </aside>
  )
}
