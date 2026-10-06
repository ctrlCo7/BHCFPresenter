import { BookOpen, Image as ImageIcon, Layers, Timer } from 'lucide-react'
import type { ReactElement } from 'react'
import { ErrorBoundary } from '../../app/ErrorBoundary'
import { ui, useUiStore, type BottomTab } from '../../store/uiStore'
import { BiblePanel } from '../bible/BiblePanel'
import { MediaBin } from '../media/MediaBin'
import { OverlaysPanel } from '../overlays/OverlaysPanel'
import { TimersPanel } from '../overlays/TimersPanel'

const TABS: { id: BottomTab; label: string; icon: ReactElement }[] = [
  { id: 'media', label: 'Media', icon: <ImageIcon size={13} /> },
  { id: 'bible', label: 'Bible', icon: <BookOpen size={13} /> },
  { id: 'overlays', label: 'Overlays', icon: <Layers size={13} /> },
  { id: 'timers', label: 'Timers', icon: <Timer size={13} /> }
]

/** Tabbed bottom area of Show mode: media bin, Bible, overlays and timers. */
export function BottomPanel(): ReactElement {
  const tab = useUiStore((s) => s.bottomTab)
  return (
    <div className="bottom-panel">
      <div className="bottom-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'active' : ''} onClick={() => ui.set({ bottomTab: t.id })}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>
      <div className="bottom-content">
        <ErrorBoundary compact key={tab}>
          {tab === 'media' && <MediaBin />}
          {tab === 'bible' && <BiblePanel />}
          {tab === 'overlays' && <OverlaysPanel />}
          {tab === 'timers' && <TimersPanel />}
        </ErrorBoundary>
      </div>
    </div>
  )
}
