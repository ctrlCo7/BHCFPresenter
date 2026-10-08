import { describe, expect, it } from 'vitest'
import { describeLibraryFile } from './FolderBackgroundsTab'

const d = (name: string): ReturnType<typeof describeLibraryFile> => describeLibraryFile({ name, kind: 'video', sizeBytes: 1 })

describe('backgrounds folder titles', () => {
  it('turns stock-video file names into a short title and quality', () => {
    expect(d('7077358-uhd_4096_2160_30fps.mp4')).toEqual({ title: '7077358', quality: '4K' })
    expect(d('15439665-uhd_4092_2160_30fps.mp4')).toEqual({ title: '15439665', quality: '4K' })
    expect(d('11499368-hd_1920_1080_30fps.mp4')).toEqual({ title: '11499368', quality: 'HD 1080p' })
    expect(d('14853298_1920_1080_24fps.mp4')).toEqual({ title: '14853298', quality: 'HD 1080p' })
    expect(d('3974180-hd_1280_720_60fps.mp4')).toEqual({ title: '3974180', quality: '720p' })
  })

  it('keeps ordinary names readable', () => {
    expect(d('Worship_Clouds-loop.mp4')).toEqual({ title: 'Worship Clouds loop', quality: null })
  })
})
