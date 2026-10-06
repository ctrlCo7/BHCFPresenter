import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { IPC } from './ipc'
import { normalizeProject } from './model/normalize'
import { PROJECT_SCHEMA_VERSION } from './model/types'

describe('schema migration', () => {
  it('upgrades a schema-1 project with defaults for every new field', () => {
    const v1 = {
      format: 'bhcf-project',
      schemaVersion: 1,
      id: 'p1',
      name: 'Old',
      settings: { canvas: { width: 1920, height: 1080 } },
      trees: { library: ['a'], playlists: [] },
      folders: {},
      presentations: { a: { name: 'Song', slides: [] } },
      playlists: {},
      media: { m: { fileName: 'x.mp4', kind: 'video' } }
    }
    const { project, repairs } = normalizeProject(v1)
    expect(project.schemaVersion).toBe(PROJECT_SCHEMA_VERSION)
    expect(project.overlays).toEqual({})
    expect(project.timerOrder).toEqual([])
    expect(project.settings.linesPerSlide).toBe(0)
    expect(project.settings.logoMediaId).toBeNull()
    expect(project.presentations.a?.song).toBeNull()
    expect(project.media.m?.thumbnail).toBeNull()
    expect(repairs).toEqual([])
  })

  it('drops a logo that points at missing media and repairs overlay/timer order', () => {
    const { project } = normalizeProject({
      format: 'bhcf-project',
      schemaVersion: 2,
      settings: { logoMediaId: 'gone' },
      overlays: { o1: { name: 'Logo', slide: { id: 's', elements: [] } } },
      overlayOrder: ['missing', 'o1', 'o1'],
      timers: { t1: { name: 'T', kind: 'countdown', durationSec: 60 } },
      timerOrder: []
    })
    expect(project.settings.logoMediaId).toBeNull()
    expect(project.overlayOrder).toEqual(['o1'])
    expect(project.overlays.o1?.slide.background).toEqual({ type: 'none' })
    expect(project.timerOrder).toEqual(['t1'])
  })
})

describe('output preload', () => {
  it('uses the same channel names as the shared IPC table', () => {
    // The output preload repeats channel names to stay a single self-contained file.
    const src = readFileSync(path.join(__dirname, '../preload/output.ts'), 'utf8')
    for (const [key, channel] of [
      ['outputHello', IPC.outputHello],
      ['liveState', IPC.liveState],
      ['outputConfig', IPC.outputConfig],
      ['appLog', IPC.appLog]
    ]) {
      expect(src).toContain(`${key}: '${channel}'`)
    }
  })
})
