import { useRef, useState, type ReactElement } from 'react'
import type { RecentProject } from '@shared/ipc'
import { getCommand, isEnabled, shortcutLabel } from '../../services/commands'
import { openProject } from '../../services/projectActions'
import { contextMenu, type MenuItem } from '../../store/overlayStore'
import { useProjectStore } from '../../store/projectStore'

type MenuSpec = string | '-' | { submenu: 'recent' }

const MENUS: { label: string; items: MenuSpec[] }[] = [
  {
    label: 'File',
    items: [
      'file.new',
      'file.open',
      { submenu: 'recent' },
      '-',
      'file.save',
      'file.saveAs',
      '-',
      'file.importMedia',
      'file.importPresentation',
      'file.exportPresentation',
      '-',
      'file.backup',
      'file.restore',
      'file.reveal',
      'file.cleanupMedia',
      '-',
      'file.settings',
      '-',
      'file.close'
    ]
  },
  {
    label: 'Edit',
    items: ['edit.undo', 'edit.redo', '-', 'edit.copy', 'edit.paste', 'edit.duplicate', 'edit.rename', 'edit.delete', 'edit.selectAll', '-', 'edit.find']
  },
  {
    label: 'Library',
    items: ['library.newPresentation', 'library.newFromText', 'library.newSong', 'library.newFolder', '-', 'library.templates', '-', 'library.newPlaylist', 'library.newPlaylistFolder', '-', 'slides.add', 'slides.edit']
  },
  {
    label: 'Live',
    items: ['live.next', 'live.prev', '-', 'live.clear', 'live.black', 'live.logo', 'live.clearAll', '-', 'media.toggle', 'media.stop', '-', 'live.outputs']
  },
  { label: 'View', items: ['view.show', 'view.edit', 'view.live', '-', 'view.toggleMedia', 'view.zoomIn', 'view.zoomOut', '-', 'view.darkMode', '-', 'view.devtools'] },
  { label: 'Help', items: ['help.shortcuts', 'help.about'] }
]

function commandItem(id: string): MenuItem | null {
  const c = getCommand(id)
  if (!c) return null
  let label = c.label
  const s = useProjectStore.getState()
  if (id === 'edit.undo' && s.past.length) label = `Undo ${s.past[s.past.length - 1]?.label ?? ''}`
  if (id === 'edit.redo' && s.future.length) label = `Redo ${s.future[0]?.label ?? ''}`
  return { label, shortcut: shortcutLabel(id), disabled: !isEnabled(id), onSelect: () => void c.run() }
}

function buildItems(specs: MenuSpec[], recent: RecentProject[], isDev: boolean): MenuItem[] {
  const out: MenuItem[] = []
  for (const spec of specs) {
    if (spec === '-') {
      if (out.length && out[out.length - 1]?.type !== 'separator') out.push({ type: 'separator' })
    } else if (typeof spec === 'object') {
      out.push({
        type: 'submenu',
        label: 'Open Recent',
        items: recent.length
          ? recent.map((r) => ({ label: r.exists ? r.name : `${r.name} (missing)`, disabled: !r.exists, onSelect: () => void openProject(r.path) }))
          : [{ label: 'No recent projects', disabled: true, onSelect: () => undefined }]
      })
    } else if (spec !== 'view.devtools' || isDev) {
      const item = commandItem(spec)
      if (item) out.push(item)
    }
  }
  while (out[out.length - 1]?.type === 'separator') out.pop()
  return out
}

export function MenuBar({ isDev }: { isDev: boolean }): ReactElement {
  const [open, setOpen] = useState<number | null>(null)
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  const show = async (index: number): Promise<void> => {
    const btn = refs.current[index]
    const menu = MENUS[index]
    if (!btn || !menu) return
    const recent = index === 0 ? await window.bhcf.project.recent().catch(() => []) : []
    const r = btn.getBoundingClientRect()
    setOpen(index)
    contextMenu.open({
      x: r.left,
      y: r.bottom + 2,
      items: buildItems(menu.items, recent, isDev),
      onClose: () => setOpen((cur) => (cur === index ? null : cur))
    })
  }

  return (
    <nav className="menubar" aria-label="Application menu">
      {MENUS.map((m, i) => (
        <button
          key={m.label}
          ref={(el) => {
            refs.current[i] = el
          }}
          className={`menubar-btn${open === i ? ' open' : ''}`}
          onMouseDown={(e) => {
            e.preventDefault()
            if (open === i) contextMenu.close()
            else void show(i)
          }}
          onMouseEnter={() => {
            if (open !== null && open !== i) void show(i)
          }}
        >
          {m.label}
        </button>
      ))}
    </nav>
  )
}
