/**
 * The icon toolbar under the title bar (icon over label): find and create on the left, the
 * Show / Edit / Live modes, the bottom and right panels, then outputs, theme and settings.
 */
import {
  BookOpen,
  Ellipsis,
  FileInput,
  FileText,
  Image as ImageIcon,
  Layers,
  MonitorPlay,
  Moon,
  Music,
  Palette,
  PenTool,
  Radio,
  Search,
  Settings,
  Sun,
  Timer,
  Type,
  Upload,
  Wallpaper
} from 'lucide-react'
import type { ReactElement, ReactNode } from 'react'
import { toggleOutputs } from '../../live/liveActions'
import { useLiveStore } from '../../live/liveStore'
import { runCommand, shortcutLabel } from '../../services/commands'
import { toggleDarkMode, useIsDark } from '../../services/theme'
import { contextMenu } from '../../store/overlayStore'
import { ui, useUiStore, type AppMode, type BottomTab, type RightTab } from '../../store/uiStore'
import { openTemplates } from '../backgrounds/TemplatesDialog'
import { enterEditMode } from '../editor/editorActions'
import { openSettings } from '../settings/SettingsDialog'

function ToolButton({
  icon,
  label,
  title,
  active,
  className,
  onClick
}: {
  icon: ReactNode
  label: string
  title?: string
  active?: boolean
  className?: string
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void
}): ReactElement {
  return (
    <button type="button" className={`tool-btn${active ? ' active' : ''}${className ? ` ${className}` : ''}`} title={title ?? label} aria-pressed={active} onClick={onClick}>
      <span className="tool-icon">{icon}</span>
      <span className="tool-label">{label}</span>
    </button>
  )
}

const withKey = (label: string, command: string): string => {
  const key = shortcutLabel(command)
  return key ? `${label} (${key})` : label
}

const MODES: { id: AppMode; label: string; icon: ReactElement; command: string }[] = [
  { id: 'show', label: 'Show', icon: <MonitorPlay size={20} />, command: 'view.show' },
  { id: 'edit', label: 'Edit', icon: <PenTool size={20} />, command: 'view.edit' },
  { id: 'live', label: 'Live', icon: <Radio size={20} />, command: 'view.live' }
]

/** Shows a Show-mode panel, opening the bottom area when needed. */
function showBottom(tab: BottomTab): void {
  ui.set({ mode: ui.get().mode === 'edit' ? 'show' : ui.get().mode, bottomTab: tab })
  if (!ui.get().layout.bottomOpen) ui.setLayout({ bottomOpen: true })
}

function showRight(tab: RightTab): void {
  ui.set({ mode: 'show', rightTab: tab })
}

function openMore(e: React.MouseEvent<HTMLButtonElement>): void {
  const r = e.currentTarget.getBoundingClientRect()
  contextMenu.open({
    x: r.left,
    y: r.bottom + 2,
    items: [
      { label: 'New Presentation', icon: <FileText size={14} />, shortcut: shortcutLabel('library.newPresentation'), onSelect: () => runCommand('library.newPresentation') },
      { label: 'New Presentation from Text…', icon: <Type size={14} />, shortcut: shortcutLabel('library.newFromText'), onSelect: () => runCommand('library.newFromText') },
      { label: 'New Playlist', shortcut: shortcutLabel('library.newPlaylist'), onSelect: () => runCommand('library.newPlaylist') },
      { type: 'separator' },
      { label: 'Import Media…', icon: <Upload size={14} />, shortcut: shortcutLabel('file.importMedia'), onSelect: () => runCommand('file.importMedia') },
      { label: 'Import Presentation…', icon: <FileInput size={14} />, onSelect: () => runCommand('file.importPresentation') },
      { type: 'separator' },
      { label: 'Backgrounds…', icon: <Wallpaper size={14} />, onSelect: () => runCommand('library.templates') },
      { label: 'Keyboard Shortcuts', shortcut: shortcutLabel('help.shortcuts'), onSelect: () => runCommand('help.shortcuts') }
    ]
  })
}

export function Toolbar(): ReactElement {
  const mode = useUiStore((s) => s.mode)
  const bottomTab = useUiStore((s) => s.bottomTab)
  const bottomOpen = useUiStore((s) => s.layout.bottomOpen)
  const rightTab = useUiStore((s) => s.rightTab)
  const outputsActive = useLiveStore((s) => s.outputsActive)
  const openCount = useLiveStore((s) => s.outputs.filter((o) => o.open).length)
  const dark = useIsDark()
  const inShow = mode !== 'edit'

  return (
    <div className="toolbar" role="toolbar" aria-label="Main toolbar">
      <div className="tool-group">
        <ToolButton icon={<Search size={20} />} label="Search" title={withKey('Search library and lyrics', 'edit.find')} onClick={() => runCommand('edit.find')} />
        <ToolButton icon={<Music size={20} />} label="Song" title={withKey('New song', 'library.newSong')} onClick={() => runCommand('library.newSong')} />
        <ToolButton icon={<Palette size={20} />} label="Theme" title="Lyric themes (text style)" onClick={() => openTemplates('themes')} />
      </div>
      <span className="tool-sep" />
      <div className="tool-group">
        {MODES.map((m) => (
          <ToolButton
            key={m.id}
            icon={m.icon}
            label={m.label}
            title={withKey(`${m.label} mode`, m.command)}
            active={mode === m.id}
            className={m.id === 'live' ? 'mode-live' : 'mode'}
            onClick={() => (m.id === 'edit' ? enterEditMode() : ui.set({ mode: m.id }))}
          />
        ))}
        <ToolButton icon={<BookOpen size={20} />} label="Bible" title="Bible" active={inShow && bottomOpen && bottomTab === 'bible'} onClick={() => showBottom('bible')} />
        <ToolButton icon={<Ellipsis size={20} />} label="More" onClick={openMore} />
      </div>

      <span className="tool-spacer" />

      <div className="tool-group">
        <ToolButton icon={<ImageIcon size={20} />} label="Media" title={withKey('Media', 'view.toggleMedia')} active={inShow && bottomOpen && bottomTab === 'media'} onClick={() => showBottom('media')} />
        <ToolButton icon={<Layers size={20} />} label="Overlays" active={mode === 'show' && rightTab === 'overlays'} onClick={() => showRight('overlays')} />
        <ToolButton icon={<Timer size={20} />} label="Timers" active={mode === 'show' && rightTab === 'timers'} onClick={() => showRight('timers')} />
      </div>
      <span className="tool-sep" />
      <div className="tool-group">
        <ToolButton
          icon={<span className={`output-dot${outputsActive ? ' on' : ''}`} />}
          label={outputsActive && openCount ? `Outputs · ${openCount}` : 'Outputs'}
          title={withKey(`Turn outputs ${outputsActive ? 'off' : 'on'}`, 'live.outputs')}
          onClick={toggleOutputs}
        />
        <ToolButton icon={dark ? <Sun size={20} /> : <Moon size={20} />} label={dark ? 'Light' : 'Dark'} title={withKey(`${dark ? 'Light' : 'Dark'} mode`, 'view.darkMode')} onClick={toggleDarkMode} />
        <ToolButton icon={<Settings size={20} />} label="Settings" title={withKey('Settings', 'file.settings')} onClick={() => openSettings()} />
      </div>
    </div>
  )
}
