import { Download, RefreshCw, RotateCcw } from 'lucide-react'
import { useEffect, useState, type ReactElement } from 'react'
import type { AppInfo } from '@shared/ipc'
import type { UpdateStatus } from '@shared/updates'
import { Row, Section } from '../../components/ui/fields'
import { updateNow, useUpdates } from '../../services/updates'
import { errorMessage, toast } from '../../store/overlayStore'

function describe(s: UpdateStatus): string {
  switch (s.state) {
    case 'unsupported':
      return s.reason
    case 'idle':
      return 'Looks for new versions while the app is open and asks before updating.'
    case 'checking':
      return 'Checking for updates…'
    case 'none':
      return `You have the latest version (checked ${new Date(s.checkedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}).`
    case 'available':
      return `Version ${s.version} is available. Nothing is downloaded until you choose Update now.`
    case 'downloading':
      return `Downloading version ${s.version}… ${s.percent}%`
    case 'ready':
      return `Version ${s.version} is downloaded. Restart to install it.`
    case 'error':
      return `Could not check for updates: ${s.message}`
  }
}

export function UpdatesTab(): ReactElement {
  const status = useUpdates((s) => s.status)
  const [info, setInfo] = useState<AppInfo | null>(null)
  useEffect(() => {
    void window.bhcf.app.info().then(setInfo)
  }, [])
  const run = (fn: () => Promise<unknown>): void => void fn().catch((err: unknown) => toast.error('Update failed', errorMessage(err)))
  const busy = status.state === 'checking' || status.state === 'downloading'

  return (
    <Section title="Updates">
      <Row label="Version">
        <span>{info ? `BHCF Presenter ${info.version}` : '…'}</span>
      </Row>
      <Row label="Status">
        <span style={status.state === 'error' ? { color: 'var(--danger)' } : undefined}>{describe(status)}</span>
      </Row>
      {status.state === 'downloading' && (
        <div className="transport-bar" aria-hidden>
          <div className="transport-fill" style={{ width: `${status.percent}%` }} />
        </div>
      )}
      <Row label="">
        {status.state === 'ready' ? (
          <button className="btn primary" onClick={() => run(() => window.bhcf.updates.install())} title="Saves, closes, installs and reopens the app">
            <RotateCcw size={14} /> Restart and install
          </button>
        ) : status.state === 'available' ? (
          <button className="btn primary" onClick={() => void updateNow()}>
            <Download size={14} /> Update now
          </button>
        ) : (
          <button className="btn" disabled={busy || status.state === 'unsupported'} onClick={() => run(() => window.bhcf.updates.check())}>
            <RefreshCw size={14} /> Check for updates
          </button>
        )}
      </Row>
      {status.state === 'available' && status.notes && (
        <>
          <div className="update-notes-title">What’s new in {status.version}</div>
          <div className="update-notes">{status.notes}</div>
        </>
      )}
      <p className="muted">
        {info?.platform === 'darwin'
          ? 'On a Mac, open the downloaded .dmg and drag BHCF Presenter into Applications to replace the old version. Your projects are kept.'
          : 'When a new version is out, the app asks first (never while something is live). Update now downloads it, saves your project and restarts. Your projects are kept.'}
      </p>
    </Section>
  )
}
