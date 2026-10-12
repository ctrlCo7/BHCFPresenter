/**
 * Auto-advance: a live slide moves on by itself after its time (slide setting, else the
 * presentation's), and a looping presentation starts again after its last slide. Used for
 * announcement loops before a service. Stops on Clear, Black, media, a timer screen or the logo,
 * and when the operator pauses it.
 */
import type { Presentation, Slide } from '@shared/model/types'
import { useProjectStore } from '../store/projectStore'
import { take } from './liveActions'
import { live, type LiveOpState } from './liveStore'

/** Seconds this slide stays up during live; 0 = until Next. */
export function slideAdvanceSec(pres: Presentation, slide: Slide): number {
  return slide.advanceAfterSec ?? pres.autoAdvanceSec ?? 0
}

/** The slide auto-advance goes to after `slide`, or null at the end of a non-looping presentation. */
export function autoNextSlide(pres: Presentation, slide: Slide): Slide | null {
  const enabled = pres.slides.filter((s) => s.enabled)
  const i = pres.slides.indexOf(slide)
  const after = pres.slides.slice(i + 1).find((s) => s.enabled)
  if (after) return after
  const first = enabled[0]
  return pres.loop && first && first !== slide ? first : null
}

export interface AutoAdvanceView {
  /** Seconds left on the current slide */
  remaining: number
  total: number
  paused: boolean
}

/** Countdown to the next automatic slide, for the operator's display; null when not auto-advancing. */
export function autoAdvanceView(s: LiveOpState, now: number): AutoAdvanceView | null {
  const p = useProjectStore.getState().project
  const pres = s.cursor ? p?.presentations[s.cursor.presentationId] : undefined
  const slide = pres?.slides.find((x) => x.id === s.cursor?.slideId)
  if (!pres || !slide || s.black) return null
  const total = slideAdvanceSec(pres, slide)
  if (!total || !autoNextSlide(pres, slide)) return null
  return { remaining: Math.max(0, total - (now - s.takenAt) / 1000), total, paused: s.autoAdvancePaused }
}

/** Called a few times per second. */
export function tickAutoAdvance(now = Date.now()): void {
  const s = live.get()
  if (!s.cursor || s.autoAdvancePaused) return
  const view = autoAdvanceView(s, now)
  if (!view || view.remaining > 0) return
  const pres = useProjectStore.getState().project?.presentations[s.cursor.presentationId]
  const slide = pres?.slides.find((x) => x.id === s.cursor?.slideId)
  const next = pres && slide ? autoNextSlide(pres, slide) : null
  if (pres && next) take(pres.id, next.id, s.cursor.context)
}

/** Pauses or resumes auto-advance; resuming gives the current slide its full time again. */
export function toggleAutoAdvancePause(): void {
  live.set((s) => (s.autoAdvancePaused ? { autoAdvancePaused: false, takenAt: Date.now() } : { autoAdvancePaused: true }))
}
