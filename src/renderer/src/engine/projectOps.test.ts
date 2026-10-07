import { produce } from 'immer'
import { describe, expect, it } from 'vitest'
import { createPresentation, createProject, createSlide } from '@shared/model/factory'
import type { Project } from '@shared/model/types'
import {
  addFolder,
  addMediaPlaylist,
  addToMediaPlaylist,
  deleteMediaPlaylist,
  moveInMediaPlaylist,
  removeFromMediaPlaylist,
  removeMediaAssets,
  addMediaAssets,
  addProfile,
  deleteProfile,
  removeMediaFromProfile,
  sendNodeToProfile,
  setActiveProfile,
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
import { activeProfile, findParentId, flattenTree, idsInProfile } from './tree'

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
    expect(activeProfile(next).trees.library[0]).toBe(a)
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
    expect(activeProfile(next).trees.library).toEqual([b, folder])
  })

  it('refuses to move a folder into itself or a descendant', () => {
    const { p, folder } = setup()
    let ok = true
    const next = produce(p, (d) => {
      const inner = addFolder(d, 'library', 'Inner', folder)
      ok = moveNode(d, 'library', folder, inner.id, 0)
    })
    expect(ok).toBe(false)
    expect(activeProfile(next).trees.library).toContain(folder)
  })

  it('duplicates folders deeply with unique names', () => {
    const { p, folder } = setup()
    const next = produce(p, (d) => {
      duplicateNode(d, 'library', folder)
    })
    const rootFolders = activeProfile(next).trees.library.filter((id) => next.folders[id])
    expect(rootFolders).toHaveLength(2)
    const copy = next.folders[rootFolders[1] as string]
    expect(copy?.name).toBe('Songs copy')
    expect(copy?.childIds).toHaveLength(1)
    expect(copy?.childIds[0]).not.toBe(p.folders[folder]?.childIds[0])
    expect(Object.keys(next.presentations)).toHaveLength(3)
  })

  it('deleting a folder removes contents and playlist references', () => {
    const { p, a, b, folder } = setup()
    let plId = ''
    const next = produce(p, (d) => {
      const pl = addPlaylist(d, 'Sunday')
      plId = pl.id
      addPlaylistEntries(d, pl.id, [
        { kind: 'presentation', presentationId: a },
        { kind: 'presentation', presentationId: b }
      ])
      deleteNode(d, 'library', folder)
    })
    expect(next.presentations[a]).toBeUndefined()
    expect(next.folders[folder]).toBeUndefined()
    const pl = next.playlists[plId]
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
    let id = ''
    const next = produce(p, (d) => {
      const pl = addPlaylist(d, 'X')
      id = pl.id
      addPlaylistEntries(d, pl.id, [{ kind: 'presentation', presentationId: 'nope' }])
    })
    expect(next.playlists[id]?.entries).toHaveLength(0)
  })

  it('keeps folder placement for playlists', () => {
    const { p } = setup()
    let id = ''
    const next = produce(p, (d) => {
      const f = addFolder(d, 'playlists', 'Services')
      id = addPlaylist(d, 'Sunday AM', f.id).id
    })
    expect(findParentId(next, 'playlists', id)).not.toBeNull()
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

describe('media playlists', () => {
  const asset = (id: string, kind: 'image' | 'video' | 'audio') => ({ id, kind, name: id, fileName: `${id}.bin` }) as unknown as Project['media'][string]

  it('starts new projects with event profiles, each with Images, Backgrounds, Videos and Audio playlists', () => {
    const p = createProject('T')
    expect(p.profileOrder.map((id) => p.profiles[id]?.name)).toEqual(['Sunday Celebration', 'Lifeclass', 'Thanksgiving'])
    expect(p.activeProfileId).toBe(p.profileOrder[0])
    for (const id of p.profileOrder) {
      const order = p.profiles[id]?.mediaPlaylistOrder ?? []
      expect(order.map((m) => p.mediaPlaylists[m]?.kind)).toEqual(['image', 'background', 'video', 'audio'])
    }
  })

  it('adds only media of the playlist kind, once, and keeps order on reorder', () => {
    let pid = ''
    const p = produce(createProject('T'), (d) => {
      d.media.v1 = asset('v1', 'video')
      d.media.v2 = asset('v2', 'video')
      d.media.i1 = asset('i1', 'image')
      pid = addMediaPlaylist(d, 'Loops', 'video').id
      expect(addToMediaPlaylist(d, pid, ['v1', 'i1', 'v2', 'v1'])).toEqual(['v1', 'v2'])
      expect(addToMediaPlaylist(d, pid, ['v1'])).toEqual([])
      moveInMediaPlaylist(d, pid, ['v2'], 'v1')
    })
    expect(p.mediaPlaylists[pid]?.mediaIds).toEqual(['v2', 'v1'])
    const p2 = produce(p, (d) => removeMediaAssets(d, ['v2']))
    expect(p2.mediaPlaylists[pid]?.mediaIds).toEqual(['v1'])
    const p3 = produce(p2, (d) => {
      moveInMediaPlaylist(d, pid, ['v1'], null)
      removeFromMediaPlaylist(d, pid, ['v1'])
      deleteMediaPlaylist(d, pid)
    })
    expect(p3.mediaPlaylists[pid]).toBeUndefined()
    expect(activeProfile(p3).mediaPlaylistOrder).not.toContain(pid)
  })
})

describe('background playlists', () => {
  it('accept images and videos but not audio', () => {
    let id = ''
    produce(createProject('T'), (d) => {
      d.media.i = { id: 'i', kind: 'image' } as Project['media'][string]
      d.media.v = { id: 'v', kind: 'video' } as Project['media'][string]
      d.media.a = { id: 'a', kind: 'audio' } as Project['media'][string]
      id = addMediaPlaylist(d, 'Loops', 'background').id
      expect(addToMediaPlaylist(d, id, ['i', 'v', 'a'])).toEqual(['i', 'v'])
    })
    expect(id).not.toBe('')
  })
})

describe('profiles', () => {
  const asset = (id: string) => ({ id, kind: 'image', name: id, fileName: `${id}.png` }) as unknown as Project['media'][string]

  it("keeps each profile's pages and media separate", () => {
    const { p, a } = setup()
    const first = p.activeProfileId
    const second = p.profileOrder[1] as string
    const next = produce(p, (d) => {
      addMediaAssets(d, [asset('m1')])
      setActiveProfile(d, second)
      addMediaAssets(d, [asset('m2')])
    })
    expect(next.profiles[first]?.mediaIds).toEqual(['m1'])
    expect(next.profiles[second]?.mediaIds).toEqual(['m2'])
    // The tree helpers only see the active profile.
    expect(idsInProfile(next, 'library').has(a)).toBe(false)
    expect(flattenTree(next, 'library', {})).toHaveLength(0)
  })

  it('copies and moves pages to another profile, sharing the media they use', () => {
    const { p, b } = setup()
    const second = p.profileOrder[1] as string
    let copy: string | null = null
    const next = produce(p, (d) => {
      addMediaAssets(d, [asset('bg')])
      const pres = d.presentations[b]
      if (pres?.slides[0]) pres.slides[0].background = { type: 'image', mediaId: 'bg', fit: 'cover' }
      copy = sendNodeToProfile(d, 'library', b, second, 'copy')
    })
    expect(copy).not.toBe(b)
    expect(next.profiles[second]?.trees.library).toEqual([copy])
    expect(next.profiles[second]?.mediaIds).toEqual(['bg'])
    expect(idsInProfile(next, 'library').has(b)).toBe(true)

    const moved = produce(next, (d) => {
      sendNodeToProfile(d, 'library', b, second, 'move')
    })
    expect(idsInProfile(moved, 'library').has(b)).toBe(false)
    expect(moved.profiles[second]?.trees.library).toEqual([copy, b])
  })

  it('removes media only from the active profile while another still uses it', () => {
    const { p } = setup()
    const second = p.profileOrder[1] as string
    let gone: string[] = []
    const next = produce(p, (d) => {
      addMediaAssets(d, [asset('shared')])
      d.profiles[second]?.mediaIds.push('shared')
      gone = removeMediaFromProfile(d, ['shared'])
    })
    expect(gone).toEqual([])
    expect(next.media.shared).toBeDefined()
    expect(activeProfile(next).mediaIds).toEqual([])
    const after = produce(next, (d) => {
      setActiveProfile(d, second)
      gone = removeMediaFromProfile(d, ['shared'])
    })
    expect(gone).toEqual(['shared'])
    expect(after.media.shared).toBeUndefined()
  })

  it('adds and deletes profiles with their contents, never the last one', () => {
    const { p, a } = setup()
    const first = p.activeProfileId
    let added = ''
    const next = produce(p, (d) => {
      added = addProfile(d, 'Youth Service').id
      deleteProfile(d, first)
    })
    expect(next.profiles[first]).toBeUndefined()
    expect(next.presentations[a]).toBeUndefined()
    expect(next.profileOrder).toContain(added)
    expect(next.profileOrder).not.toContain(first)
    expect(next.activeProfileId).toBe(next.profileOrder[0])
    const only = produce(next, (d) => {
      for (const id of [...d.profileOrder]) deleteProfile(d, id)
    })
    expect(only.profileOrder).toHaveLength(1)
  })
})
