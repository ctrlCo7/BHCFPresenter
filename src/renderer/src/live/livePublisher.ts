/**
 * Builds the LiveState from operator state + project and publishes it to the outputs.
 * Computation is batched per microtask (not per animation frame: rAF stops while the operator
 * window is minimised, and outputs must keep updating, e.g. from the remote).
 */
import { create } from 'zustand'
import { emptyLiveState, type LiveState } from '@shared/live'
import type { Project, Slide } from '@shared/model/types'
import { idleRuntime } from '@shared/timers'
import { useProjectStore } from '../store/projectStore'
import { pruneLive, resolveBackground, resolveTransition, tickMedia } from './liveActions'
import { live, useLiveStore, type LiveOpState } from './liveStore'

/** The computed state; the Program monitor renders this exactly like an output does. */
export const useLiveView = create<{ state: LiveState }>(() => ({ state: emptyLiveState({ width: 1920, height: 1080 }) }))

let seq = 0

export function buildLiveState(op: LiveOpState, p: Project): LiveState {
  const pres = op.cursor ? p.presentations[op.cursor.presentationId] : undefined
  const index = pres && op.cursor ? pres.slides.findIndex((s) => s.id === op.cursor?.slideId) : -1
  const slide = pres && index >= 0 ? (pres.slides[index] as Slide) : null
  const background = pres && slide ? resolveBackground(p, pres, slide) : op.heldBackground
  const shown = op.cursor ?? op.last
  const shownPres = shown ? p.presentations[shown.presentationId] : undefined
  const shownIndex = shownPres && shown ? shownPres.slides.findIndex((s) => s.id === shown.slideId) : -1
  const next = shownPres ? (shownPres.slides.slice(shownIndex + 1).find((s) => s.enabled) ?? null) : null
  const audience = op.outputs.find((o) => o.role === 'audience' && o.open)
  const logo = op.logo && p.settings.logoMediaId && p.media[p.settings.logoMediaId] ? p.settings.logoMediaId : null

  return {
    seq: ++seq,
    canvas: p.settings.canvas,
    slide: pres && slide && op.cursor ? { takeId: op.takeId, presentationId: pres.id, slide, transition: resolveTransition(p, pres, slide) } : null,
    background: background && background.type !== 'none' ? { key: JSON.stringify(background), background } : null,
    presentationName: shownPres?.name ?? '',
    slideIndex: shownIndex,
    slideCount: shownPres?.slides.length ?? 0,
    next,
    media: op.media,
    backgroundMedia: op.bgMedia,
    overlays: op.overlays.flatMap((id) => (p.overlays[id] ? [{ id, slide: p.overlays[id].slide }] : [])),
    logo: op.logo ? logo : null,
    black: op.black,
    fade: { type: 'fade', durationMs: Math.max(150, Math.min(1500, p.settings.defaultTransition.durationMs || 400)), direction: 'left' },
    assets: p.media,
    timers: p.timerOrder.flatMap((id) => (p.timers[id] ? [{ def: p.timers[id], runtime: op.timers[id] ?? idleRuntime() }] : [])),
    stageMessage: op.stageMessage,
    audioTarget: audience?.id ?? 'operator',
    masterVolume: op.masterVolume
  }
}

let scheduled = false
function schedule(): void {
  if (scheduled) return
  scheduled = true
  queueMicrotask(() => {
    scheduled = false
    const p = useProjectStore.getState().project
    if (!p) return
    const state = buildLiveState(live.get(), p)
    useLiveView.setState({ state })
    window.bhcf.live.publish(state)
  })
}

export function startLivePublisher(): () => void {
  const unsubLive = useLiveStore.subscribe(schedule)
  const unsubProject = useProjectStore.subscribe((s, prev) => {
    if (s.project !== prev.project) {
      if (s.project) pruneLive(s.project)
      schedule()
    }
  })
  const unsubOutputs = window.bhcf.outputs.onStatus((st) => live.set({ outputsActive: st.active, outputs: st.outputs }))
  void window.bhcf.outputs
    .status()
    .then((st) => live.set({ outputsActive: st.active, outputs: st.outputs }))
    .catch(() => undefined)
  const ticker = window.setInterval(tickMedia, 250)
  schedule()
  return () => {
    unsubLive()
    unsubProject()
    unsubOutputs()
    window.clearInterval(ticker)
  }
}
