import { PartyPopper } from 'lucide-react'
import type { ReactElement } from 'react'
import type { ReleaseNote } from '@shared/updates'

/** Shown once after the app updates: the notes of each version since the last one used here. */
export function WhatsNew({ version, releases, onClose }: { version: string; releases: ReleaseNote[]; onClose: (v: null) => void }): ReactElement {
  return (
    <div className="modal-body update-prompt">
      <p className="update-head">
        <PartyPopper size={18} />
        <span>
          BHCF Presenter is now on version <b>{version}</b>.
        </span>
      </p>
      {releases.map((r) => (
        <div key={r.version}>
          {releases.length > 1 && <div className="update-notes-title">Version {r.version}</div>}
          <div className="update-notes">{r.notes}</div>
        </div>
      ))}
      <div className="modal-footer">
        <button className="btn primary" onClick={() => onClose(null)} autoFocus>
          Got it
        </button>
      </div>
    </div>
  )
}
