/**
 * Update status from the main process. When a newer release exists the operator is asked once
 * per version (per session) whether to update; nothing is downloaded before "Update now". The
 * question waits while something is live, so it never interrupts a service.
 */
import { createElement } from 'react'
import { create } from 'zustand'
import { compareVersions, type UpdateStatus } from '@shared/updates'
import { UpdatePrompt } from '../features/settings/UpdatePrompt'
import { WhatsNew } from '../features/settings/WhatsNew'
import { useLiveStore } from '../live/liveStore'
import { dialogs, errorMessage, toast } from '../store/overlayStore'
import { useUiStore } from '../store/uiStore'

export const useUpdates = create<{ status: UpdateStatus }>(() => ({ status: { state: 'idle' } }))

const asked = new Set<string>()

/** A slide or media cue on screen, or Live mode: not the moment for a dialog. */
function busy(): boolean {
  const s = useLiveStore.getState()
  return !!(s.cursor || s.media) || useUiStore.getState().mode === 'live'
}

/** "Update now" (also used by Settings → Updates). */
export async function updateNow(): Promise<void> {
  const s = useUpdates.getState().status
  try {
    await window.bhcf.updates.install()
    if (s.state === 'available' && s.downloadUrl) toast.info('Downloading the new version', 'Open the .dmg when it finishes and drag BHCF Presenter into Applications.')
    else toast.info('Downloading the update…', 'BHCF Presenter saves your project and restarts when it is ready.')
  } catch (err) {
    toast.error('Update failed', errorMessage(err))
  }
}

function maybeAsk(): void {
  const s = useUpdates.getState().status
  if (s.state !== 'available' || asked.has(s.version) || busy()) return
  asked.add(s.version)
  void dialogs.custom<boolean>({ title: 'Update available', width: 520, render: (close) => createElement(UpdatePrompt, { update: s, onClose: close }) }).then((yes) => {
    if (yes) void updateNow()
  })
}

export function startUpdateListener(): () => void {
  const apply = (status: UpdateStatus): void => {
    useUpdates.setState({ status })
    maybeAsk()
  }
  void window.bhcf.updates
    .status()
    .then(apply)
    .catch(() => undefined)
  const stopStatus = window.bhcf.updates.onStatus(apply)
  // Ask once the program is clear again.
  const stopLive = useLiveStore.subscribe(maybeAsk)
  const stopUi = useUiStore.subscribe(maybeAsk)
  return () => {
    stopStatus()
    stopLive()
    stopUi()
  }
}

/* ----------------------------- What's new ----------------------------- */

const SEEN_KEY = 'bhcf-seen-version'

function readSeen(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY)
  } catch {
    return null
  }
}

function markSeen(version: string): void {
  try {
    localStorage.setItem(SEEN_KEY, version)
  } catch {
    // Storage unavailable: "What's new" may show again next time.
  }
}

/**
 * After an update, the first start of the new version shows what changed in every release since
 * the version last used on this computer. When GitHub cannot be reached it tries again next start.
 */
export async function showWhatsNew(): Promise<void> {
  const info = await window.bhcf.app.info()
  if (info.isDev) return
  const seen = readSeen()
  if (seen === info.version) return
  if (seen && compareVersions(seen, info.version) > 0) return markSeen(info.version) // went back to an older version
  const releases = await window.bhcf.updates.releaseNotes(seen).catch(() => null)
  if (releases === null) return
  markSeen(info.version)
  const withNotes = releases.filter((r) => r.notes)
  if (withNotes.length === 0) return
  await dialogs.custom<null>({ title: "What's new", width: 520, render: (close) => createElement(WhatsNew, { version: info.version, releases: withNotes, onClose: close }) })
}
