import { describe, expect, it, vi } from 'vitest'
import { createPresentation, createProject, createSlide } from '@shared/model/factory'
import type { Presentation } from '@shared/model/types'
import { useProjectStore } from '../store/projectStore'
import { ui } from '../store/uiStore'
import { live } from './liveStore'
import { goToSection, SECTION_KINDS } from './sectionShortcuts'

vi.stubGlobal('window', { setTimeout: () => 0, clearTimeout: () => undefined })

const canvas = { width: 1920, height: 1080 }
const kind = (id: string): (typeof SECTION_KINDS)[number] => SECTION_KINDS.find((k) => k.id === id) as (typeof SECTION_KINDS)[number]

/** A song laid out as Verse 1 (2 slides), Chorus, Verse 2, Chorus. */
function song(): Presentation {
  const labels = ['Verse 1 (1/2)', 'Verse 1 (2/2)', 'Chorus', 'Verse 2', 'Chorus']
  const pres = createPresentation('Amazing Grace', labels.map((l) => ({ ...createSlide(canvas, l), label: l })))
  return { ...pres, kind: 'song' }
}

function setup(): Presentation {
  const p = createProject('T')
  const pres = song()
  p.presentations[pres.id] = pres
  useProjectStore.setState({ project: p, past: [], future: [] })
  ui.set({ mode: 'show', activePresentationId: pres.id })
  live.set({ cursor: null })
  return pres
}

const onScreen = (pres: Presentation): number => pres.slides.findIndex((s) => s.id === live.get().cursor?.slideId)

describe('song section shortcuts', () => {
  it('steps through verses, then wraps around', () => {
    const pres = setup()
    goToSection(kind('verse'))
    expect(onScreen(pres)).toBe(0)
    goToSection(kind('verse'))
    expect(onScreen(pres)).toBe(3)
    goToSection(kind('verse'))
    expect(onScreen(pres)).toBe(0)
  })

  it('goes to the next chorus after the slide on screen', () => {
    const pres = setup()
    goToSection(kind('verse'), 2)
    expect(onScreen(pres)).toBe(3)
    goToSection(kind('chorus'))
    expect(onScreen(pres)).toBe(4)
  })

  it('does nothing for a section the song does not have', () => {
    const pres = setup()
    goToSection(kind('bridge'))
    expect(onScreen(pres)).toBe(-1)
  })
})
