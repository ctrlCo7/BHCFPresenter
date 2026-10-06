/**
 * Connects the local-network remote to the live engine: executes validated commands and
 * publishes a compact snapshot (playlists, slide texts, live status, timers) to the server.
 */
import type { RemoteCommand, RemoteSnapshot } from '@shared/ipc'
import { slidePlainText } from '@shared/live'
import type { Project } from '@shared/model/types'
import { formatTimer, idleRuntime } from '@shared/timers'
import { useProjectStore } from '../store/projectStore'
import {
  clearAll,
  clearSlide,
  mediaStop,
  mediaToggle,
  nextSlide,
  prevSlide,
  take,
  timerPause,
  timerReset,
  timerStart,
  toggleBlack,
  toggleLogo
} from './liveActions'
import { live, useLiveStore } from './liveStore'

const str = (v: unknown): string | null => (typeof v === 'string' && v.length < 100 ? v : null)

export function runRemoteCommand(cmd: RemoteCommand): void {
  const p = useProjectStore.getState().project
  if (!p) return
  const a = cmd.args ?? {}
  switch (cmd.command) {
    case 'live.next':
      return nextSlide()
    case 'live.prev':
      return prevSlide()
    case 'live.black':
      return toggleBlack()
    case 'live.clear':
      return clearSlide()
    case 'live.clearAll':
      return clearAll()
    case 'live.logo':
      return toggleLogo()
    case 'live.trigger': {
      const presId = str(a.presentationId)
      const slideId = str(a.slideId)
      if (presId && slideId) take(presId, slideId)
      return
    }
    case 'media.toggle':
      return mediaToggle()
    case 'media.stop':
      return mediaStop()
    case 'timer.start':
    case 'timer.pause':
    case 'timer.reset': {
      const id = str(a.timerId)
      if (!id || !p.timers[id]) return
      if (cmd.command === 'timer.start') timerStart(id)
      else if (cmd.command === 'timer.pause') timerPause(id)
      else timerReset(id)
      return
    }
  }
}

function snapshot(p: Project): RemoteSnapshot {
  const s = live.get()
  const shown = s.cursor ?? s.last
  const pres = shown ? p.presentations[shown.presentationId] : undefined
  const now = Date.now()
  const presentations: RemoteSnapshot['presentations'] = {}
  const include = (id: string): void => {
    const x = p.presentations[id]
    if (!x || presentations[id]) return
    presentations[id] = {
      id,
      name: x.name,
      slides: x.slides.map((sl) => ({ id: sl.id, label: sl.label, text: slidePlainText(sl).slice(0, 160), enabled: sl.enabled }))
    }
  }
  const playlists = p.trees.playlists
    .flatMap(function walk(id): string[] {
      const f = p.folders[id]
      return f ? f.childIds.flatMap(walk) : [id]
    })
    .flatMap((id) => {
      const pl = p.playlists[id]
      if (!pl) return []
      return [
        {
          id: pl.id,
          name: pl.name,
          entries: pl.entries.map((e) => {
            if (e.kind === 'presentation') include(e.presentationId)
            return {
              id: e.id,
              kind: e.kind,
              label: e.kind === 'header' ? e.title : e.kind === 'presentation' ? (p.presentations[e.presentationId]?.name ?? '?') : (p.media[e.mediaId]?.name ?? '?'),
              presentationId: e.kind === 'presentation' ? e.presentationId : null
            }
          })
        }
      ]
    })
  if (pres) include(pres.id)
  const media = s.media ? p.media[s.media.mediaId] : undefined
  return {
    project: p.name,
    live: {
      presentationId: pres?.id ?? null,
      presentationName: pres?.name ?? '',
      slideIndex: pres && shown ? pres.slides.findIndex((x) => x.id === shown.slideId) : -1,
      slideCount: pres?.slides.length ?? 0,
      black: s.black,
      logo: s.logo,
      cleared: !s.cursor,
      media: media && s.media ? { name: media.name, playing: s.media.playing } : null
    },
    playlists,
    presentations,
    timers: p.timerOrder.flatMap((id) => {
      const def = p.timers[id]
      if (!def) return []
      const runtime = s.timers[id] ?? idleRuntime()
      return [{ id, name: def.name, display: formatTimer({ def, runtime }, now), running: runtime.running }]
    })
  }
}

export function startRemoteBridge(): () => void {
  let timer: number | null = null
  const publish = (): void => {
    if (timer !== null) return
    timer = window.setTimeout(() => {
      timer = null
      const p = useProjectStore.getState().project
      if (p) window.bhcf.remote.publish(snapshot(p))
    }, 250)
  }
  const unsubCommand = window.bhcf.remote.onCommand(runRemoteCommand)
  const unsubLive = useLiveStore.subscribe(publish)
  const unsubProject = useProjectStore.subscribe((s, prev) => {
    if (s.project !== prev.project) publish()
  })
  // Running timers change every second.
  const ticker = window.setInterval(() => {
    if (Object.values(live.get().timers).some((t) => t.running)) publish()
  }, 1000)
  publish()
  return () => {
    unsubCommand()
    unsubLive()
    unsubProject()
    window.clearInterval(ticker)
  }
}
