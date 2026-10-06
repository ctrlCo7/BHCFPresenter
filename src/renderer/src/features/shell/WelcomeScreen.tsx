import { FolderOpen, Plus, X } from 'lucide-react'
import { useEffect, useState, type ReactElement } from 'react'
import type { RecentProject } from '@shared/ipc'
import { newProject, openProject } from '../../services/projectActions'
import { formatCombo, keysFor } from '../../services/commands'
import { LogoMark } from './LogoMark'

export function WelcomeScreen(): ReactElement {
  const [recent, setRecent] = useState<RecentProject[] | null>(null)

  const load = (): void => {
    void window.bhcf.project
      .recent()
      .then(setRecent)
      .catch(() => setRecent([]))
  }
  useEffect(load, [])

  const fmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

  return (
    <div className="welcome">
      <div className="welcome-card">
        <div className="welcome-hero">
          <LogoMark size={52} />
          <div>
            <h1>BHCF Presenter</h1>
            <p className="muted">Lyrics, scripture, media and announcements — prepared and run live.</p>
          </div>
        </div>
        <div className="welcome-actions">
          <button className="btn primary large" onClick={() => void newProject()}>
            <Plus size={16} /> New Project
            <span className="welcome-kbd">{formatCombo(keysFor('file.new')[0] ?? '')}</span>
          </button>
          <button className="btn large" onClick={() => void openProject()}>
            <FolderOpen size={16} /> Open Project…
            <span className="welcome-kbd">{formatCombo(keysFor('file.open')[0] ?? '')}</span>
          </button>
        </div>
        <div className="welcome-recent">
          <h2>Recent projects</h2>
          {recent === null ? null : recent.length === 0 ? (
            <p className="muted">No recent projects. Create one to get started — it is saved automatically as you work.</p>
          ) : (
            <ul>
              {recent.map((r) => (
                <li key={r.path} className={r.exists ? '' : 'missing'}>
                  <button className="welcome-recent-open" disabled={!r.exists} onClick={() => void openProject(r.path)} title={r.path}>
                    <span className="welcome-recent-name">{r.name}</span>
                    <span className="welcome-recent-path">{r.exists ? r.path : 'Folder not found'}</span>
                  </button>
                  <span className="muted welcome-recent-date">{fmt.format(new Date(r.openedAt))}</span>
                  <button
                    className="icon-btn"
                    title="Remove from list"
                    onClick={() => {
                      void window.bhcf.project.removeRecent(r.path).then(load)
                    }}
                  >
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
