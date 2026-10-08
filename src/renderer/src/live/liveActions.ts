/** Live operations: take, next/previous (across playlist items), clear, black, logo, media, overlays, timers. */
import { mediaPosition } from '@shared/live'
import type { Background, Id, PlaylistEntry, Presentation, Project, Slide, TransitionSpec } from '@shared/model/types'
import { elapsedMs, idleRuntime } from '@shared/timers'
import { toast } from '../store/overlayStore'
import { useProjectStore } from '../store/projectStore'
import { ui } from '../store/uiStore'
import { live, type LiveCursor, type PlaylistContext } from './liveStore'

const project = (): Project | null => useProjectStore.getState().project

export function resolveBackground(p: Project, pres: Presentation, slide: Slide): Background {
  return slide.background ?? pres.background ?? p.settings.defaultBackground
}

export function resolveTransition(p: Project, pres: Presentation, slide: Slide): TransitionSpec {
  return live.get().transitionOverride ?? slide.transition ?? pres.transition ?? p.settings.defaultTransition
}

/** Keeps the slide grid showing and selecting what is live. */
function syncUi(cursor: LiveCursor): void {
  const s = ui.get()
  if (s.activePresentationId !== cursor.presentationId) {
    ui.openPresentation(cursor.presentationId, cursor.context)
    if (cursor.context) ui.set({ treeSelection: { scope: 'playlists', id: cursor.context.playlistId } })
  }
  ui.selectSlides([cursor.slideId])
}

/** Puts a slide on screen. The playlist context defaults to the playlist entry the operator is viewing. */
export function take(presentationId: Id, slideId: Id, context?: PlaylistContext | null): void {
  const p = project()
  const pres = p?.presentations[presentationId]
  if (!p || !pres || !pres.slides.some((s) => s.id === slideId)) return
  let ctx = context
  if (ctx === undefined) {
    const sel = ui.get().entrySelection
    const entry = sel ? p.playlists[sel.playlistId]?.entries.find((e) => e.id === sel.entryId) : undefined
    ctx = entry?.kind === 'presentation' && entry.presentationId === presentationId && sel ? sel : null
  }
  const cursor: LiveCursor = { presentationId, slideId, context: ctx }
  live.set((s) => ({ cursor, last: cursor, takeId: s.takeId + 1, logo: false, heldBackground: null }))
  syncUi(cursor)
}

function enabledSlides(pres: Presentation): Slide[] {
  return pres.slides.filter((s) => s.enabled)
}

/** Walks the playlist from `ctx` in `dir`, returning the next playable entry. */
function adjacentEntry(p: Project, ctx: PlaylistContext, dir: 1 | -1): { entry: PlaylistEntry; ctx: PlaylistContext } | null {
  const pl = p.playlists[ctx.playlistId]
  if (!pl) return null
  let i = pl.entries.findIndex((e) => e.id === ctx.entryId)
  if (i < 0) return null
  for (i += dir; i >= 0 && i < pl.entries.length; i += dir) {
    const e = pl.entries[i] as PlaylistEntry
    if (e.kind === 'presentation') {
      const pres = p.presentations[e.presentationId]
      if (pres && enabledSlides(pres).length > 0) return { entry: e, ctx: { playlistId: pl.id, entryId: e.id } }
    }
  }
  return null
}

function goToEntry(p: Project, target: { entry: PlaylistEntry; ctx: PlaylistContext }, dir: 1 | -1): void {
  const e = target.entry
  if (e.kind === 'presentation') {
    const slides = enabledSlides(p.presentations[e.presentationId] as Presentation)
    const slide = dir === 1 ? slides[0] : slides[slides.length - 1]
    if (slide) take(e.presentationId, slide.id, target.ctx)
  }
}

/** Plays the next / previous item of the Media-tab playlist `ctx` points into (entryId = media id). */
function stepMediaPlaylist(p: Project, ctx: PlaylistContext, dir: 1 | -1): void {
  const ids = p.mediaPlaylists[ctx.playlistId]?.mediaIds ?? []
  const i = ids.indexOf(ctx.entryId)
  if (i < 0) return
  for (let j = i + dir; j >= 0 && j < ids.length; j += dir) {
    const id = ids[j] as Id
    if (p.media[id]) {
      playMedia(id, { playlistId: ctx.playlistId, entryId: id })
      ui.set({ selectedMediaIds: [id] })
      return
    }
  }
}

function step(dir: 1 | -1): void {
  const p = project()
  if (!p) return
  const s = live.get()
  const cursor = s.cursor ?? s.last

  // Continue the media playlist the playing item came from.
  if (!s.cursor && s.mediaContext) {
    stepMediaPlaylist(p, s.mediaContext, dir)
    return
  }

  if (!cursor) {
    // Nothing taken yet: start with the selected (or first) slide of the open presentation.
    const presId = ui.get().activePresentationId
    const pres = presId ? p.presentations[presId] : undefined
    if (!pres) return
    const selected = pres.slides.find((x) => x.id === ui.get().selectedSlideIds[0] && x.enabled)
    const first = selected ?? enabledSlides(pres)[0]
    if (first) take(pres.id, first.id)
    return
  }

  const pres = p.presentations[cursor.presentationId]
  if (!pres) return
  // After Clear, "next" re-takes the same slide rather than skipping it.
  if (!s.cursor && s.last) {
    take(cursor.presentationId, cursor.slideId, cursor.context)
    return
  }
  const index = pres.slides.findIndex((x) => x.id === cursor.slideId)
  for (let i = index + dir; i >= 0 && i < pres.slides.length; i += dir) {
    const slide = pres.slides[i] as Slide
    if (slide.enabled) {
      take(pres.id, slide.id, cursor.context)
      return
    }
  }
  // End of this presentation: continue to the adjacent playlist item.
  if (cursor.context) {
    const target = adjacentEntry(p, cursor.context, dir)
    if (target) goToEntry(p, target, dir)
  }
}

export const nextSlide = (): void => step(1)
export const prevSlide = (): void => step(-1)

/** Clears the slide text but leaves its background on screen. */
export function clearSlide(): void {
  const p = project()
  const s = live.get()
  if (!s.cursor || !p) return
  const pres = p.presentations[s.cursor.presentationId]
  const slide = pres?.slides.find((x) => x.id === s.cursor?.slideId)
  live.set({ cursor: null, heldBackground: pres && slide ? resolveBackground(p, pres, slide) : null })
}

export function clearAll(): void {
  live.set({ cursor: null, heldBackground: null, media: null, bgMedia: null, mediaContext: null, overlays: [], logo: false, black: false })
}

export function toggleBlack(): void {
  live.set((s) => ({ black: !s.black }))
}

export function toggleLogo(): void {
  const p = project()
  if (!p?.settings.logoMediaId || !p.media[p.settings.logoMediaId]) {
    if (!live.get().logo) {
      toast.info('No logo set', 'Choose a logo image in Settings → Project, or right-click an image in the media bin.')
      return
    }
  }
  live.set((s) => ({ logo: !s.logo }))
}

/* ------------------------------ Media ------------------------------ */

let cueSeq = 0

export function playMedia(mediaId: Id, context: PlaylistContext | null = null): void {
  const asset = project()?.media[mediaId]
  if (!asset) return
  live.set((s) => ({
    media: {
      cueId: ++cueSeq,
      mediaId,
      playing: asset.kind !== 'image',
      anchorPos: 0,
      anchorAt: Date.now(),
      loop: false,
      volume: s.media?.volume ?? 1,
      muted: false,
      fit: 'contain'
    },
    mediaContext: context,
    // A video/image cue replaces the slide on screen; audio plays underneath it.
    ...(asset.kind === 'audio' ? {} : { cursor: null, heldBackground: null, logo: false })
  }))
}

/**
 * Puts a looping video (or still image) behind the slides. Slides with a transparent background
 * show it through; it keeps running while lyrics change and survives Clear (C).
 */
export function playBackground(mediaId: Id): void {
  const asset = project()?.media[mediaId]
  if (!asset || asset.kind === 'audio') return
  live.set((s) => ({
    bgMedia: { cueId: ++cueSeq, mediaId, playing: asset.kind === 'video', anchorPos: 0, anchorAt: Date.now(), loop: true, volume: 1, muted: true, fit: 'cover' },
    // A full-screen cue would hide the new background; stop it.
    media: s.media && project()?.media[s.media.mediaId]?.kind !== 'audio' ? null : s.media
  }))
}

export function stopBackground(): void {
  live.set({ bgMedia: null })
}

export function backgroundToggleMute(): void {
  const b = live.get().bgMedia
  if (b) live.set({ bgMedia: { ...b, muted: !b.muted } })
}

function duration(): number | null {
  const m = live.get().media
  return m ? (project()?.media[m.mediaId]?.durationSec ?? null) : null
}

function updateMedia(patch: (now: number, pos: number) => Partial<NonNullable<ReturnType<typeof live.get>['media']>>): void {
  const m = live.get().media
  if (!m) return
  const now = Date.now()
  const pos = mediaPosition(m, now, duration())
  live.set({ media: { ...m, ...patch(now, pos) } })
}

export function mediaPause(): void {
  updateMedia((now, pos) => ({ playing: false, anchorPos: pos, anchorAt: now }))
}

export function mediaPlay(): void {
  updateMedia((now, pos) => {
    const d = duration()
    // Restart a finished, non-looping cue.
    return { playing: true, anchorPos: d && pos >= d - 0.05 ? 0 : pos, anchorAt: now }
  })
}

export function mediaToggle(): void {
  const m = live.get().media
  if (!m) return
  if (m.playing) mediaPause()
  else mediaPlay()
}

export function mediaStop(): void {
  live.set({ media: null, mediaContext: null })
}

export function mediaSeek(seconds: number): void {
  updateMedia((now) => ({ anchorPos: Math.max(0, seconds), anchorAt: now }))
}

export function mediaSetLoop(loop: boolean): void {
  updateMedia((now, pos) => ({ loop, anchorPos: pos, anchorAt: now }))
}

export function mediaSetVolume(volume: number): void {
  updateMedia(() => ({ volume: Math.max(0, Math.min(1, volume)) }))
}

export function mediaToggleMute(): void {
  updateMedia(() => ({ muted: !live.get().media?.muted }))
}

/** Called a few times per second: ends non-looping cues when they finish. */
export function tickMedia(): void {
  const m = live.get().media
  if (!m || !m.playing || m.loop) return
  const d = duration()
  if (d && mediaPosition(m, Date.now(), d) >= d) {
    // A finished video (or audio) clears its cue: the media fades out to black
    // (or to the live background / slide underneath, if one is up).
    mediaStop()
  }
}

/* ----------------------------- Overlays ----------------------------- */

export function toggleOverlay(id: Id): void {
  live.set((s) => ({ overlays: s.overlays.includes(id) ? s.overlays.filter((x) => x !== id) : [...s.overlays, id] }))
}

/* ------------------------------ Timers ------------------------------ */

export function timerStart(id: Id): void {
  live.set((s) => {
    const rt = s.timers[id] ?? idleRuntime()
    if (rt.running) return {}
    return { timers: { ...s.timers, [id]: { ...rt, running: true, startedAt: Date.now() } } }
  })
}

export function timerPause(id: Id): void {
  live.set((s) => {
    const rt = s.timers[id]
    if (!rt?.running) return {}
    return { timers: { ...s.timers, [id]: { running: false, startedAt: null, accumulatedMs: elapsedMs(rt, Date.now()) } } }
  })
}

export function timerToggle(id: Id): void {
  if (live.get().timers[id]?.running) timerPause(id)
  else timerStart(id)
}

export function timerReset(id: Id): void {
  live.set((s) => ({ timers: { ...s.timers, [id]: idleRuntime() } }))
}

/* ------------------------------ Misc ------------------------------ */

export function setStageMessage(message: string): void {
  live.set({ stageMessage: message.slice(0, 500) })
}

export function setTransitionOverride(spec: TransitionSpec | null): void {
  live.set({ transitionOverride: spec })
}

export function setMasterVolume(v: number): void {
  live.set({ masterVolume: Math.max(0, Math.min(1, v)) })
}

export async function setOutputsActive(active: boolean): Promise<void> {
  try {
    await window.bhcf.outputs.setActive(active)
  } catch (err) {
    toast.error('Could not change outputs', (err as Error).message)
  }
}

export function toggleOutputs(): void {
  void setOutputsActive(!live.get().outputsActive)
}

/** Forgets live references to things that no longer exist (deleted presentations, overlays…). */
export function pruneLive(p: Project): void {
  const s = live.get()
  const valid = (c: LiveCursor | null): LiveCursor | null =>
    c && p.presentations[c.presentationId]?.slides.some((x) => x.id === c.slideId) ? c : null
  const cursor = valid(s.cursor)
  const last = valid(s.last)
  const overlays = s.overlays.filter((id) => p.overlays[id])
  const media = s.media && p.media[s.media.mediaId] ? s.media : null
  const bgMedia = s.bgMedia && p.media[s.bgMedia.mediaId] ? s.bgMedia : null
  if (cursor !== s.cursor || last !== s.last || overlays.length !== s.overlays.length || media !== s.media || bgMedia !== s.bgMedia) {
    live.set({ cursor, last, overlays, media, bgMedia })
  }
}
