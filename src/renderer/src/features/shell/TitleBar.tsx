import { MonitorOff, MonitorPlay, MonitorUp, PenTool, Radio, Settings } from 'lucide-react'
import type { ReactElement } from 'react'
import { toggleOutputs } from '../../live/liveActions'
import { useLiveStore } from '../../live/liveStore'
import { shortcutLabel } from '../../services/commands'
import { useProjectStore } from '../../store/projectStore'
import { ui, useUiStore, type AppMode } from '../../store/uiStore'
import { enterEditMode } from '../editor/editorActions'
import { openSettings } from '../settings/SettingsDialog'
import { LogoMark } from './LogoMark'
import { MenuBar } from './MenuBar'

const MODES: { id: AppMode; label: string; icon: ReactElement; command: string }[] = [
  { id: 'show', label: 'Show', icon: <MonitorPlay size={14} />, command: 'view.show' },
  { id: 'edit', label: 'Edit', icon: <PenTool size={14} />, command: 'view.edit' },
  { id: 'live', label: 'Live', icon: <Radio size={14} />, command: 'view.live' }
]

export function TitleBar({ platform, isDev }: { platform: string; isDev: boolean }): ReactElement {
  const projectName = useProjectStore((s) => s.project?.name ?? null)
  const mode = useUiStore((s) => s.mode)
  const outputsActive = useLiveStore((s) => s.outputsActive)
  const openCount = useLiveStore((s) => s.outputs.filter((o) => o.open).length)

  return (
    <header className={`titlebar platform-${platform}`}>
      <div className="titlebar-left">
        <span className="titlebar-logo">
          <LogoMark size={22} badge />
        </span>
        <MenuBar isDev={isDev} />
      </div>

      {projectName && (
        <div className="mode-tabs" role="tablist" aria-label="Workspace mode">
          {MODES.map((m) => (
            <button
              key={m.id}
              role="tab"
              aria-selected={mode === m.id}
              className={`mode-tab${mode === m.id ? ' active' : ''}${m.id === 'live' ? ' live' : ''}`}
              title={`${m.label} (${shortcutLabel(m.command) ?? ''})`}
              onClick={() => (m.id === 'edit' ? enterEditMode() : ui.set({ mode: m.id }))}
            >
              {m.icon} {m.label}
            </button>
          ))}
        </div>
      )}

      <div className="titlebar-title">{projectName ?? 'BHCF Presenter'}</div>

      <div className="titlebar-right">
        {projectName && (
          <button className={`outputs-pill${outputsActive ? ' on' : ''}`} onClick={toggleOutputs} title={`Turn outputs ${outputsActive ? 'off' : 'on'} (${shortcutLabel('live.outputs') ?? ''})`}>
            {outputsActive ? <MonitorUp size={14} /> : <MonitorOff size={14} />}
            {outputsActive ? `Outputs on${openCount ? ` · ${openCount}` : ''}` : 'Outputs off'}
          </button>
        )}
        <button className="titlebar-icon" title="Settings" onClick={() => openSettings()}>
          <Settings size={15} />
        </button>
      </div>
    </header>
  )
}
