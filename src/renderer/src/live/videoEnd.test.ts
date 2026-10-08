import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createProject } from '@shared/model/factory'
import type { MediaAsset } from '@shared/model/types'
import { loadProject, unloadProject } from '../store/projectStore'
import { mediaSetLoop, playMedia, tickMedia } from './liveActions'
import { live } from './liveStore'

const asset = (id: string, kind: MediaAsset['kind'], durationSec: number | null): MediaAsset => ({
  id,
  name: id,
  kind,
  fileName: `${id}.webm`,
  originalName: `${id}.webm`,
  mimeType: kind === 'audio' ? 'audio/wav' : 'video/webm',
  sizeBytes: 1,
  width: 1920,
  height: 1080,
  durationSec,
  thumbnail: null,
  importedAt: new Date(0).toISOString()
})

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(1_000_000)
  const p = createProject('Test')
  p.media = { clip: asset('clip', 'video', 10), song: asset('song', 'audio', 5) }
  loadProject({ project: p, path: 'C:/x', repairs: [], recoveredFrom: null })
  live.set({ media: null, mediaContext: null, cursor: null, black: false })
})
afterEach(() => {
  vi.useRealTimers()
  unloadProject()
})

describe('when a video ends', () => {
  it('clears the cue so the output goes to black', () => {
    playMedia('clip')
    vi.setSystemTime(1_000_000 + 5_000)
    tickMedia()
    expect(live.get().media?.mediaId).toBe('clip')
    vi.setSystemTime(1_000_000 + 10_100)
    tickMedia()
    expect(live.get().media).toBeNull()
    // Black comes from an empty program, not the Black button: the next take shows normally.
    expect(live.get().black).toBe(false)
  })

  it('stops finished audio too, but never ends a looping video', () => {
    playMedia('song')
    vi.setSystemTime(1_000_000 + 5_100)
    tickMedia()
    expect(live.get().media).toBeNull()

    playMedia('clip')
    mediaSetLoop(true)
    vi.setSystemTime(1_000_000 + 60_000)
    tickMedia()
    expect(live.get().media).toMatchObject({ mediaId: 'clip', playing: true, loop: true })
  })
})
