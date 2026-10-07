/**
 * Tabs across the window, one per profile (church event). Clicking a tab switches the whole
 * workspace — library pages, playlists and media — to that profile.
 */
import { ArrowLeft, ArrowRight, CalendarDays, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState, type ReactElement } from 'react'
import { contextMenu } from '../../store/overlayStore'
import { useProjectStore } from '../../store/projectStore'
import { deleteProfileAction, moveProfileAction, newProfile, renameProfileAction, switchProfile } from './profileActions'
import './profiles.css'

export function ProfileTabs(): ReactElement | null {
  const project = useProjectStore((s) => s.project)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropAt, setDropAt] = useState<number | null>(null)
  if (!project) return null
  const order = project.profileOrder

  const onContext = (e: React.MouseEvent, id: string, index: number): void => {
    e.preventDefault()
    contextMenu.fromEvent(e, [
      { label: 'Rename…', icon: <Pencil size={14} />, onSelect: () => void renameProfileAction(id) },
      { label: 'Move Left', icon: <ArrowLeft size={14} />, disabled: index === 0, onSelect: () => moveProfileAction(id, index - 1) },
      { label: 'Move Right', icon: <ArrowRight size={14} />, disabled: index === order.length - 1, onSelect: () => moveProfileAction(id, index + 2) },
      { type: 'separator' },
      { label: 'New Profile…', icon: <Plus size={14} />, onSelect: () => void newProfile() },
      { type: 'separator' },
      { label: 'Delete Profile…', icon: <Trash2 size={14} />, danger: true, disabled: order.length <= 1, onSelect: () => void deleteProfileAction(id) }
    ])
  }

  return (
    <nav className="profile-tabs" role="tablist" aria-label="Profiles">
      <span className="profile-tabs-label">
        <CalendarDays size={13} /> Profiles
      </span>
      <div className="profile-tabs-list">
        {order.map((id, index) => {
          const profile = project.profiles[id]
          if (!profile) return null
          const active = id === project.activeProfileId
          return (
            <button
              key={id}
              role="tab"
              aria-selected={active}
              className={`profile-tab${active ? ' active' : ''}${dropAt === index ? ' drop-before' : ''}${dropAt === order.length && index === order.length - 1 ? ' drop-after' : ''}`}
              title={`${profile.name} — double-click to rename, right-click for more`}
              draggable
              onClick={() => switchProfile(id)}
              onDoubleClick={() => void renameProfileAction(id)}
              onContextMenu={(e) => onContext(e, id, index)}
              onDragStart={(e) => {
                setDragId(id)
                e.dataTransfer.effectAllowed = 'move'
              }}
              onDragEnd={() => {
                setDragId(null)
                setDropAt(null)
              }}
              onDragOver={(e) => {
                if (!dragId) return
                e.preventDefault()
                const r = e.currentTarget.getBoundingClientRect()
                const at = e.clientX < r.left + r.width / 2 ? index : index + 1
                if (at !== dropAt) setDropAt(at)
              }}
              onDrop={(e) => {
                e.preventDefault()
                if (dragId && dropAt !== null) moveProfileAction(dragId, dropAt)
                setDragId(null)
                setDropAt(null)
              }}
            >
              {profile.name}
            </button>
          )
        })}
        <button className="profile-tab-add" title="New profile (church event)" aria-label="New profile" onClick={() => void newProfile()}>
          <Plus size={14} />
        </button>
      </div>
    </nav>
  )
}
