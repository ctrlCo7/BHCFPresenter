/**
 * Operator-side live state: what is on screen and how it got there. This is the single
 * source of truth for the program; `livePublisher` turns it (plus the project) into the
 * self-contained LiveState that outputs render.
 */
import { create } from 'zustand'
import type { MediaPlayback, OutputStatus } from '@shared/live'
import type { Background, Id, TransitionSpec } from '@shared/model/types'
import type { TimerRuntime } from '@shared/timers'

export interface PlaylistContext {
  playlistId: Id
  entryId: Id
}

export interface LiveCursor {
  presentationId: Id
  slideId: Id
  context: PlaylistContext | null
}

export interface LiveOpState {
  /** Slide on screen; null when cleared */
  cursor: LiveCursor | null
  /** Last slide taken, so Next continues after a Clear */
  last: LiveCursor | null
  takeId: number
  /** Background left on screen after clearing the slide text */
  heldBackground: Background | null
  black: boolean
  logo: boolean
  media: MediaPlayback | null
  /** Live background behind every slide: keeps playing while slides change */
  bgMedia: MediaPlayback | null
  /** Playlist position of the current media cue, so Next continues the playlist */
  mediaContext: PlaylistContext | null
  overlays: Id[]
  timers: Record<Id, TimerRuntime>
  stageMessage: string
  /** Live transition override (null = use slide / presentation / project transitions) */
  transitionOverride: TransitionSpec | null
  masterVolume: number
  outputsActive: boolean
  outputs: OutputStatus[]
}

export const useLiveStore = create<LiveOpState>(() => ({
  cursor: null,
  last: null,
  takeId: 0,
  heldBackground: null,
  black: false,
  logo: false,
  media: null,
  bgMedia: null,
  mediaContext: null,
  overlays: [],
  timers: {},
  stageMessage: '',
  transitionOverride: null,
  masterVolume: 1,
  outputsActive: false,
  outputs: []
}))

export const live = {
  get: useLiveStore.getState,
  set: useLiveStore.setState
}
