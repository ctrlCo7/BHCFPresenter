import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { builtInsNotIn, copyFolderIntoLibrary, copyIntoLibrary, folderAccessMessage, listLibraryDir, resolveLibraryFile } from './BackgroundLibrary'

let root: string
const put = (rel: string, bytes = 4): void => {
  const file = path.join(root, ...rel.split('/'))
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, Buffer.alloc(bytes))
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'bhcf-bg-'))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('backgrounds folder', () => {
  it('lists videos and images in subfolders, skipping audio, hidden files and other files', async () => {
    const dir = path.join(root, 'Backgrounds')
    put('Backgrounds/Clouds.MP4')
    put('Backgrounds/Worship/Loop 2.mov')
    put('Backgrounds/Worship/Deep/Still.jpg')
    put('Backgrounds/song.mp3')
    put('Backgrounds/.hidden.mp4')
    put('Backgrounds/notes.txt')
    const listing = await listLibraryDir(dir)
    expect(listing.exists).toBe(true)
    expect(listing.error).toBeNull()
    expect(listing.files.map((f) => [f.name, f.kind])).toEqual([
      ['Clouds.MP4', 'video'],
      ['Worship/Deep/Still.jpg', 'image'],
      ['Worship/Loop 2.mov', 'video']
    ])
  })

  it('reports video formats it cannot play', async () => {
    const dir = path.join(root, 'Backgrounds')
    put('Backgrounds/a.mkv')
    put('Backgrounds/Old/b.avi')
    put('Backgrounds/ok.mp4')
    const listing = await listLibraryDir(dir)
    expect(listing.files).toHaveLength(1)
    expect(listing.unsupported.count).toBe(2)
    expect([...listing.unsupported.examples].sort()).toEqual(['Old/b.avi', 'a.mkv'])
  })

  it('tells a missing folder apart from one it may not read', async () => {
    expect((await listLibraryDir(path.join(root, 'nope'))).exists).toBe(false)
    put('file.mp4')
    const notDir = await listLibraryDir(path.join(root, 'file.mp4'))
    expect(notDir.exists).toBe(true)
    expect(notDir.error).toMatch(/not a folder/)
    expect(folderAccessMessage('EPERM', 'darwin')).toMatch(/Privacy & Security/)
  })

  it('resolves listed names inside the folder only', () => {
    expect(resolveLibraryFile(root, 'Worship/Loop.mp4')).toBe(path.join(root, 'Worship', 'Loop.mp4'))
    for (const bad of ['../x.mp4', 'a/../../x.mp4', '/etc/passwd', 'a\\b.mp4', '', 'a//b.mp4', 42]) {
      expect(() => resolveLibraryFile(root, bad)).toThrow(/Invalid file name/)
    }
  })

  it('copies picked files in, never overwriting a different file of the same name', async () => {
    const dir = path.join(root, 'Backgrounds')
    put('Downloads/Clouds.mp4', 10)
    put('Other/Clouds.mp4', 20)
    put('Downloads/track.mp3')
    const first = await copyIntoLibrary(dir, [path.join(root, 'Downloads', 'Clouds.mp4'), path.join(root, 'Downloads', 'track.mp3')])
    expect(first.added).toBe(1)
    expect(first.skipped.map((s) => s.name)).toEqual(['track.mp3'])
    // The same file again is already there; a different one with that name gets " (2)".
    const again = await copyIntoLibrary(dir, [path.join(root, 'Downloads', 'Clouds.mp4'), path.join(root, 'Other', 'Clouds.mp4')])
    expect(again.added).toBe(2)
    expect(readdirSync(dir).sort()).toEqual(['Clouds (2).mp4', 'Clouds.mp4'])
  })

  it('adds a whole folder, subfolders included, under its own name', async () => {
    const dir = path.join(root, 'Backgrounds')
    put('Downloads/Worship/Calm.mp4')
    put('Downloads/Worship/Fast/Lights.mov')
    put('Downloads/Worship/song.mp3')
    put('Downloads/Worship/old.avi')
    const res = await copyFolderIntoLibrary(dir, path.join(root, 'Downloads', 'Worship'))
    expect(res.added).toBe(2)
    expect(res.skipped.map((s) => s.name)).toEqual(['old.avi'])
    expect((await listLibraryDir(dir)).files.map((f) => f.name)).toEqual(['Worship/Calm.mp4', 'Worship/Fast/Lights.mov'])
    // The backgrounds folder itself (or a folder inside it) is not copied into itself.
    expect((await copyFolderIntoLibrary(dir, path.join(dir, 'Worship'))).added).toBe(0)
    expect((await copyFolderIntoLibrary(dir, path.join(root, 'Empty'))).skipped).toHaveLength(1)
  })

  it('hides built-in backgrounds the folder already has', async () => {
    put('Backgrounds/7762075-hd_1920_1080_25fps.mp4', 30)
    const listing = await listLibraryDir(path.join(root, 'Backgrounds'))
    const builtIn = [
      { name: 'Purple Haze.mp4', kind: 'video' as const, sizeBytes: 30 },
      { name: 'Gold Dust.mp4', kind: 'video' as const, sizeBytes: 40 }
    ]
    expect(builtInsNotIn(listing, builtIn).map((f) => f.name)).toEqual(['Gold Dust.mp4'])
  })
})
