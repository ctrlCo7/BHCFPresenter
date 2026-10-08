import { produce } from 'immer'
import { describe, expect, it } from 'vitest'
import { isValidMediaFileName, mediaBaseName } from '@shared/media'
import { createProject } from '@shared/model/factory'
import { normalizeProject } from '@shared/model/normalize'
import type { MediaAsset, Project } from '@shared/model/types'
import { addMediaAssets, addToMediaPlaylist, hiddenFromAllMedia, pwBackgroundsPlaylist } from '../../engine/projectOps'
import { activeProfile } from '../../engine/tree'
import { isTemplateBackground } from './pwBackgrounds'

function asset(id: string, fileName: string, originalName: string, sizeBytes = 100): MediaAsset {
  const kind = /\.png$/.test(fileName) ? 'image' : 'video'
  return { id, name: id, kind, fileName, originalName, mimeType: 'video/webm', sizeBytes, width: null, height: null, durationSec: null, thumbnail: null, importedAt: '2026-01-01T00:00:00.000Z' }
}

describe('P&W Backgrounds file names', () => {
  it('allows bare names and the P&W Backgrounds subfolder only', () => {
    expect(isValidMediaFileName('clip-1234abcd.mp4')).toBe(true)
    expect(isValidMediaFileName('P&W Backgrounds/Soft Bokeh (Blue)-68c490c2.webm')).toBe(true)
    expect(isValidMediaFileName('other/clip.mp4')).toBe(false)
    expect(isValidMediaFileName('P&W Backgrounds/../project.bhcf')).toBe(false)
    expect(isValidMediaFileName('P&W Backgrounds/..')).toBe(false)
    expect(isValidMediaFileName('..\\x.mp4')).toBe(false)
    expect(mediaBaseName('P&W Backgrounds/a.webm')).toBe('a.webm')
  })
})

describe('recognising Templates backgrounds', () => {
  const library = new Set(['7077358-uhd_4096_2160_30fps.mp4|500'])
  it('finds My Backgrounds files', () => {
    expect(isTemplateBackground(asset('c', '7077358-uhd_4096_2160_30fps-5a64ece5.mp4', '7077358-uhd_4096_2160_30fps.mp4', 500), library)).toBe(true)
  })
  it('leaves the user’s own imports and already-moved files alone', () => {
    expect(isTemplateBackground(asset('d', 'Cross Loops-b62f5666.mp4', 'Cross Loops.mp4'), library)).toBe(false)
    expect(isTemplateBackground(asset('e', 'my-clip-1234abcd.webm', 'my-clip.webm'), library)).toBe(false)
    // Same name as a folder file but a different size: not that file.
    expect(isTemplateBackground(asset('f', '7077358-uhd_4096_2160_30fps-11111111.mp4', '7077358-uhd_4096_2160_30fps.mp4', 9), library)).toBe(false)
    expect(isTemplateBackground(asset('g', 'P&W Backgrounds/x-68c490c2.webm', 'x-68c490c2.webm'), library)).toBe(false)
  })
})

describe('P&W Backgrounds playlist', () => {
  it('is created once per profile, after Backgrounds, and hides its items from All Media', () => {
    const p = produce(createProject('Test'), (d) => {
      addMediaAssets(d, [asset('m1', 'P&W Backgrounds/a-12345678.webm', 'a-12345678.webm'), asset('m2', 'b-12345678.mp4', 'b.mp4')])
      addToMediaPlaylist(d, pwBackgroundsPlaylist(d).id, ['m1'])
      addToMediaPlaylist(d, pwBackgroundsPlaylist(d).id, ['m1'])
    })
    const order = activeProfile(p).mediaPlaylistOrder.map((id) => p.mediaPlaylists[id])
    const pw = order.filter((pl) => pl?.role === 'pw-backgrounds')
    expect(pw).toHaveLength(1)
    expect(pw[0]?.name).toBe('P&W Backgrounds')
    expect(pw[0]?.mediaIds).toEqual(['m1'])
    expect(order[order.indexOf(pw[0]) - 1]?.name).toBe('Backgrounds')
    expect([...hiddenFromAllMedia(p)]).toEqual(['m1'])
  })

  it('survives saving and loading', () => {
    const p: Project = produce(createProject('Test'), (d) => {
      addMediaAssets(d, [asset('m1', 'P&W Backgrounds/a-12345678.webm', 'a-12345678.webm')])
      addToMediaPlaylist(d, pwBackgroundsPlaylist(d).id, ['m1'])
    })
    const loaded = normalizeProject(JSON.parse(JSON.stringify(p))).project
    expect(loaded.media.m1?.fileName).toBe('P&W Backgrounds/a-12345678.webm')
    expect([...hiddenFromAllMedia(loaded)]).toEqual(['m1'])
  })
})
