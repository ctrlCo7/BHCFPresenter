/**
 * Live presentation state, as broadcast from the operator window to every output window.
 *
 * The state is self-contained (resolved slides, backgrounds and media metadata) so output
 * windows never need the project. Media playback is described as a timeline (anchor time +
 * position) rather than streamed, so every window renders the same frame from the same clock.
 */
import type { Background, CanvasSize, Id, MediaAsset, MediaFit, Slide, TransitionSpec } from './model/types'
import type { TimerView } from './timers'

export interface MediaPlayback {
  /** Changes whenever a new cue starts (restarts the element) */
  cueId: number
  mediaId: Id
  playing: boolean
  /** Position (s) at anchorAt */
  anchorPos: number
  /** Epoch ms at which the media was at anchorPos */
  anchorAt: number
  loop: boolean
  volume: number
  muted: boolean
  fit: MediaFit
}

export interface LiveSlide {
  /** Changes on every take; drives transitions */
  takeId: number
  presentationId: Id
  slide: Slide
  transition: TransitionSpec
}

export interface LiveBackground {
  /** Same key = same background, which keeps playing across slide changes */
  key: string
  background: Background
}

export interface LiveState {
  seq: number
  canvas: CanvasSize
  slide: LiveSlide | null
  /** Kept when only the slide text is cleared */
  background: LiveBackground | null
  presentationName: string
  slideIndex: number
  slideCount: number
  /** Next enabled slide (stage display) */
  next: Slide | null
  media: MediaPlayback | null
  /** Looping video/image behind the slides (e.g. a motion background for transparent lyrics) */
  backgroundMedia: MediaPlayback | null
  overlays: { id: Id; slide: Slide }[]
  /** Media id of the logo when the logo layer is up */
  logo: Id | null
  black: boolean
  /** Transition used for layer fades (black, logo, overlays, media) */
  fade: TransitionSpec
  assets: Record<Id, MediaAsset>
  timers: TimerView[]
  stageMessage: string
  /** Which window plays sound: 'operator' or an output id */
  audioTarget: string
  masterVolume: number
}

export function emptyLiveState(canvas: CanvasSize): LiveState {
  return {
    seq: 0,
    canvas,
    slide: null,
    background: null,
    presentationName: '',
    slideIndex: -1,
    slideCount: 0,
    next: null,
    media: null,
    backgroundMedia: null,
    overlays: [],
    logo: null,
    black: false,
    fade: { type: 'fade', durationMs: 400, direction: 'left' },
    assets: {},
    timers: [],
    stageMessage: '',
    audioTarget: 'operator',
    masterVolume: 1
  }
}

/** Current playback position in seconds (wrapped when looping and the duration is known). */
export function mediaPosition(m: MediaPlayback, now: number, durationSec: number | null): number {
  const raw = m.playing ? m.anchorPos + (now - m.anchorAt) / 1000 : m.anchorPos
  if (durationSec && durationSec > 0) {
    if (m.loop) return ((raw % durationSec) + durationSec) % durationSec
    return Math.min(raw, durationSec)
  }
  return Math.max(0, raw)
}

/* ------------------------------ Outputs ------------------------------ */

export type OutputRole = 'audience' | 'stage'

export interface StageLayout {
  showCurrent: boolean
  showNext: boolean
  showClock: boolean
  /** Timer id to show, null = none */
  timerId: Id | null
  showNotes: boolean
  showMessage: boolean
  /** Text scale multiplier */
  fontScale: number
}

export interface OutputConfig {
  id: string
  name: string
  role: OutputRole
  enabled: boolean
  /** Target display id; null = first non-primary display (or windowed) */
  displayId: number | null
  /** Open in a normal window instead of fullscreen (useful with one screen) */
  windowed: boolean
  stage: StageLayout
}

export interface OutputStatus {
  id: string
  name: string
  role: OutputRole
  open: boolean
  displayLabel: string | null
}

export function defaultStageLayout(): StageLayout {
  return { showCurrent: true, showNext: true, showClock: true, timerId: null, showNotes: true, showMessage: true, fontScale: 1 }
}

export function defaultOutputs(): OutputConfig[] {
  return [
    { id: 'audience', name: 'Audience', role: 'audience', enabled: true, displayId: null, windowed: false, stage: defaultStageLayout() },
    { id: 'stage', name: 'Stage Display', role: 'stage', enabled: false, displayId: null, windowed: false, stage: defaultStageLayout() }
  ]
}

/** Plain text of a slide's visible text boxes, for stage displays and remotes. */
export function slidePlainText(slide: Slide | null | undefined): string {
  if (!slide) return ''
  return slide.elements
    .filter((e) => e.type === 'text' && !e.hidden)
    .map((e) => (e.type === 'text' ? e.text.trim() : ''))
    .filter(Boolean)
    .join('\n')
}
