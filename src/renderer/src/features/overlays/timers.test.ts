import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createProject } from '@shared/model/factory'
import { live } from '../../live/liveStore'
import { loadProject, requireProject, unloadProject } from '../../store/projectStore'
import { addTimer, draftTimer, showTimerOverlay, timerNameTaken, timerOverlays, updateTimer } from './overlayActions'

const timerText = (overlayId: string): string[] =>
  requireProject().overlays[overlayId]?.slide.elements.flatMap((e) => (e.type === 'text' ? [e.text] : [])) ?? []

beforeEach(() => {
  loadProject({ project: createProject('Test'), path: 'C:/x', repairs: [], recoveredFrom: null })
  live.set({ overlays: [], media: null, cursor: null })
})
afterEach(() => unloadProject())

describe('timers', () => {
  it('only adds a new timer when it is saved', () => {
    const draft = draftTimer('countdown')
    expect(Object.keys(requireProject().timers)).toHaveLength(0)
    addTimer({ ...draft, durationSec: 600 })
    expect(requireProject().timers[draft.id]?.durationSec).toBe(600)
    expect(draftTimer('countdown').name).toBe('Countdown 2')
  })

  it('edits the timer that was opened, and shows that timer', () => {
    const a = draftTimer('countdown')
    addTimer(a)
    const b = draftTimer('countdown')
    addTimer(b)
    updateTimer(b.id, { name: 'Sermon', durationSec: 1800 })
    const p = requireProject()
    expect(p.timers[a.id]).toMatchObject({ name: 'Countdown', durationSec: 300 })
    expect(p.timers[b.id]).toMatchObject({ name: 'Sermon', durationSec: 1800 })

    showTimerOverlay(b.id)
    const screen = timerOverlays(requireProject(), requireProject().timers[b.id]!)[0]!
    expect(live.get().overlays).toEqual([screen])
    expect(requireProject().overlays[screen]?.timerId).toBe(b.id)
    expect(timerText(screen)).toEqual(['{timer:Sermon}'])
  })

  it('reuses its screen even after the timer text was changed in the editor', () => {
    const t = draftTimer('countdown')
    addTimer(t)
    showTimerOverlay(t.id)
    const screen = live.get().overlays[0]!
    showTimerOverlay(t.id) // hide
    // The operator typed over the timer text in the slide editor.
    const p = structuredClone(requireProject())
    const el = p.overlays[screen]!.slide.elements[0]!
    if (el.type === 'text') el.text = '5:00'
    loadProject({ project: p, path: 'C:/x', repairs: [], recoveredFrom: null })

    showTimerOverlay(t.id)
    expect(Object.keys(requireProject().overlays)).toEqual([screen])
    expect(live.get().overlays).toEqual([screen])
    expect(timerText(screen)).toContain('{timer:Countdown}')
  })

  it('keeps timer names unique, ignoring case', () => {
    const t = draftTimer('countdown')
    addTimer(t)
    expect(timerNameTaken(requireProject(), ' countdown ')).toBe(true)
    expect(timerNameTaken(requireProject(), 'Countdown', t.id)).toBe(false)
  })
})
