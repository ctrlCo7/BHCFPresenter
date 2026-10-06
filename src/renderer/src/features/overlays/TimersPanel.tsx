import { MonitorUp, Pause, Pencil, Play, Plus, RotateCcw, Timer, Trash2 } from 'lucide-react'
import { createElement, useEffect, useState, type ReactElement } from 'react'
import type { Id, Project, TimerDef, TimerKind } from '@shared/model/types'
import { formatTimer, idleRuntime, isTimerExpired } from '@shared/timers'
import { EmptyState, IconButton, PanelHeader } from '../../components/ui/Panel'
import { NumberField, Row, Select, Toggle } from '../../components/ui/fields'
import { timerReset, timerToggle } from '../../live/liveActions'
import { useLiveStore } from '../../live/liveStore'
import { contextMenu, dialogs } from '../../store/overlayStore'
import { useProjectStore } from '../../store/projectStore'
import { deleteTimer, newTimer, showTimerOverlay, updateTimer } from './overlayActions'
import './overlays.css'

const KINDS: { value: TimerKind; label: string }[] = [
  { value: 'countdown', label: 'Countdown' },
  { value: 'countup', label: 'Count up (stopwatch)' },
  { value: 'countdown-to-time', label: 'Count down to a time' },
  { value: 'clock', label: 'Clock' }
]

function TimerForm({ timer, onClose }: { timer: TimerDef; onClose: (v: Partial<TimerDef> | null) => void }): ReactElement {
  const [t, setT] = useState(timer)
  const minutes = Math.floor(t.durationSec / 60)
  const seconds = t.durationSec % 60
  return (
    <div className="modal-body">
      <Row label="Name">
        <input className="input" value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} autoFocus />
      </Row>
      <Row label="Type">
        <Select value={t.kind} options={KINDS} onChange={(kind) => setT({ ...t, kind })} />
      </Row>
      {t.kind === 'countdown' && (
        <Row label="Duration">
          <NumberField value={minutes} min={0} max={1440} suffix="min" onChange={(m) => setT({ ...t, durationSec: m * 60 + seconds })} />
          <NumberField value={seconds} min={0} max={59} suffix="s" onChange={(s) => setT({ ...t, durationSec: minutes * 60 + s })} />
        </Row>
      )}
      {t.kind === 'countdown-to-time' && (
        <Row label="Target time">
          <input className="input" type="time" value={t.targetTime.padStart(5, '0')} onChange={(e) => setT({ ...t, targetTime: e.target.value || '10:00' })} />
        </Row>
      )}
      {(t.kind === 'countdown' || t.kind === 'countdown-to-time') && (
        <Row label="Overrun">
          <Toggle checked={t.allowOverrun} label="Keep counting below zero (-0:12)" onChange={(allowOverrun) => setT({ ...t, allowOverrun })} />
        </Row>
      )}
      <p className="muted">
        Show this timer in any text box with <code>{`{timer:${t.name || 'Name'}}`}</code>, on the stage display, or with the screen button.
      </p>
      <div className="modal-footer">
        <button className="btn" onClick={() => onClose(null)}>
          Cancel
        </button>
        <button className="btn primary" disabled={!t.name.trim()} onClick={() => onClose({ name: t.name.trim(), kind: t.kind, durationSec: t.durationSec, targetTime: t.targetTime, allowOverrun: t.allowOverrun })}>
          Save
        </button>
      </div>
    </div>
  )
}

export async function editTimer(id: Id): Promise<void> {
  const timer = useProjectStore.getState().project?.timers[id]
  if (!timer) return
  const patch = await dialogs.custom<Partial<TimerDef>>({ title: 'Timer', width: 460, render: (close) => createElement(TimerForm, { timer, onClose: close }) })
  if (patch) updateTimer(id, patch)
}

export function TimersPanel({ compact = false }: { compact?: boolean }): ReactElement {
  const project = useProjectStore((s) => s.project) as Project
  const runtimes = useLiveStore((s) => s.timers)
  const overlaysOn = useLiveStore((s) => s.overlays)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(t)
  }, [])
  const timers = project.timerOrder.flatMap((id) => (project.timers[id] ? [project.timers[id]] : []))

  const addMenu = (e: React.MouseEvent<HTMLElement>): void => {
    const r = e.currentTarget.getBoundingClientRect()
    contextMenu.open({
      x: r.left,
      y: r.bottom + 4,
      items: KINDS.map((k) => ({ label: k.label, onSelect: () => void editTimer(newTimer(k.value)) }))
    })
  }

  return (
    <section className={`timers-panel${compact ? ' compact' : ''}`}>
      {!compact && (
        <PanelHeader title="Timers" icon={<Timer size={13} />}>
          <IconButton icon={<Plus size={15} />} title="New timer" onClick={addMenu} />
        </PanelHeader>
      )}
      <div className="timer-list">
        {timers.length === 0 ? (
          <EmptyState icon={compact ? undefined : <Timer size={28} strokeWidth={1.3} />} title="No timers yet">
            <p>Countdowns, stopwatches and clocks for the screen or stage.</p>
            {compact && (
              <button className="btn" onClick={addMenu}>
                <Plus size={14} /> New timer
              </button>
            )}
          </EmptyState>
        ) : (
          timers.map((t) => {
            const runtime = runtimes[t.id] ?? idleRuntime()
            const view = { def: t, runtime }
            const expired = isTimerExpired(view, now)
            const runnable = t.kind === 'countdown' || t.kind === 'countup'
            const onScreen = project.overlayOrder.some(
              (oid) => overlaysOn.includes(oid) && project.overlays[oid]?.slide.elements.some((e) => e.type === 'text' && e.text.toLowerCase().includes(`{timer:${t.name}}`.toLowerCase()))
            )
            return (
              <div key={t.id} className={`timer-row${runtime.running ? ' running' : ''}${expired ? ' expired' : ''}`}>
                <div className="timer-info">
                  <span className="timer-name">{t.name}</span>
                  <span className="timer-kind">{KINDS.find((k) => k.value === t.kind)?.label}</span>
                </div>
                <span className="timer-value">{formatTimer(view, now)}</span>
                {runnable && <IconButton icon={runtime.running ? <Pause size={14} /> : <Play size={14} />} title={runtime.running ? 'Pause' : 'Start'} onClick={() => timerToggle(t.id)} />}
                {runnable && <IconButton icon={<RotateCcw size={14} />} title="Reset" onClick={() => timerReset(t.id)} />}
                <IconButton icon={<MonitorUp size={14} />} title={onScreen ? 'Hide from screen' : 'Show on screen'} active={onScreen} onClick={() => showTimerOverlay(t.id)} />
                {!compact && <IconButton icon={<Pencil size={14} />} title="Edit timer" onClick={() => void editTimer(t.id)} />}
                {!compact && <IconButton icon={<Trash2 size={14} />} title="Delete timer" onClick={() => void deleteTimer(t.id)} />}
              </div>
            )
          })
        )}
      </div>
    </section>
  )
}
