import { History } from 'lucide-react'
import { useState, type ReactElement } from 'react'
import type { BackupInfo } from '@shared/ipc'
import { formatBytes } from '../media/mediaActions'

const REASONS: Record<string, string> = {
  'session-start': 'Project opened',
  periodic: 'Automatic (every 10 min)',
  manual: 'Manual backup',
  'before-restore': 'Before a restore',
  recovered: 'Recovered copy'
}

export function BackupPicker({ backups, onPick }: { backups: BackupInfo[]; onPick: (id: string | null) => void }): ReactElement {
  const [selected, setSelected] = useState<string | null>(backups[0]?.id ?? null)
  const fmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' })
  return (
    <div className="modal-body">
      <div className="modal-message">Restoring replaces the open project with the chosen snapshot. The current state is backed up first, so this can be reversed.</div>
      <div className="backup-list" role="listbox">
        {backups.map((b) => (
          <button
            key={b.id}
            role="option"
            aria-selected={selected === b.id}
            className={`backup-row${selected === b.id ? ' selected' : ''}`}
            onClick={() => setSelected(b.id)}
            onDoubleClick={() => onPick(b.id)}
          >
            <History size={14} />
            <span className="backup-date">{fmt.format(new Date(b.createdAt))}</span>
            <span className="muted">{REASONS[b.reason] ?? b.reason}</span>
            <span className="muted backup-size">{formatBytes(b.sizeBytes)}</span>
          </button>
        ))}
      </div>
      <div className="modal-footer">
        <button className="btn" onClick={() => onPick(null)}>
          Cancel
        </button>
        <button className="btn primary" disabled={!selected} onClick={() => onPick(selected)}>
          Restore
        </button>
      </div>
    </div>
  )
}
