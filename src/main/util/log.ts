/**
 * File logger: one file per day in <userData>/logs, kept for 14 days. Console output is
 * preserved for development. Writes are appended asynchronously and never throw.
 */
import { appendFile, mkdir, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { app } from 'electron'

type Level = 'info' | 'warn' | 'error'
const KEEP_DAYS = 14

let dir: string | null = null
let chain: Promise<void> = Promise.resolve()

export function logsDir(): string {
  dir ??= path.join(app.getPath('userData'), 'logs')
  return dir
}

function format(parts: unknown[]): string {
  return parts
    .map((p) => (p instanceof Error ? `${p.message}\n${p.stack ?? ''}` : typeof p === 'string' ? p : JSON.stringify(p)))
    .join(' ')
}

export function log(level: Level, ...parts: unknown[]): void {
  const line = `${new Date().toISOString()} [${level.toUpperCase()}] ${format(parts)}\n`
  if (level === 'error') console.error(line.trimEnd())
  else if (level === 'warn') console.warn(line.trimEnd())
  else console.log(line.trimEnd())
  const file = path.join(logsDir(), `bhcf-${new Date().toISOString().slice(0, 10)}.log`)
  chain = chain
    .then(() => mkdir(logsDir(), { recursive: true }))
    .then(() => appendFile(file, line, 'utf8'))
    .catch(() => undefined)
}

export function installCrashLogging(): void {
  process.on('uncaughtException', (err) => log('error', 'Uncaught exception:', err))
  process.on('unhandledRejection', (reason) => log('error', 'Unhandled rejection:', reason))
  void pruneOldLogs()
}

async function pruneOldLogs(): Promise<void> {
  try {
    const cutoff = Date.now() - KEEP_DAYS * 86_400_000
    for (const name of await readdir(logsDir())) {
      const m = /^bhcf-(\d{4}-\d{2}-\d{2})\.log$/.exec(name)
      if (m && Date.parse(m[1] as string) < cutoff) await rm(path.join(logsDir(), name), { force: true })
    }
  } catch {
    /* no logs yet */
  }
}
