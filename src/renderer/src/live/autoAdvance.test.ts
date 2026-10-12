import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEmptySlide, createPresentation, createProject } from '@shared/model/factory'
import { normalizeProject } from '@shared/model/normalize'
import type { Presentation } from '@shared/model/types'
import { loadProject, unloadProject } from '../store/projectStore'
import { tickAutoAdvance, toggleAutoAdvancePause } from './autoAdvance'
import { clearSlide, take } from './liveActions'
import { live } from './liveStore'

let pres: Presentation
const T0 = 1_000_000

function setup(patch: Partial<Presentation>): void {
  const p = createProject('Test')
  pres = { ...createPresentation('Announcements', [createEmptySlide(), createEmptySlide(), createEmptySlide()]), ...patch }
  p.presentations[pres.id] = pres
  loadProject({ project: p, path: 'C:/x', repairs: [], recoveredFrom: null })
  live.set({ cursor: null, last: null, black: false, autoAdvancePaused: false, overlays: [] })
}
const at = (ms: number): void => {
  vi.setSystemTime(T0 + ms)
  tickAutoAdvance()
}
const current = (): number => pres.slides.findIndex((s) => s.id === live.get().cursor?.slideId)

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(T0)
})
afterEach(() => {
  vi.useRealTimers()
  unloadProject()
})

describe('auto-advance', () => {
  it('moves on after the presentation time and loops back to the first slide', () => {
    setup({ autoAdvanceSec: 5, loop: true })
    take(pres.id, pres.slides[0]!.id)
    at(4_900)
    expect(current()).toBe(0)
    at(5_000)
    expect(current()).toBe(1)
    at(10_000)
    at(15_000)
    expect(current()).toBe(0)
  })

  it('stops at the end without loop, and never moves a manual slide', () => {
    setup({ autoAdvanceSec: 5 })
    pres.slides[1]!.advanceAfterSec = 0
    take(pres.id, pres.slides[0]!.id)
    at(5_000)
    expect(current()).toBe(1)
    at(60_000)
    expect(current()).toBe(1)

    take(pres.id, pres.slides[2]!.id)
    at(120_000)
    expect(current()).toBe(2)
  })

  it('uses a slide’s own time, pauses, and stops on Clear', () => {
    setup({})
    pres.slides[0]!.advanceAfterSec = 2
    take(pres.id, pres.slides[0]!.id)
    toggleAutoAdvancePause()
    at(10_000)
    expect(current()).toBe(0)
    toggleAutoAdvancePause() // resuming restarts the slide's time
    at(11_000)
    expect(current()).toBe(0)
    at(12_000)
    expect(current()).toBe(1)

    take(pres.id, pres.slides[0]!.id)
    clearSlide()
    at(30_000)
    expect(live.get().cursor).toBeNull()
  })

  it('saves and loads the settings', () => {
    setup({ autoAdvanceSec: 7.25, loop: true })
    pres.slides[0]!.advanceAfterSec = 0
    const raw = JSON.parse(JSON.stringify({ ...createProject('x'), presentations: { [pres.id]: pres } }))
    const loaded = normalizeProject(raw).project.presentations[pres.id]
    expect(loaded).toMatchObject({ autoAdvanceSec: 7.3, loop: true })
    expect(loaded?.slides[0]?.advanceAfterSec).toBe(0)
    expect('advanceAfterSec' in (loaded?.slides[1] ?? {})).toBe(false)
  })
})
