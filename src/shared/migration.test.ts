import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { IPC } from './ipc'
import { normalizeProject } from './model/normalize'
import { PROJECT_SCHEMA_VERSION, type Profile, type Project } from './model/types'

/** The profile an upgraded project opens on ("General", holding the old workspace). */
const general = (p: Project): Profile => p.profiles[p.activeProfileId] as Profile

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

  it('moves media out of service-order playlists into Media-tab playlists', () => {
    const { project, repairs } = normalizeProject({
      format: 'bhcf-project',
      schemaVersion: 2,
      trees: { library: ['a'], playlists: ['pl'] },
      presentations: { a: { name: 'Song', slides: [] } },
      media: { v: { fileName: 'v.mp4', kind: 'video' }, i: { fileName: 'i.png', kind: 'image' } },
      playlists: {
        pl: {
          name: 'Sunday',
          entries: [
            { id: 'e1', kind: 'presentation', presentationId: 'a' },
            { id: 'e2', kind: 'media', mediaId: 'v' },
            { id: 'e3', kind: 'media', mediaId: 'i' },
            { id: 'e4', kind: 'media', mediaId: 'gone' }
          ]
        }
      }
    })
    expect(project.playlists.pl?.entries.map((e) => e.id)).toEqual(['e1'])
    const lists = general(project).mediaPlaylistOrder.map((id) => project.mediaPlaylists[id])
    // The three defaults, then one per kind from "Sunday".
    expect(lists.map((l) => [l?.name, l?.kind, l?.mediaIds])).toEqual([
      ['Images', 'image', []],
      ['Backgrounds', 'background', []],
      ['Videos', 'video', []],
      ['Audio', 'audio', []],
      ['Sunday (Images)', 'image', ['i']],
      ['Sunday (Videos)', 'video', ['v']]
    ])
    expect(repairs).toEqual(['Moved 2 media item(s) from playlist "Sunday" to the Media tab.'])
  })

  it('keeps saved media playlists, dropping missing or wrong-kind media', () => {
    const { project } = normalizeProject({
      format: 'bhcf-project',
      schemaVersion: 2,
      media: { v: { fileName: 'v.mp4', kind: 'video' }, i: { fileName: 'i.png', kind: 'image' } },
      mediaPlaylists: { m: { name: 'Loops', kind: 'video', mediaIds: ['v', 'i', 'gone', 'v'] } },
      mediaPlaylistOrder: []
    })
    // The schema-3 upgrade adds Backgrounds (first, as there is no Images playlist).
    expect(general(project).mediaPlaylistOrder.map((id) => project.mediaPlaylists[id]?.name)).toEqual(['Backgrounds', 'Loops'])
    expect(project.mediaPlaylists.m?.mediaIds).toEqual(['v'])
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

describe('profiles (schema 4)', () => {
  it('puts an older project into a "General" profile, followed by empty event profiles', () => {
    const { project } = normalizeProject({
      format: 'bhcf-project',
      schemaVersion: 3,
      trees: { library: ['a'], playlists: ['x', 'auto'] },
      presentations: { a: { name: 'Song', slides: [] } },
      playlists: {
        x: { name: 'Service', entries: [{ id: 'e', kind: 'presentation', presentationId: 'a' }] },
        // Created automatically by schema 3 and never used: dropped.
        auto: { name: 'Lifeclass', entries: [] }
      },
      media: { m: { fileName: 'm.png', kind: 'image' } },
      mediaPlaylists: { ml: { name: 'Images', kind: 'image', mediaIds: ['m'] } },
      mediaPlaylistOrder: ['ml']
    })
    expect(project.profileOrder.map((id) => project.profiles[id]?.name)).toEqual(['General', 'Sunday Celebration', 'Lifeclass', 'Thanksgiving'])
    const g = general(project)
    expect(g.name).toBe('General')
    expect(g.trees).toEqual({ library: ['a'], playlists: ['x'] })
    expect(g.mediaIds).toEqual(['m'])
    expect(g.mediaPlaylistOrder).toEqual(['ml'])
    expect(project.playlists.auto).toBeUndefined()
    const sunday = project.profiles[project.profileOrder[1] as string]
    expect(sunday?.trees).toEqual({ library: [], playlists: [] })
    expect(sunday?.mediaPlaylistOrder.map((id) => project.mediaPlaylists[id]?.kind)).toEqual(['image', 'background', 'video', 'audio'])
  })

  it('round-trips profiles and the active tab, recovering unlisted items into the first profile', () => {
    const { project } = normalizeProject({
      format: 'bhcf-project',
      schemaVersion: 4,
      profiles: {
        p1: { name: 'Sunday', trees: { library: ['a'], playlists: [] }, mediaIds: ['m', 'ghost'], mediaPlaylistOrder: [] },
        p2: { name: 'Lifeclass', trees: { library: ['a', 'b'], playlists: [] }, mediaIds: ['m'], mediaPlaylistOrder: [] }
      },
      profileOrder: ['p1', 'p2'],
      activeProfileId: 'p2',
      presentations: { a: { name: 'A', slides: [] }, b: { name: 'B', slides: [] }, c: { name: 'C', slides: [] } },
      media: { m: { fileName: 'm.png', kind: 'image' }, n: { fileName: 'n.png', kind: 'image' } }
    })
    expect(project.activeProfileId).toBe('p2')
    // "a" stays in the first profile that lists it; the unlisted "c" is recovered into p1.
    expect(project.profiles.p1?.trees.library).toEqual(['a', 'c'])
    expect(project.profiles.p2?.trees.library).toEqual(['b'])
    // Media may be shared; unknown ids are dropped and unlisted media goes to p1.
    expect(project.profiles.p1?.mediaIds).toEqual(['m', 'n'])
    expect(project.profiles.p2?.mediaIds).toEqual(['m'])
  })
})
