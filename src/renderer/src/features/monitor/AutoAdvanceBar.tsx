import { Pause, Play, Repeat } from 'lucide-react'
import { useEffect, useState, type ReactElement } from 'react'
import { autoAdvanceView, toggleAutoAdvancePause } from '../../live/autoAdvance'
import { useLiveStore } from '../../live/liveStore'
import { useProjectStore } from '../../store/projectStore'

/** Countdown to the next automatic slide, with pause / resume. Hidden when nothing auto-advances. */
export function AutoAdvanceBar(): ReactElement | null {
  const state = useLiveStore((s) => s)
  const project = useProjectStore((s) => s.project)
  const [now, setNow] = useState(() => Date.now())
  const view = autoAdvanceView(state, now)
  const active = !!view
  useEffect(() => {
    if (!active) return
    const t = window.setInterval(() => setNow(Date.now()), 100)
    return () => window.clearInterval(t)
  }, [active])
  if (!view) return null
  const looping = !!(state.cursor && project?.presentations[state.cursor.presentationId]?.loop)
  const left = view.paused ? view.total : view.remaining
  return (
    <div className={`transport transport-auto${view.paused ? ' paused' : ''}`}>
      <div className="transport-title">
        {looping && <Repeat size={13} aria-label="Looping" />}
        <span className="transport-name">{view.paused ? 'Auto-advance paused' : 'Next slide in'}</span>
        <span className="transport-time">{Math.ceil(left)} s</span>
        <button className="icon-btn" title={view.paused ? 'Resume auto-advance' : 'Pause auto-advance (stay on this slide)'} onClick={toggleAutoAdvancePause}>
          {view.paused ? <Play size={14} /> : <Pause size={14} />}
        </button>
      </div>
      <div className="transport-bar" aria-hidden>
        <div className="transport-fill" style={{ width: `${view.paused ? 0 : (1 - view.remaining / view.total) * 100}%` }} />
      </div>
    </div>
  )
}
