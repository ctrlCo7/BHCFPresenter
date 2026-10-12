/** Update status from the main process, with a one-time notice per new version. */
import { create } from 'zustand'
import type { UpdateStatus } from '@shared/updates'
import { toast } from '../store/overlayStore'

export const useUpdates = create<{ status: UpdateStatus }>(() => ({ status: { state: 'idle' } }))

const announced = new Set<string>()

function announce(s: UpdateStatus): void {
  if (s.state === 'ready' && !announced.has(`ready:${s.version}`)) {
    announced.add(`ready:${s.version}`)
    toast.success(`Update ${s.version} is ready`, 'It installs when you close BHCF Presenter. To install now: Settings → Updates.')
  } else if (s.state === 'available' && s.downloadUrl && !announced.has(`available:${s.version}`)) {
    announced.add(`available:${s.version}`)
    toast.info(`BHCF Presenter ${s.version} is available`, 'Settings → Updates → Download.')
  }
}

export function startUpdateListener(): () => void {
  const apply = (status: UpdateStatus): void => {
    useUpdates.setState({ status })
    announce(status)
  }
  void window.bhcf.updates
    .status()
    .then(apply)
    .catch(() => undefined)
  return window.bhcf.updates.onStatus(apply)
}
