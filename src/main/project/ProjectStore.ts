/**
 * On-disk project storage.
 *
 * A project is a folder:
 *
 *   <Name>/
 *     project.bhcf          current document (JSON, written atomically)
 *     project.bhcf.bak      the previous save, used if the current file is unreadable
 *     media/                imported media files (referenced by MediaAsset.fileName)
 *     backups/              timestamped snapshots (session start, periodic, manual, pre-restore)
 *
 * This module has no Electron dependency so it can be unit-tested with plain Node.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createProject } from '../../shared/model/factory'
import { normalizeProject } from '../../shared/model/normalize'
import { PROJECT_FORMAT, type Project } from '../../shared/model/types'
import type { BackupInfo, OpenedProject, SaveResult } from '../../shared/ipc'
import { AppError, exists, readJson, sanitizeFileName, writeFileAtomic } from '../util/fsx'

export const PROJECT_FILE = 'project.bhcf'
export const PROJECT_EXT = '.bhcf'
const BACKUP_FILE_SUFFIX = '.json'
const MAX_BACKUPS = 40
const PERIODIC_BACKUP_MS = 10 * 60 * 1000

export interface ProjectPaths {
  dir: string
  file: string
  previous: string
  media: string
  backups: string
}

export function projectPaths(dir: string): ProjectPaths {
  return {
    dir,
    file: path.join(dir, PROJECT_FILE),
    previous: path.join(dir, PROJECT_FILE + '.bak'),
    media: path.join(dir, 'media'),
    backups: path.join(dir, 'backups')
  }
}

/** Accepts either a project folder or the project.bhcf inside it. */
export function resolveProjectDir(input: string): string {
  const resolved = path.resolve(input)
  return path.extname(resolved).toLowerCase() === PROJECT_EXT ? path.dirname(resolved) : resolved
}

function serialize(project: Project): string {
  return JSON.stringify(project, null, 1)
}

function assertProjectShape(value: unknown): asserts value is Project {
  const v = value as Partial<Project> | null
  if (!v || typeof v !== 'object' || v.format !== PROJECT_FORMAT || typeof v.id !== 'string') {
    throw new AppError('INVALID_PROJECT', 'Refusing to save: the project data is malformed.')
  }
}

export class ProjectStore {
  private paths: ProjectPaths | null = null
  private lastBackupAt = 0
  /** Saves are serialised; a save never overlaps another write to the same project. */
  private queue: Promise<unknown> = Promise.resolve()

  get current(): ProjectPaths | null {
    return this.paths
  }

  requireOpen(): ProjectPaths {
    if (!this.paths) throw new AppError('NO_PROJECT', 'No project is open.')
    return this.paths
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task)
    this.queue = run.catch(() => undefined)
    return run
  }

  async create(parentDir: string, name: string): Promise<OpenedProject> {
    const cleanName = sanitizeFileName(name.trim(), '')
    if (!cleanName) throw new AppError('INVALID_NAME', 'Please enter a valid project name.')
    const dir = path.join(parentDir, cleanName)
    if (await exists(dir)) {
      const entries = await fs.readdir(dir)
      if (entries.length > 0) throw new AppError('EXISTS', `A folder named "${cleanName}" already exists in that location.`)
    }
    const p = projectPaths(dir)
    await fs.mkdir(p.media, { recursive: true })
    await fs.mkdir(p.backups, { recursive: true })
    const project = createProject(name.trim())
    await writeFileAtomic(p.file, serialize(project))
    this.paths = p
    this.lastBackupAt = Date.now()
    return { project, path: dir, repairs: [], recoveredFrom: null }
  }

  async open(input: string): Promise<OpenedProject> {
    const dir = resolveProjectDir(input)
    const p = projectPaths(dir)
    if (!(await exists(dir))) throw new AppError('NOT_FOUND', `The project folder no longer exists:\n${dir}`)

    const candidates: { file: string; label: string | null }[] = [
      { file: p.file, label: null },
      { file: p.previous, label: 'the previous save' }
    ]
    for (const b of await this.readBackupList(p)) {
      candidates.push({ file: path.join(p.backups, b.id + BACKUP_FILE_SUFFIX), label: `backup ${b.createdAt}` })
    }

    let firstError: unknown = null
    for (const c of candidates) {
      try {
        const raw = await readJson(c.file)
        const { project, repairs } = normalizeProject(raw)
        await fs.mkdir(p.media, { recursive: true })
        await fs.mkdir(p.backups, { recursive: true })
        this.paths = p
        this.lastBackupAt = 0
        // A fresh snapshot each session lets the user roll back anything done today.
        await this.writeBackup(p, project, c.label ? 'recovered' : 'session-start')
        if (c.label) {
          // Promote the recovered copy so the next launch opens cleanly.
          await writeFileAtomic(p.file, serialize(project))
        }
        return { project, path: dir, repairs, recoveredFrom: c.label }
      } catch (err) {
        if (firstError === null) firstError = err
        // A newer-schema file must not be silently replaced by an older backup.
        if ((err as Error).name === 'ProjectFormatError' && /newer version/.test((err as Error).message)) throw err
      }
    }
    if ((firstError as NodeJS.ErrnoException)?.code === 'ENOENT') {
      throw new AppError('NOT_A_PROJECT', `No ${PROJECT_FILE} was found in:\n${dir}`)
    }
    throw new AppError('UNREADABLE', `The project could not be read and no usable backup was found.\n${(firstError as Error)?.message ?? ''}`)
  }

  save(project: unknown): Promise<SaveResult> {
    assertProjectShape(project)
    const p = this.requireOpen()
    return this.enqueue(async () => {
      const toWrite: Project = { ...project, updatedAt: new Date().toISOString() }
      await writeFileAtomic(p.file, serialize(toWrite), p.previous)
      if (Date.now() - this.lastBackupAt > PERIODIC_BACKUP_MS) await this.writeBackup(p, toWrite, 'periodic')
      return { savedAt: toWrite.updatedAt }
    })
  }

  /** Copies the project (including media) into `targetDir` and switches to the copy. */
  saveAs(project: unknown, targetDir: string): Promise<OpenedProject> {
    assertProjectShape(project)
    const source = this.requireOpen()
    return this.enqueue(async () => {
      const dir = path.resolve(targetDir)
      if (path.resolve(source.dir) === dir) throw new AppError('SAME_LOCATION', 'Choose a different location for the copy.')
      if ((await exists(dir)) && (await fs.readdir(dir)).length > 0) {
        throw new AppError('EXISTS', 'The chosen folder is not empty. Pick a new folder name.')
      }
      const p = projectPaths(dir)
      await fs.mkdir(p.backups, { recursive: true })
      if (await exists(source.media)) await fs.cp(source.media, p.media, { recursive: true })
      else await fs.mkdir(p.media, { recursive: true })
      const now = new Date().toISOString()
      const copy: Project = { ...project, id: globalThis.crypto.randomUUID(), name: path.basename(dir), createdAt: now, updatedAt: now }
      await writeFileAtomic(p.file, serialize(copy))
      this.paths = p
      this.lastBackupAt = Date.now()
      return { project: copy, path: dir, repairs: [], recoveredFrom: null }
    })
  }

  backup(project: unknown, reason: string): Promise<BackupInfo> {
    assertProjectShape(project)
    const p = this.requireOpen()
    return this.enqueue(() => this.writeBackup(p, project, reason))
  }

  async listBackups(): Promise<BackupInfo[]> {
    return this.readBackupList(this.requireOpen())
  }

  restoreBackup(backupId: string, current: unknown): Promise<OpenedProject> {
    assertProjectShape(current)
    const p = this.requireOpen()
    if (!/^[\w.-]+$/.test(backupId)) throw new AppError('INVALID_BACKUP', 'Invalid backup id.')
    return this.enqueue(async () => {
      const file = path.join(p.backups, backupId + BACKUP_FILE_SUFFIX)
      const { project, repairs } = normalizeProject(await readJson(file))
      // Never lose the state being replaced.
      await this.writeBackup(p, current, 'before-restore')
      await writeFileAtomic(p.file, serialize(project), p.previous)
      return { project, path: p.dir, repairs, recoveredFrom: null }
    })
  }

  close(): void {
    this.paths = null
  }

  private async writeBackup(p: ProjectPaths, project: Project, reason: string): Promise<BackupInfo> {
    const createdAt = new Date()
    const safeReason = reason.replace(/[^a-z0-9-]/gi, '').slice(0, 32) || 'manual'
    const id = `${createdAt.toISOString().replace(/[:.]/g, '-')}_${safeReason}`
    const data = serialize(project)
    await writeFileAtomic(path.join(p.backups, id + BACKUP_FILE_SUFFIX), data)
    this.lastBackupAt = createdAt.getTime()
    await this.pruneBackups(p)
    return { id, createdAt: createdAt.toISOString(), reason: safeReason, sizeBytes: Buffer.byteLength(data) }
  }

  private async readBackupList(p: ProjectPaths): Promise<BackupInfo[]> {
    let names: string[]
    try {
      names = await fs.readdir(p.backups)
    } catch {
      return []
    }
    const out: BackupInfo[] = []
    for (const name of names) {
      const m = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z_([\w-]+)\.json$/.exec(name)
      if (!m) continue
      const stat = await fs.stat(path.join(p.backups, name)).catch(() => null)
      if (!stat) continue
      out.push({
        id: name.slice(0, -BACKUP_FILE_SUFFIX.length),
        createdAt: `${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`,
        reason: m[6] ?? 'manual',
        sizeBytes: stat.size
      })
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  private async pruneBackups(p: ProjectPaths): Promise<void> {
    const list = await this.readBackupList(p)
    for (const old of list.slice(MAX_BACKUPS)) {
      await fs.rm(path.join(p.backups, old.id + BACKUP_FILE_SUFFIX), { force: true }).catch(() => undefined)
    }
  }
}
