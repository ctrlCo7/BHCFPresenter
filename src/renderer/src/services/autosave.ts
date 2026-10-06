/**
 * Autosave: every change is written to disk shortly after it happens.
 *
 * - Debounced (SAVE_DELAY_MS) so typing or dragging doesn't hammer the disk, but capped by
 *   MAX_WAIT_MS so a continuous stream of edits still gets saved.
 * - Only one save is in flight at a time; changes made during a save trigger a follow-up.
 * - Failures are retried with back-off and surfaced in the status bar.
 * - `flushSave()` is awaited before closing the window, switching project, or "Save".
 */
import { useProjectStore } from '../store/projectStore'
import { errorMessage, toast } from '../store/overlayStore'

const SAVE_DELAY_MS = 600
const MAX_WAIT_MS = 4000
const RETRY_MS = 5000

let timer: number | null = null
let firstPendingAt: number | null = null
let inflight: Promise<void> | null = null
let errorNotified = false

async function saveOnce(): Promise<void> {
  const { project, revision, savedRevision } = useProjectStore.getState()
  if (!project || revision === savedRevision) return
  useProjectStore.setState({ saveStatus: 'saving' })
  try {
    const result = await window.bhcf.project.save(project)
    // Only mark as saved if the project being saved is still the open one.
    if (useProjectStore.getState().project?.id === project.id) {
      useProjectStore.setState((s) => ({
        savedRevision: Math.max(s.savedRevision, revision),
        saveStatus: s.revision === revision ? 'saved' : 'saving',
        lastSavedAt: result.savedAt,
        saveError: null
      }))
    }
    errorNotified = false
  } catch (err) {
    const message = errorMessage(err)
    useProjectStore.setState({ saveStatus: 'error', saveError: message })
    if (!errorNotified) {
      toast.error('Autosave failed', `${message}\nRetrying automatically.`)
      errorNotified = true
    }
    schedule(RETRY_MS)
    throw err
  }
}

function run(): Promise<void> {
  if (timer !== null) {
    window.clearTimeout(timer)
    timer = null
  }
  firstPendingAt = null
  if (inflight) return inflight.then(() => run())
  inflight = saveOnce()
    .catch(() => undefined)
    .finally(() => {
      inflight = null
      const s = useProjectStore.getState()
      if (s.project && s.revision !== s.savedRevision && s.saveStatus !== 'error') schedule(SAVE_DELAY_MS)
    })
  return inflight
}

function schedule(delay: number): void {
  const now = Date.now()
  firstPendingAt ??= now
  const wait = Math.min(delay, Math.max(0, firstPendingAt + MAX_WAIT_MS - now))
  if (timer !== null) window.clearTimeout(timer)
  timer = window.setTimeout(() => void run(), wait)
}

/** Saves immediately and resolves once everything up to now is on disk (throws on failure). */
export async function flushSave(): Promise<void> {
  await run()
  const s = useProjectStore.getState()
  if (s.project && s.revision !== s.savedRevision) {
    // A change landed during the save, or the save failed: try once more and surface errors.
    await saveOnce()
  }
}

export function startAutosave(): () => void {
  const unsubscribe = useProjectStore.subscribe((state, prev) => {
    if (state.project && state.revision !== prev.revision && state.revision !== state.savedRevision) {
      schedule(SAVE_DELAY_MS)
    }
  })
  const stopFlush = window.bhcf.app.onFlushRequest(() => flushSave())
  return () => {
    unsubscribe()
    stopFlush()
  }
}
