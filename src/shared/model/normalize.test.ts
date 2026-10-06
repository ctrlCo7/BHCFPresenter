import { describe, expect, it } from 'vitest'
import { createPresentation, createProject, createSlide } from './factory'
import { normalizeProject, ProjectFormatError } from './normalize'

describe('normalizeProject', () => {
  it('round-trips a valid project unchanged', () => {
    const p = createProject('Church')
    const pres = createPresentation('Song', [createSlide(p.settings.canvas, 'Hello')])
    p.presentations[pres.id] = pres
    p.trees.library.push(pres.id)
    const { project, repairs } = normalizeProject(JSON.parse(JSON.stringify(p)))
    expect(repairs).toEqual([])
    expect(project).toEqual(p)
  })

  it('rejects non-project files and newer schemas', () => {
    expect(() => normalizeProject({ hello: 1 })).toThrow(ProjectFormatError)
    expect(() => normalizeProject({ ...createProject('x'), schemaVersion: 99 })).toThrow(/newer version/)
  })

  it('repairs dangling references, cycles and orphans', () => {
    const p = createProject('Broken') as unknown as Record<string, unknown>
    const pres = createPresentation('Orphan')
    p.presentations = { [pres.id]: pres }
    p.folders = {
      f1: { id: 'f1', scope: 'library', name: 'A', childIds: ['f2', 'missing'] },
      f2: { id: 'f2', scope: 'library', name: 'B', childIds: ['f1'] }
    }
    p.trees = { library: ['f1', 'f1', 'ghost'], playlists: [] }
    p.playlists = { pl: { id: 'pl', name: 'P', entries: [{ id: 'e', kind: 'presentation', presentationId: 'gone' }] } }
    const { project, repairs } = normalizeProject(p)
    expect(project.trees.library).toEqual(['f1', pres.id])
    expect(project.folders.f1?.childIds).toEqual(['f2'])
    expect(project.folders.f2?.childIds).toEqual([])
    expect(project.trees.playlists).toEqual(['pl'])
    expect(project.playlists.pl?.entries).toEqual([])
    expect(repairs.length).toBeGreaterThan(0)
  })

  it('rejects media file names that try to escape the media folder', () => {
    const p = createProject('M') as unknown as Record<string, unknown>
    p.media = {
      ok: { fileName: 'a.png', kind: 'image' },
      bad: { fileName: '../secret.png', kind: 'image' }
    }
    const { project } = normalizeProject(p)
    expect(Object.keys(project.media)).toEqual(['ok'])
  })
})
