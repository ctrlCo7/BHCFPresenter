import { MessageSquare } from 'lucide-react'
import { useState, type ReactElement } from 'react'
import type { TransitionType } from '@shared/model/types'
import { NumberField, Row, Section, Select, Slider } from '../../components/ui/fields'
import { setMasterVolume, setStageMessage, setTransitionOverride } from '../../live/liveActions'
import { useLiveStore } from '../../live/liveStore'
import { TRANSITIONS } from '../editor/BackgroundEditor'
import { OverlaysPanel } from '../overlays/OverlaysPanel'
import { TimersPanel } from '../overlays/TimersPanel'
import './live.css'

/** Live-mode control column: transition override, volume, stage message, overlays, timers. */
export function LiveControls(): ReactElement {
  const override = useLiveStore((s) => s.transitionOverride)
  const volume = useLiveStore((s) => s.masterVolume)
  const stageMessage = useLiveStore((s) => s.stageMessage)
  const [draft, setDraft] = useState('')

  const send = (): void => {
    if (!draft.trim()) return
    setStageMessage(draft.trim())
    setDraft('')
  }

  return (
    <div className="live-controls">
      <Section title="Transition">
        <Row label="Next takes">
          <Select
            value={override?.type ?? 'auto'}
            options={[{ value: 'auto', label: 'Per slide (default)' }, ...TRANSITIONS]}
            onChange={(t) =>
              setTransitionOverride(t === 'auto' ? null : { type: t as TransitionType, durationMs: override?.durationMs ?? 500, direction: override?.direction ?? 'left' })
            }
          />
        </Row>
        {override && override.type !== 'cut' && (
          <Row label="Duration">
            <NumberField value={override.durationMs} min={0} max={5000} step={50} suffix="ms" onChange={(durationMs) => setTransitionOverride({ ...override, durationMs })} />
          </Row>
        )}
      </Section>
      <Section title="Audio">
        <Row label="Master volume">
          <Slider value={volume} min={0} max={1} format={(v) => `${Math.round(v * 100)}%`} onChange={setMasterVolume} />
        </Row>
      </Section>
      <Section title="Stage message">
        <div className="stage-msg">
          <MessageSquare size={14} />
          <input
            className="input"
            placeholder="Message for the stage display…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') send()
            }}
          />
          <button className="btn" disabled={!draft.trim()} onClick={send}>
            Send
          </button>
        </div>
        {stageMessage && (
          <div className="stage-msg-current">
            <span>“{stageMessage}”</span>
            <button className="btn" onClick={() => setStageMessage('')}>
              Clear
            </button>
          </div>
        )}
      </Section>
      <Section title="Overlays">
        <OverlaysPanel compact />
      </Section>
      <Section title="Timers">
        <TimersPanel compact />
      </Section>
    </div>
  )
}
