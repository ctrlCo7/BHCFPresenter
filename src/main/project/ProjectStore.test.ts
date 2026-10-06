import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PROJECT_FILE, ProjectStore } from './ProjectStore'

let root: string

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'bhcf-test-'))
})
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

describe('ProjectStore', () => {
  it('creates, saves and reopens a project', async () => {
    const store = new ProjectStore()
    const created = await store.create(root, 'Sunday Service')
    expect(created.path).toBe(path.join(root, 'Sunday Service'))
    await store.save({ ...created.project, name: 'Renamed' })

    const reopened = await new ProjectStore().open(created.path)
    expect(reopened.project.name).toBe('Renamed')
    expect(reopened.recoveredFrom).toBeNull()
  })

  it('refuses to create a project in a non-empty folder', async () => {
    await fs.mkdir(path.join(root, 'Taken'))
    await fs.writeFile(path.join(root, 'Taken', 'x.txt'), 'x')
    await expect(new ProjectStore().create(root, 'Taken')).rejects.toThrow(/already exists/)
  })

  it('falls back to the previous save when the current file is corrupt', async () => {
    const store = new ProjectStore()
    const { project, path: dir } = await store.create(root, 'P')
    await store.save({ ...project, name: 'First save' })
    await store.save({ ...project, name: 'Second save' })
    await fs.writeFile(path.join(dir, PROJECT_FILE), '{ truncated')

    const reopened = await new ProjectStore().open(dir)
    expect(reopened.project.name).toBe('First save')
    expect(reopened.recoveredFrom).toBe('the previous save')
    // The recovered copy is promoted so the file is valid again.
    JSON.parse(await fs.readFile(path.join(dir, PROJECT_FILE), 'utf8'))
  })

  it('serialises concurrent saves so the last one wins', async () => {
    const store = new ProjectStore()
    const { project, path: dir } = await store.create(root, 'Race')
    await Promise.all(Array.from({ length: 20 }, (_, i) => store.save({ ...project, name: `v${i}` })))
    const reopened = await new ProjectStore().open(dir)
    expect(reopened.project.name).toBe('v19')
  })

  it('backs up and restores, keeping a pre-restore snapshot', async () => {
    const store = new ProjectStore()
    const { project } = await store.create(root, 'B')
    const backup = await store.backup({ ...project, name: 'Before' }, 'manual')
    const restored = await store.restoreBackup(backup.id, { ...project, name: 'Current' })
    expect(restored.project.name).toBe('Before')
    const list = await store.listBackups()
    expect(list.map((b) => b.reason)).toContain('before-restore')
  })

  it('save as copies media into a new project folder', async () => {
    const store = new ProjectStore()
    const { project, path: dir } = await store.create(root, 'Orig')
    await fs.writeFile(path.join(dir, 'media', 'a.png'), 'png')
    const copy = await store.saveAs(project, path.join(root, 'Copy'))
    expect(copy.project.name).toBe('Copy')
    expect(copy.project.id).not.toBe(project.id)
    expect(await fs.readFile(path.join(root, 'Copy', 'media', 'a.png'), 'utf8')).toBe('png')
    expect(store.current?.dir).toBe(path.join(root, 'Copy'))
  })
})
