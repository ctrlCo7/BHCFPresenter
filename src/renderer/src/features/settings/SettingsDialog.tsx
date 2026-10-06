import { Crosshair, FolderOpen, Keyboard, Monitor, MonitorSmartphone, Plus, RotateCcw, Settings2, Trash2, Tv, Wrench, X } from 'lucide-react'
import { createElement, useEffect, useState, type ReactElement } from 'react'
import type { DisplayInfo, RemoteStatus } from '@shared/ipc'
import { defaultStageLayout, type OutputConfig } from '@shared/live'
import type { Project } from '@shared/model/types'
import { ColorField, NumberField, Row, Section, Select, Slider, Toggle } from '../../components/ui/fields'
import { setOutputsActive } from '../../live/liveActions'
import { useLiveStore } from '../../live/liveStore'
import { allCommands, eventToCombo, formatCombo, getCommand, keysFor, setKeysFor, type CommandCategory } from '../../services/commands'
import { dialogs, errorMessage, toast } from '../../store/overlayStore'
import { applyChange, useProjectStore } from '../../store/projectStore'
import { BackgroundEditor, TransitionEditor } from '../editor/BackgroundEditor'
import { FONT_FAMILIES } from '../editor/Inspector'
import { cleanupUnusedMedia } from '../media/mediaActions'
import { exportActivePresentation, importPresentationFile } from '../presentation/transferActions'
import './settings.css'

export type SettingsTab = 'outputs' | 'stage' | 'project' | 'shortcuts' | 'remote' | 'maintenance'

const TABS: { id: SettingsTab; label: string; icon: ReactElement }[] = [
  { id: 'outputs', label: 'Outputs', icon: <Tv size={15} /> },
  { id: 'stage', label: 'Stage Display', icon: <Monitor size={15} /> },
  { id: 'project', label: 'Project', icon: <Settings2 size={15} /> },
  { id: 'shortcuts', label: 'Shortcuts', icon: <Keyboard size={15} /> },
  { id: 'remote', label: 'Remote', icon: <MonitorSmartphone size={15} /> },
  { id: 'maintenance', label: 'Maintenance', icon: <Wrench size={15} /> }
]

function useOutputs(): [OutputConfig[] | null, (next: OutputConfig[]) => void] {
  const [outputs, setOutputs] = useState<OutputConfig[] | null>(null)
  useEffect(() => {
    void window.bhcf.outputs.getConfig().then(setOutputs)
  }, [])
  const save = (next: OutputConfig[]): void => {
    setOutputs(next)
    void window.bhcf.outputs.setConfig(next).catch((err: unknown) => toast.error('Could not save outputs', errorMessage(err)))
  }
  return [outputs, save]
}

function OutputsTab(): ReactElement {
  const [outputs, save] = useOutputs()
  const [displays, setDisplays] = useState<DisplayInfo[]>([])
  const active = useLiveStore((s) => s.outputsActive)
  const status = useLiveStore((s) => s.outputs)
  useEffect(() => {
    void window.bhcf.displays.list().then(setDisplays)
    return window.bhcf.displays.onChanged(setDisplays)
  }, [])
  if (!outputs) return <div className="muted">Loading…</div>

  const update = (id: string, patch: Partial<OutputConfig>): void => save(outputs.map((o) => (o.id === id ? { ...o, ...patch } : o)))
  const displayOptions = [
    { value: 'auto', label: 'Automatic (first secondary screen)' },
    ...displays.map((d, i) => ({ value: String(d.id), label: `${i + 1}. ${d.label} — ${d.bounds.width}×${d.bounds.height}${d.primary ? ' (primary)' : ''}` })),
    { value: 'window', label: 'Window on this screen (for testing)' }
  ]

  return (
    <>
      <Section title="Outputs">
        <Row label="Show outputs">
          <Toggle checked={active} label={active ? 'Outputs are on' : 'Outputs are off'} onChange={(on) => void setOutputsActive(on)} />
          <button className="btn" onClick={() => void window.bhcf.outputs.identify()}>
            <Crosshair size={14} /> Identify screens
          </button>
        </Row>
        <p className="muted">
          {displays.length} screen{displays.length === 1 ? '' : 's'} detected. Each output opens fullscreen on its screen when outputs are on. With a single screen, choose “Window” to preview an output.
        </p>
      </Section>
      {outputs.map((o) => {
        const st = status.find((s) => s.id === o.id)
        return (
          <Section
            key={o.id}
            title={`${o.name}${st?.open ? ` · live on ${st.displayLabel}` : ''}`}
            actions={
              <button className="icon-btn" title="Remove output" onClick={() => save(outputs.filter((x) => x.id !== o.id))}>
                <Trash2 size={14} />
              </button>
            }
          >
            <Row label="Enabled">
              <Toggle checked={o.enabled} onChange={(enabled) => update(o.id, { enabled })} />
            </Row>
            <Row label="Name">
              <input className="input" value={o.name} onChange={(e) => update(o.id, { name: e.target.value })} />
            </Row>
            <Row label="Shows">
              <Select
                value={o.role}
                options={[
                  { value: 'audience', label: 'Audience (program)' },
                  { value: 'stage', label: 'Stage display' }
                ]}
                onChange={(role) => update(o.id, { role })}
              />
            </Row>
            <Row label="Screen">
              <Select
                value={o.windowed ? 'window' : o.displayId === null ? 'auto' : String(o.displayId)}
                options={displayOptions}
                onChange={(v) => update(o.id, v === 'window' ? { windowed: true, displayId: null } : v === 'auto' ? { windowed: false, displayId: null } : { windowed: false, displayId: Number(v) })}
              />
            </Row>
          </Section>
        )
      })}
      {outputs.length < 8 && (
        <button
          className="btn add-output"
          onClick={() => save([...outputs, { id: `output-${Date.now().toString(36)}`, name: `Output ${outputs.length + 1}`, role: 'audience', enabled: true, displayId: null, windowed: false, stage: defaultStageLayout() }])}
        >
          <Plus size={14} /> Add output
        </button>
      )}
    </>
  )
}

function StageTab({ project }: { project: Project }): ReactElement {
  const [outputs, save] = useOutputs()
  if (!outputs) return <div className="muted">Loading…</div>
  const stages = outputs.filter((o) => o.role === 'stage')
  if (stages.length === 0) return <p className="muted">No output is set to “Stage display”. Add or change one in the Outputs tab.</p>
  return (
    <>
      {stages.map((o) => {
        const set = (patch: Partial<OutputConfig['stage']>): void => save(outputs.map((x) => (x.id === o.id ? { ...x, stage: { ...x.stage, ...patch } } : x)))
        return (
          <Section key={o.id} title={o.name}>
            <Row label="Show">
              <Toggle checked={o.stage.showCurrent} label="Current slide" onChange={(showCurrent) => set({ showCurrent })} />
              <Toggle checked={o.stage.showNext} label="Next slide" onChange={(showNext) => set({ showNext })} />
            </Row>
            <Row label="">
              <Toggle checked={o.stage.showClock} label="Clock" onChange={(showClock) => set({ showClock })} />
              <Toggle checked={o.stage.showNotes} label="Notes" onChange={(showNotes) => set({ showNotes })} />
              <Toggle checked={o.stage.showMessage} label="Messages" onChange={(showMessage) => set({ showMessage })} />
            </Row>
            <Row label="Timer">
              <Select
                value={o.stage.timerId ?? ''}
                options={[{ value: '', label: 'None' }, ...project.timerOrder.flatMap((id) => (project.timers[id] ? [{ value: id, label: project.timers[id].name }] : []))]}
                onChange={(v) => set({ timerId: v || null })}
              />
            </Row>
            <Row label="Text size">
              <Slider value={o.stage.fontScale} min={0.5} max={2} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(fontScale) => set({ fontScale })} />
            </Row>
          </Section>
        )
      })}
      <p className="muted">Send messages to the stage from the Live controls (Live mode).</p>
    </>
  )
}

const CANVASES = [
  { value: '1920x1080', label: '1920 × 1080 (Full HD 16:9)' },
  { value: '1280x720', label: '1280 × 720 (HD 16:9)' },
  { value: '3840x2160', label: '3840 × 2160 (4K 16:9)' },
  { value: '1024x768', label: '1024 × 768 (4:3)' },
  { value: '1920x1200', label: '1920 × 1200 (16:10)' }
]

function ProjectTab({ project }: { project: Project }): ReactElement {
  const s = project.settings
  const set = (label: string, fn: (st: Project['settings']) => void, coalesce?: string): void => {
    applyChange(label, (d) => fn(d.settings), { coalesce })
  }
  const canvasValue = `${s.canvas.width}x${s.canvas.height}`
  const images = Object.values(project.media).filter((m) => m.kind === 'image')
  return (
    <>
      <Section title="Output canvas">
        <Row label="Resolution">
          <Select
            value={CANVASES.some((c) => c.value === canvasValue) ? canvasValue : 'custom'}
            options={[...CANVASES, ...(CANVASES.some((c) => c.value === canvasValue) ? [] : [{ value: 'custom', label: `${s.canvas.width} × ${s.canvas.height}` }])]}
            onChange={(v) => {
              const [w, h] = v.split('x').map(Number)
              if (w && h) set('Canvas size', (st) => (st.canvas = { width: w, height: h }))
            }}
          />
        </Row>
        <p className="muted">Slides are laid out on this canvas and scaled to every screen. Changing it does not move existing elements.</p>
      </Section>
      <Section title="Default background">
        <BackgroundEditor value={s.defaultBackground} media={project.media} allowInherit={false} onChange={(bg, c) => bg && set('Default background', (st) => (st.defaultBackground = bg), c)} />
      </Section>
      <Section title="Default transition">
        <TransitionEditor value={s.defaultTransition} allowInherit={false} onChange={(t) => t && set('Default transition', (st) => (st.defaultTransition = t))} />
      </Section>
      <Section title="Default text (new slides, songs, scripture)">
        <Row label="Font">
          <Select value={FONT_FAMILIES.includes(s.defaultTextStyle.fontFamily) ? s.defaultTextStyle.fontFamily : FONT_FAMILIES[0] as string} options={FONT_FAMILIES.map((f) => ({ value: f, label: f.split(',')[0] as string }))} onChange={(fontFamily) => set('Default font', (st) => (st.defaultTextStyle.fontFamily = fontFamily))} />
        </Row>
        <Row label="Size">
          <NumberField value={s.defaultTextStyle.fontSize} min={12} max={400} suffix="px" onChange={(fontSize) => set('Default font size', (st) => (st.defaultTextStyle.fontSize = fontSize))} />
        </Row>
        <Row label="Colour">
          <ColorField value={s.defaultTextStyle.color} onChange={(color) => set('Default text colour', (st) => (st.defaultTextStyle.color = color), 'default-color')} />
        </Row>
        <Row label="Lyric lines">
          <NumberField value={s.linesPerSlide} min={1} max={12} suffix="/slide" onChange={(n) => set('Lines per slide', (st) => (st.linesPerSlide = n))} />
        </Row>
      </Section>
      <Section title="Logo">
        <Row label="Logo image">
          <Select
            value={s.logoMediaId ?? ''}
            options={[{ value: '', label: images.length ? 'None' : 'Import an image first' }, ...images.map((m) => ({ value: m.id, label: m.name }))]}
            onChange={(v) => set('Logo', (st) => (st.logoMediaId = v || null))}
          />
        </Row>
        <p className="muted">Shown full screen on black with the Logo button (L).</p>
      </Section>
    </>
  )
}

const CATEGORY_ORDER: CommandCategory[] = ['Live', 'Media', 'File', 'Edit', 'Library', 'Slides', 'View', 'Help']

function ShortcutsTab(): ReactElement {
  const [recording, setRecording] = useState<string | null>(null)
  const [, force] = useState(0)

  useEffect(() => {
    if (!recording) return
    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        setRecording(null)
        return
      }
      const combo = eventToCombo(e)
      if (!combo) return
      // A key can only do one thing: take it away from any other command.
      for (const c of allCommands()) {
        if (c.id !== recording && keysFor(c.id).includes(combo)) {
          setKeysFor(c.id, keysFor(c.id).filter((k) => k !== combo))
          toast.info(`${formatCombo(combo)} removed from “${c.label}”`)
        }
      }
      setKeysFor(recording, [combo])
      setRecording(null)
      force((n) => n + 1)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [recording])

  return (
    <>
      {CATEGORY_ORDER.map((cat) => {
        const list = allCommands().filter((c) => c.category === cat)
        if (!list.length) return null
        return (
          <Section key={cat} title={cat}>
            {list.map((c) => {
              const keys = keysFor(c.id)
              const custom = JSON.stringify(keys) !== JSON.stringify(getCommand(c.id)?.defaultKeys ?? [])
              return (
                <div key={c.id} className="shortcut-edit">
                  <span className="shortcut-label">{c.label}</span>
                  <span className="shortcut-keys">
                    {recording === c.id ? (
                      <span className="kbd recording">Press keys… (Esc cancels)</span>
                    ) : keys.length ? (
                      keys.map((k) => (
                        <span key={k} className="kbd">
                          {formatCombo(k)}
                        </span>
                      ))
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </span>
                  <button className="btn" onClick={() => setRecording(c.id)}>
                    Change
                  </button>
                  <button className="icon-btn" title="Remove shortcut" onClick={() => (setKeysFor(c.id, []), force((n) => n + 1))}>
                    <X size={13} />
                  </button>
                  <button className="icon-btn" title="Reset to default" disabled={!custom} onClick={() => (setKeysFor(c.id, undefined), force((n) => n + 1))}>
                    <RotateCcw size={13} />
                  </button>
                </div>
              )
            })}
          </Section>
        )
      })}
    </>
  )
}

function RemoteTab(): ReactElement {
  const [status, setStatus] = useState<RemoteStatus | null>(null)
  const [port, setPort] = useState(5719)
  const [pin, setPin] = useState('')
  useEffect(() => {
    void window.bhcf.remote.status().then((s) => {
      setStatus(s)
      setPort(s.port)
      setPin(s.pin)
    })
    return window.bhcf.remote.onStatus(setStatus)
  }, [])
  if (!status) return <div className="muted">Loading…</div>
  const apply = (patch: Partial<{ enabled: boolean; port: number; pin: string }>): void => {
    void window.bhcf.remote
      .setConfig({ enabled: status.enabled, port, pin, ...patch })
      .then(setStatus)
      .catch((err: unknown) => toast.error('Remote settings', errorMessage(err)))
  }
  return (
    <>
      <Section title="Phone & tablet remote">
        <Row label="Enabled">
          <Toggle checked={status.enabled} label={status.running ? 'Running' : status.enabled ? 'Not running' : 'Off'} onChange={(enabled) => apply({ enabled })} />
        </Row>
        <Row label="Port">
          <NumberField value={port} min={1024} max={65535} onChange={setPort} />
        </Row>
        <Row label="PIN">
          <input className="input" value={pin} maxLength={8} inputMode="numeric" onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
        </Row>
        <Row label="">
          <button className="btn primary" disabled={pin.length < 4} onClick={() => apply({})}>
            Apply
          </button>
        </Row>
        {status.error && <p className="field-error">{status.error}</p>}
        {status.running && (
          <>
            <p className="muted">Open one of these addresses in a browser on the same network and enter the PIN:</p>
            <ul className="remote-urls">
              {status.urls.map((u) => (
                <li key={u}>
                  <code>{u}</code>
                </li>
              ))}
            </ul>
            <p className="muted">
              {status.clients} remote{status.clients === 1 ? '' : 's'} connected. Windows may ask to allow BHCF Presenter through the firewall.
            </p>
          </>
        )}
      </Section>
    </>
  )
}

function MaintenanceTab(): ReactElement {
  return (
    <>
      <Section title="Presentations">
        <Row label="">
          <button className="btn" onClick={() => void exportActivePresentation()}>
            Export open presentation…
          </button>
          <button className="btn" onClick={() => void importPresentationFile()}>
            Import presentation…
          </button>
        </Row>
        <p className="muted">.bhcfpres files contain the slides and their media, for sharing between computers or projects.</p>
      </Section>
      <Section title="Media storage">
        <Row label="">
          <button className="btn" onClick={() => void cleanupUnusedMedia()}>
            Clean up unused media files…
          </button>
        </Row>
        <p className="muted">Deletes files in the project's media folder that no longer belong to any media item.</p>
      </Section>
      <Section title="Diagnostics">
        <Row label="">
          <button className="btn" onClick={() => void window.bhcf.app.openLogs()}>
            <FolderOpen size={14} /> Open log folder
          </button>
        </Row>
      </Section>
    </>
  )
}

function Settings({ initial, onClose }: { initial: SettingsTab; onClose: () => void }): ReactElement {
  const [tab, setTab] = useState<SettingsTab>(initial)
  const project = useProjectStore((s) => s.project)
  return (
    <div className="settings">
      <nav className="settings-nav">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)} disabled={!project && (t.id === 'project' || t.id === 'stage' || t.id === 'maintenance')}>
            {t.icon} {t.label}
          </button>
        ))}
        <span className="settings-spacer" />
        <button className="btn primary" onClick={onClose}>
          Done
        </button>
      </nav>
      <div className="settings-body">
        {tab === 'outputs' && <OutputsTab />}
        {tab === 'stage' && project && <StageTab project={project} />}
        {tab === 'project' && project && <ProjectTab project={project} />}
        {tab === 'shortcuts' && <ShortcutsTab />}
        {tab === 'remote' && <RemoteTab />}
        {tab === 'maintenance' && project && <MaintenanceTab />}
      </div>
    </div>
  )
}

export function openSettings(tab: SettingsTab = 'outputs'): void {
  void dialogs.custom<void>({ title: 'Settings', width: 860, render: (close) => createElement(Settings, { initial: tab, onClose: () => close(null) }) })
}
