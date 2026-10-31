import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const fetchMock = vi.fn()
vi.mock('electron', () => ({ net: { fetch: (...args: unknown[]) => fetchMock(...args) } }))
vi.mock('../util/log', () => ({ log: () => undefined }))

const { downloadOnline, pageOf, searchOnline } = await import('./OnlineBackgrounds')

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const jpeg = (): Response => new Response(new Uint8Array([0xff, 0xd8, 0xff]), { headers: { 'content-type': 'image/jpeg' } })

afterEach(() => fetchMock.mockReset())

describe('online backgrounds', () => {
  it('searches Pexels with the key and picks the HD file', async () => {
    fetchMock.mockImplementation(async (url: string, init?: { headers?: Record<string, string> }) => {
      if (url.startsWith('https://api.pexels.com/')) {
        expect(init?.headers?.Authorization).toBe('pex-key')
        expect(url).toContain('query=light+rays')
        return json({
          total_results: 1,
          videos: [
            {
              id: 42,
              url: 'https://www.pexels.com/video/light-rays-through-clouds-42/',
              image: 'https://images.pexels.com/videos/42/preview.jpg',
              duration: 15,
              user: { name: 'Ann' },
              video_files: [
                { link: 'https://videos.pexels.com/42-uhd.mp4', width: 3840, height: 2160, file_type: 'video/mp4' },
                { link: 'https://videos.pexels.com/42-hd.mp4', width: 1920, height: 1080, file_type: 'video/mp4' },
                { link: 'https://videos.pexels.com/42-sd.mp4', width: 960, height: 540, file_type: 'video/mp4' }
              ]
            }
          ]
        })
      }
      return jpeg()
    })
    const { results, total } = await searchOnline('pexels', 'pex-key', 'light rays', 1)
    expect(total).toBe(1)
    expect(results[0]).toMatchObject({ id: 'pexels-42', title: 'Light rays through clouds', author: 'Ann', width: 1920, height: 1080, durationSec: 15 })
    expect(results[0]?.thumbnail).toMatch(/^data:image\/jpeg;base64,/)
    // The download address never reaches the window.
    expect(JSON.stringify(results)).not.toContain('42-hd.mp4')
    expect(pageOf('pexels-42')).toBe('https://www.pexels.com/video/light-rays-through-clouds-42/')
  })

  it('searches Pixabay and explains a rejected key', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('key=bad')) return json({}, 403)
      if (url.startsWith('https://pixabay.com/api/videos/')) {
        return json({ totalHits: 1, hits: [{ id: 7, pageURL: 'https://pixabay.com/videos/id-7/', tags: 'cross, sunset, faith, sky', duration: 20, user: 'Ben', videos: { large: { url: 'https://cdn.pixabay.com/7-large.mp4', width: 1920, height: 1080 }, medium: { url: 'https://cdn.pixabay.com/7-medium.mp4', width: 1280, height: 720, thumbnail: 'https://cdn.pixabay.com/7.jpg' } } }] })
      }
      return jpeg()
    })
    const { results } = await searchOnline('pixabay', 'good', 'cross', 1)
    expect(results[0]).toMatchObject({ id: 'pixabay-7', title: 'cross, sunset, faith', author: 'Ben', width: 1920 })
    await expect(searchOnline('pixabay', 'bad', 'cross', 1)).rejects.toThrow(/API key was not accepted/)
    await expect(searchOnline('pixabay', '', 'cross', 1)).rejects.toThrow(/API key first/)
  })

  it('downloads only searched videos, into the Online folder', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'bhcf-online-'))
    try {
      fetchMock.mockImplementation(async (url: string) => (url.endsWith('.mp4') ? new Response(new Uint8Array([1, 2, 3, 4]), { headers: { 'content-length': '4' } }) : json({ total_results: 1, videos: [{ id: 9, url: 'https://www.pexels.com/video/golden-light-9/', video_files: [{ link: 'https://videos.pexels.com/9.mp4', width: 1920, file_type: 'video/mp4' }] }] })))
      await searchOnline('pexels', 'k', 'gold', 1)
      const progress: number[] = []
      const name = await downloadOnline(dir, 'pexels-9', (p) => progress.push(p))
      expect(name).toBe('Online/Golden light (Pexels 9).mp4')
      expect([...readFileSync(path.join(dir, name))]).toEqual([1, 2, 3, 4])
      expect(progress.at(-1)).toBe(100)
      // A second request reuses the file.
      expect(await downloadOnline(dir, 'pexels-9', () => undefined)).toBe(name)
      await expect(downloadOnline(dir, 'pexels-nope', () => undefined)).rejects.toThrow(/Search again/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
