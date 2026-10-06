import { AlertCircle, CheckCircle2, CircleDashed, Loader2, Monitor } from 'lucide-react'
import { useEffect, useState, type ReactElement } from 'react'
import type { DisplayInfo } from '@shared/ipc'
import { saveNow } from '../../services/projectActions'
import { useProjectStore } from '../../store/projectStore'

function useClock(): string {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(t)
  }, [])
  return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function useDisplays(): DisplayInfo[] {
  const [displays, setDisplays] = useState<DisplayInfo[]>([])
  useEffect(() => {
    void window.bhcf.displays.list().then(setDisplays).catch(() => undefined)
    return window.bhcf.displays.onChanged(setDisplays)
  }, [])
  return displays
}

function SaveIndicator(): ReactElement | null {
  const status = useProjectStore((s) => s.saveStatus)
  const dirty = useProjectStore((s) => s.revision !== s.savedRevision)
  const lastSavedAt = useProjectStore((s) => s.lastSavedAt)
  const error = useProjectStore((s) => s.saveError)
  const hasProject = useProjectStore((s) => s.project !== null)
  if (!hasProject) return null

  const time = lastSavedAt ? new Date(lastSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null
  if (status === 'error') {
    return (
      <button className="status-item status-error" title={error ?? ''} onClick={() => void saveNow()}>
        <AlertCircle size={12} /> Save failed — click to retry
      </button>
    )
  }
  if (status === 'saving') {
    return (
      <span className="status-item">
        <Loader2 size={12} className="spin" /> Saving…
      </span>
    )
  }
  if (dirty) {
    return (
      <span className="status-item">
        <CircleDashed size={12} /> Unsaved changes
      </span>
    )
  }
  return (
    <span className="status-item status-ok" title="Every change is saved automatically">
      <CheckCircle2 size={12} /> All changes saved{time ? ` · ${time}` : ''}
    </span>
  )
}

export function StatusBar(): ReactElement {
  const path = useProjectStore((s) => s.path)
  const clock = useClock()
  const displays = useDisplays()
  return (
    <footer className="statusbar">
      <SaveIndicator />
      {path && (
        <span className="status-item status-path" title={path}>
          {path}
        </span>
      )}
      <span className="status-spacer" />
      <span className="status-item" title={displays.map((d) => `${d.label}: ${d.bounds.width}×${d.bounds.height}${d.primary ? ' (primary)' : ''}`).join('\n')}>
        <Monitor size={12} /> {displays.length} display{displays.length === 1 ? '' : 's'}
      </span>
      <span className="status-item status-clock">{clock}</span>
    </footer>
  )
}
