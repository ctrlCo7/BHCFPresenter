import { BookOpen, Image as ImageIcon } from 'lucide-react'
import type { ReactElement } from 'react'
import { ErrorBoundary } from '../../app/ErrorBoundary'
import { ui, useUiStore, type BottomTab } from '../../store/uiStore'
import { BiblePanel } from '../bible/BiblePanel'
import { MediaBin } from '../media/MediaBin'

const TABS: { id: BottomTab; label: string; icon: ReactElement }[] = [
  { id: 'media', label: 'Media', icon: <ImageIcon size={13} /> },
  { id: 'bible', label: 'Bible', icon: <BookOpen size={13} /> }
]

/** Bottom area of Show mode, under the library and slides: media bin and Bible. */
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
        </ErrorBoundary>
      </div>
    </div>
  )
}
