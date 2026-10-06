import { produce } from 'immer'
import { describe, expect, it } from 'vitest'
import { createPresentation, createProject, createSlide } from '@shared/model/factory'
import type { Project } from '@shared/model/types'
import {
  addFolder,
  addPlaylist,
  addPlaylistEntries,
  addPresentation,
  copyName,
  deleteNode,
  duplicateNode,
  duplicateSlides,
  insertSlides,
  movePlaylistEntry,
  moveNode,
  moveSlides
} from './projectOps'
import { searchProject } from './search'
import { findParentId, flattenTree } from './tree'

const canvas = { width: 1920, height: 1080 }

function setup(): { p: Project; a: string; b: string; folder: string } {
  let a = ''
  let b = ''
  let folder = ''
  const p = produce(createProject('Test'), (d) => {
    folder = addFolder(d, 'library', 'Songs').id
    const pa = createPresentation('Amazing Grace', [createSlide(canvas, 'Amazing grace how sweet the sound')])
    const pb = createPresentation('Announcements', [createSlide(canvas, 'Welcome')])
    addPresentation(d, pa, folder)
    addPresentation(d, pb)
    a = pa.id
    b = pb.id
  })
  return { p, a, b, folder }
}

describe('tree operations', () => {
  it('moves items between folders and the root', () => {
    const { p, a, folder } = setup()
    const next = produce(p, (d) => {
      expect(moveNode(d, 'library', a, null, 0)).toBe(true)
    })
    expect(next.trees.library[0]).toBe(a)
    expect(next.folders[folder]?.childIds).toEqual([])
    // Original is untouched (structural sharing / immutability).
    expect(p.folders[folder]?.childIds).toEqual([a])
  })

  it('adjusts the index when moving down within the same parent', () => {
    const { p, b, folder } = setup()
    // root = [folder, b]; move folder to the end (insertion index 2) → [b, folder]
    const next = produce(p, (d) => {
      moveNode(d, 'library', folder, null, 2)
    })
    expect(next.trees.library).toEqual([b, folder])
  })

  it('refuses to move a folder into itself or a descendant', () => {
    const { p, folder } = setup()
    let ok = true
    const next = produce(p, (d) => {
      const inner = addFolder(d, 'library', 'Inner', folder)
      ok = moveNode(d, 'library', folder, inner.id, 0)
    })
    expect(ok).toBe(false)
    expect(next.trees.library).toContain(folder)
  })

  it('duplicates folders deeply with unique names', () => {
    const { p, folder } = setup()
    const next = produce(p, (d) => {
      duplicateNode(d, 'library', folder)
    })
    const rootFolders = next.trees.library.filter((id) => next.folders[id])
    expect(rootFolders).toHaveLength(2)
    const copy = next.folders[rootFolders[1] as string]
    expect(copy?.name).toBe('Songs copy')
    expect(copy?.childIds).toHaveLength(1)
    expect(copy?.childIds[0]).not.toBe(p.folders[folder]?.childIds[0])
    expect(Object.keys(next.presentations)).toHaveLength(3)
  })

  it('deleting a folder removes contents and playlist references', () => {
    const { p, a, b, folder } = setup()
    const next = produce(p, (d) => {
      const pl = addPlaylist(d, 'Sunday')
      addPlaylistEntries(d, pl.id, [
        { kind: 'presentation', presentationId: a },
        { kind: 'presentation', presentationId: b }
      ])
      deleteNode(d, 'library', folder)
    })
    expect(next.presentations[a]).toBeUndefined()
    expect(next.folders[folder]).toBeUndefined()
    const pl = Object.values(next.playlists)[0]
    expect(pl?.entries.map((e) => (e.kind === 'presentation' ? e.presentationId : ''))).toEqual([b])
  })

  it('flattens only expanded folders', () => {
    const { p, folder } = setup()
    expect(flattenTree(p, 'library', {})).toHaveLength(2)
    expect(flattenTree(p, 'library', { [folder]: true })).toHaveLength(3)
  })

  it('generates copy names', () => {
    expect(copyName('Song', [])).toBe('Song copy')
    expect(copyName('Song', ['Song copy', 'song copy 2'])).toBe('Song copy 3')
  })
})

describe('playlists', () => {
  it('reorders entries within a playlist', () => {
    const { p, a, b } = setup()
    let ids: string[] = []
    let pid = ''
    const p1 = produce(p, (d) => {
      pid = addPlaylist(d, 'Sunday').id
      ids = addPlaylistEntries(d, pid, [
        { kind: 'presentation', presentationId: a },
        { kind: 'header', title: 'Sermon', color: '#f00' },
        { kind: 'presentation', presentationId: b }
      ])
    })
    const p2 = produce(p1, (d) => movePlaylistEntry(d, pid, ids[0] as string, pid, 3))
    expect(p2.playlists[pid]?.entries.map((e) => e.id)).toEqual([ids[1], ids[2], ids[0]])
  })

  it('ignores entries for missing presentations', () => {
    const { p } = setup()
    const next = produce(p, (d) => {
      const pl = addPlaylist(d, 'X')
      addPlaylistEntries(d, pl.id, [{ kind: 'presentation', presentationId: 'nope' }])
    })
    expect(Object.values(next.playlists)[0]?.entries).toHaveLength(0)
  })

  it('keeps folder placement for playlists', () => {
    const { p } = setup()
    const next = produce(p, (d) => {
      const f = addFolder(d, 'playlists', 'Services')
      addPlaylist(d, 'Sunday AM', f.id)
    })
    const pl = Object.values(next.playlists)[0]
    expect(findParentId(next, 'playlists', pl?.id as string)).not.toBeNull()
  })
})

describe('slides', () => {
  it('moves a selection of slides preserving order', () => {
    const { p, b } = setup()
    const slides = ['1', '2', '3', '4'].map((t) => createSlide(canvas, t))
    const p1 = produce(p, (d) => insertSlides(d, b, slides, 0))
    const ids = p1.presentations[b]?.slides.map((s) => s.id) ?? []
    // move slides 0 and 2 to the end
    const p2 = produce(p1, (d) => moveSlides(d, b, [ids[0] as string, ids[2] as string], ids.length))
    expect(p2.presentations[b]?.slides.map((s) => s.id)).toEqual([ids[1], ids[3], ids[4], ids[0], ids[2]])
  })

  it('duplicates slides after the last selected one with fresh ids', () => {
    const { p, a } = setup()
    const src = p.presentations[a]?.slides[0]
    let copies: string[] = []
    const next = produce(p, (d) => {
      copies = duplicateSlides(d, a, [src?.id as string])
    })
    const slides = next.presentations[a]?.slides ?? []
    expect(slides).toHaveLength(2)
    expect(slides[1]?.id).toBe(copies[0])
    expect(slides[1]?.elements[0]?.id).not.toBe(src?.elements[0]?.id)
  })
})

describe('search', () => {
  it('finds presentations by name and by slide text, accent-insensitively', () => {
    const { p, a } = setup()
    expect(searchProject(p, 'amazing')[0]?.id).toBe(a)
    const byText = searchProject(p, 'SWEET sound')
    expect(byText[0]?.id).toBe(a)
    expect(byText[0]?.snippet).toContain('sweet')
    const accent = produce(p, (d) => {
      addPresentation(d, createPresentation('Jesús es Señor'))
    })
    expect(searchProject(accent, 'jesus senor')).toHaveLength(1)
  })
})
