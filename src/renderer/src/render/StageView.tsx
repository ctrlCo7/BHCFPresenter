/**
 * Stage (confidence) display for performers: current and next text, clock, a selected timer,
 * speaker notes and operator messages, in high-contrast type sized to the window.
 */
import { useEffect, useState, type ReactElement } from 'react'
import { slidePlainText, type LiveState, type StageLayout } from '@shared/live'
import { formatClock, formatTimer, isTimerExpired } from '@shared/timers'
import './stage.css'

export function StageView({ live, layout }: { live: LiveState; layout: StageLayout }): ReactElement {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(t)
  }, [])

  const current = live.slide && !live.black ? slidePlainText(live.slide.slide) : ''
  const next = slidePlainText(live.next)
  const notes = live.slide?.slide.notes.trim() ?? ''
  const timer = layout.timerId ? live.timers.find((t) => t.def.id === layout.timerId) : undefined
  const message = layout.showMessage ? live.stageMessage.trim() : ''

  return (
    <div className="stage" style={{ ['--stage-scale' as string]: layout.fontScale }}>
      <header className="stage-top">
        <div className="stage-status">
          {live.black ? <span className="stage-pill black">BLACK</span> : null}
          {live.logo ? <span className="stage-pill">LOGO</span> : null}
          {live.media ? <span className="stage-pill">{live.media.playing ? '▶' : '❚❚'} {live.assets[live.media.mediaId]?.name ?? 'Media'}</span> : null}
          {live.presentationName ? (
            <span className="stage-pres">
              {live.presentationName}
              {live.slideCount > 0 ? ` · ${live.slideIndex + 1}/${live.slideCount}` : ''}
            </span>
          ) : null}
        </div>
        <div className="stage-clocks">
          {timer && (
            <span className={`stage-timer${isTimerExpired(timer, now) ? ' expired' : ''}`}>
              <small>{timer.def.name}</small>
              {formatTimer(timer, now)}
            </span>
          )}
          {layout.showClock && <span className="stage-clock">{formatClock(now)}</span>}
        </div>
      </header>

      {message && <div className="stage-message">{message}</div>}

      <main className="stage-main">
        {layout.showCurrent && <div className="stage-current">{current || <span className="stage-empty">—</span>}</div>}
        {layout.showNext && (
          <div className="stage-next">
            <div className="stage-label">Next</div>
            <div className="stage-next-text">{next || <span className="stage-empty">End</span>}</div>
          </div>
        )}
      </main>

      {layout.showNotes && notes && (
        <footer className="stage-notes">
          <div className="stage-label">Notes</div>
          {notes}
        </footer>
      )}
    </div>
  )
}
