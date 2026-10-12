import { Download, Sparkles } from 'lucide-react'
import { useEffect, useState, type ReactElement } from 'react'
import type { UpdateStatus } from '@shared/updates'

type Available = Extract<UpdateStatus, { state: 'available' }>

/** "A new version is available": what changed, then Update now / Later. */
export function UpdatePrompt({ update, onClose }: { update: Available; onClose: (updateNow: boolean | null) => void }): ReactElement {
  const [current, setCurrent] = useState('')
  useEffect(() => {
    void window.bhcf.app.info().then((i) => setCurrent(i.version))
  }, [])
  const mac = !!update.downloadUrl
  return (
    <div className="modal-body update-prompt">
      <p className="update-head">
        <Sparkles size={18} />
        <span>
          <b>BHCF Presenter {update.version}</b> is available{current ? ` (you have ${current})` : ''}.
        </span>
      </p>
      {update.notes && (
        <>
          <div className="update-notes-title">What’s new</div>
          <div className="update-notes">{update.notes}</div>
        </>
      )}
      <p className="muted">
        {mac
          ? 'Update now downloads the new version. Open the .dmg and drag BHCF Presenter into Applications to replace this one. Your projects are kept.'
          : 'Update now downloads the new version, saves your project and restarts the app (about a minute). Your projects are kept.'}
      </p>
      <div className="modal-footer">
        <button className="btn" onClick={() => onClose(false)}>
          Later
        </button>
        <button className="btn primary" onClick={() => onClose(true)} autoFocus>
          <Download size={14} /> Update now
        </button>
      </div>
    </div>
  )
}
