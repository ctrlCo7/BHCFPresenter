/**
 * Timer runtime maths and text tokens, shared by the operator, output and stage windows.
 * Timers are pure data ({running, startedAt, accumulatedMs}), so every window computes the
 * same value from the same clock without streaming ticks between processes.
 */
import type { TimerDef } from './model/types'

export interface TimerRuntime {
  running: boolean
  /** Epoch ms when the current run started; null when paused */
  startedAt: number | null
  /** Elapsed ms from previous runs */
  accumulatedMs: number
}

export interface TimerView {
  def: TimerDef
  runtime: TimerRuntime
}

export const idleRuntime = (): TimerRuntime => ({ running: false, startedAt: null, accumulatedMs: 0 })

export function elapsedMs(rt: TimerRuntime, now: number): number {
  return rt.accumulatedMs + (rt.running && rt.startedAt !== null ? now - rt.startedAt : 0)
}

function targetToday(hhmm: string, now: number): number {
  const [h, m] = hhmm.split(':').map(Number)
  const d = new Date(now)
  d.setHours(h ?? 0, m ?? 0, 0, 0)
  return d.getTime()
}

/** Signed milliseconds shown by the timer (remaining for countdowns, elapsed otherwise). */
export function timerValueMs(t: TimerView, now: number): number {
  const { def, runtime } = t
  switch (def.kind) {
    case 'countdown': {
      const left = def.durationSec * 1000 - elapsedMs(runtime, now)
      return def.allowOverrun ? left : Math.max(0, left)
    }
    case 'countup':
      return elapsedMs(runtime, now)
    case 'clock':
      return now
    case 'countdown-to-time': {
      const left = targetToday(def.targetTime, now) - now
      return def.allowOverrun ? left : Math.max(0, left)
    }
  }
}

export function formatDurationMs(ms: number): string {
  const negative = ms < 0
  // Round up for countdowns so "0:01" shows until the final second ends.
  const total = Math.ceil(Math.abs(ms) / 1000 - 1e-9)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const body = h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
  return negative ? `-${body}` : body
}

export function formatClock(now: number): string {
  return new Date(now).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export function formatTimer(t: TimerView, now: number): string {
  return t.def.kind === 'clock' ? formatClock(now) : formatDurationMs(timerValueMs(t, now))
}

export function isTimerExpired(t: TimerView, now: number): boolean {
  return (t.def.kind === 'countdown' || t.def.kind === 'countdown-to-time') && timerValueMs({ ...t, def: { ...t.def, allowOverrun: true } }, now) <= 0
}

const TOKEN = /\{(clock|time|timer:([^}]+))\}/gi

export function hasTokens(text: string): boolean {
  TOKEN.lastIndex = 0
  return TOKEN.test(text)
}

/** Replaces {clock} / {time} / {timer:Name} with live values. Unknown timers are left as-is. */
export function resolveTokens(text: string, timers: TimerView[], now: number): string {
  return text.replace(TOKEN, (match, _kind: string, name?: string) => {
    if (!name) return formatClock(now)
    const wanted = name.trim().toLowerCase()
    const t = timers.find((x) => x.def.name.trim().toLowerCase() === wanted)
    return t ? formatTimer(t, now) : match
  })
}
