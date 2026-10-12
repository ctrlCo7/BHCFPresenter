import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createEmptySlide, createOverlay, createPresentation, createProject, createTimer } from '@shared/model/factory'
import { normalizeProject } from '@shared/model/normalize'
import type { Project } from '@shared/model/types'
import { loadProject, unloadProject, useProjectStore } from '../store/projectStore'
import { updateTimer } from '../features/overlays/overlayActions'
import { clearSlide, playMedia, take, toggleOverlay } from './liveActions'
import { live } from './liveStore'

let p: Project
const canvas = { width: 1920, height: 1080 }
const screen = createOverlay(canvas, 'countdown', undefined, 'Countdown')
const lowerThird = createOverlay(canvas, 'lower-third')

beforeEach(() => {
  p = createProject('Test')
  const pres = createPresentation('Song', [createEmptySlide()])
  p.presentations[pres.id] = pres
  p.overlays = { [screen.id]: structuredClone(screen), [lowerThird.id]: structuredClone(lowerThird) }
  p.overlayOrder = [screen.id, lowerThird.id]
  const timer = createTimer('Countdown')
  p.timers = { [timer.id]: timer }
  p.timerOrder = [timer.id]
  p.media = {
    clip: { id: 'clip', name: 'clip', kind: 'video', fileName: 'clip.mp4', originalName: 'clip.mp4', mimeType: 'video/mp4', sizeBytes: 1, width: 1920, height: 1080, durationSec: 10, thumbnail: null, importedAt: new Date(0).toISOString() }
  }
  loadProject({ project: p, path: 'C:/x', repairs: [], recoveredFrom: null })
  live.set({ cursor: null, last: null, media: null, overlays: [], logo: false })
})
afterEach(() => unloadProject())

const slideOf = (): { presId: string; slideId: string } => {
  const pres = Object.values(p.presentations)[0]
  return { presId: pres?.id ?? '', slideId: pres?.slides[0]?.id ?? '' }
}

describe('timer screen', () => {
  it('takes the slide off screen when shown, and the next slide takes it off', () => {
    const { presId, slideId } = slideOf()
    take(presId, slideId)
    toggleOverlay(lowerThird.id)
    toggleOverlay(screen.id)
    expect(live.get().cursor).toBeNull()
    expect(live.get().overlays).toEqual([lowerThird.id, screen.id])

    take(presId, slideId)
    // The lower third is a normal overlay and stays.
    expect(live.get().overlays).toEqual([lowerThird.id])
  })

  it('is replaced by media and Clear, and replaces media', () => {
    toggleOverlay(screen.id)
    playMedia('clip')
    expect(live.get().overlays).toEqual([])

    toggleOverlay(screen.id)
    expect(live.get().media).toBeNull()
    clearSlide()
    expect(live.get().overlays).toEqual([])
  })

  it('older countdown overlays load as timer screens; other overlays stay transparent layers', () => {
    const raw = JSON.parse(JSON.stringify(p))
    delete raw.overlays[screen.id].fullScreen
    raw.overlays[lowerThird.id].slide.background = { type: 'color', color: '#000' }
    const loaded = normalizeProject(raw).project
    expect(loaded.overlays[screen.id]?.fullScreen).toBe(true)
    expect(loaded.overlays[lowerThird.id]?.fullScreen).toBe(false)
    expect(loaded.overlays[lowerThird.id]?.slide.background).toEqual({ type: 'none' })
  })

  it('renaming a timer keeps its screen showing it', () => {
    updateTimer(p.timerOrder[0] ?? '', { name: 'Service Start' })
    const o = useProjectStore.getState().project?.overlays[screen.id]
    expect(o?.slide.elements[0]).toMatchObject({ text: '{timer:Service Start}' })
    expect(o?.name).toBe('Service Start Overlay')
  })
})
