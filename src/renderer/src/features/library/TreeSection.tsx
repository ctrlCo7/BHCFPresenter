/**
 * One tree (Library or Playlists) in the sidebar: folders, presentations / playlists and,
 * for playlists, their entries. Supports selection, keyboard navigation, inline rename,
 * context menus and drag-and-drop (reorder, move into folders, add to playlists).
 */
import {
  BookOpen,
  CalendarDays,
  ChevronRight,
  Copy,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Heading,
  ListMusic,
  ListPlus,
  Music,
  Pencil,
  Plus,
  Trash2,
  Type
} from 'lucide-react'
import { memo, useMemo, useRef, useState, type ReactElement } from 'react'
import type { Id, PlaylistEntry, Project, TreeScope } from '@shared/model/types'
import { childList, findParentId, flattenTree, isSelfOrDescendant, itemName, leafIdsUnder, profilePlaylists, rootList } from '../../engine/tree'
import { moveNode, movePlaylistEntry, type NewPlaylistEntry } from '../../engine/projectOps'
import { shortcutLabel } from '../../services/commands'
import { beginDrag, currentDrag, dropPositionFor, endDrag, type DragPayload, type DropPosition } from '../../services/dragState'
import { setFocusZone, useZoneHandlers } from '../../services/focusZones'
import { contextMenu, type MenuItem } from '../../store/overlayStore'
import { applyChange, useProjectStore } from '../../store/projectStore'
import { ui, useUiStore } from '../../store/uiStore'
import { editSong, newSong } from '../songs/songActions'
import { otherProfiles, sendToProfile } from '../profiles/profileActions'
import { exportPresentation } from '../presentation/transferActions'
import {
  addHeader,
  addToPlaylist,
  deleteItem,
  duplicateItem,
  newFolder,
  newPlaylist,
  newPresentation,
  newPresentationFromText,
  removeEntry,
  renameHeader,
  renameItem
} from './libraryActions'

type Row =
  | { type: 'node'; key: string; id: Id; depth: number; parentId: Id | null }
  | { type: 'entry'; key: string; playlistId: Id; entry: PlaylistEntry; index: number; depth: number }

function buildRows(project: Project, scope: TreeScope, expanded: Record<Id, boolean>): Row[] {
  const rows: Row[] = []
  for (const r of flattenTree(project, scope, expanded)) {
    rows.push({ type: 'node', key: r.id, id: r.id, depth: r.depth, parentId: r.parentId })
    const pl = project.playlists[r.id]
    if (pl && expanded[r.id]) {
      pl.entries.forEach((entry, index) => rows.push({ type: 'entry', key: entry.id, playlistId: pl.id, entry, index, depth: r.depth + 1 }))
    }
  }
  return rows
}

function entriesFromPayload(project: Project, payload: DragPayload): NewPlaylistEntry[] {
  if (payload.type === 'node' && payload.scope === 'library') {
    return leafIdsUnder(project, payload.id)
      .filter((id) => project.presentations[id])
      .map((presentationId) => ({ kind: 'presentation', presentationId }))
  }
  return []
}

interface DropTarget {
  key: string
  position: DropPosition
}

/** Decides whether `payload` can drop on `row` at `position`, returning the action to run. */
function resolveDrop(project: Project, scope: TreeScope, row: Row | null, payload: DragPayload, position: DropPosition): (() => void) | null {
  // Drop on empty space = root end of this tree.
  if (!row) {
    if (payload.type === 'node' && payload.scope === scope) {
      return () => applyChange('Move', (d) => moveNode(d, scope, payload.id, null, rootList(d, scope).length))
    }
    return null
  }

  if (row.type === 'entry') {
    if (scope !== 'playlists' || position === 'inside') return null
    const index = row.index + (position === 'after' ? 1 : 0)
    if (payload.type === 'entry') {
      return () => applyChange('Reorder playlist', (d) => movePlaylistEntry(d, payload.playlistId, payload.entryId, row.playlistId, index))
    }
    const entries = entriesFromPayload(project, payload)
    return entries.length ? () => addToPlaylist(row.playlistId, entries, index) : null
  }

  const isFolder = !!project.folders[row.id]
  const isPlaylist = !!project.playlists[row.id]

  if (payload.type === 'node' && payload.scope === scope) {
    if (position === 'inside') {
      if (!isFolder || isSelfOrDescendant(project, payload.id, row.id)) return null
      return () => applyChange('Move into folder', (d) => moveNode(d, scope, payload.id, row.id, d.folders[row.id]?.childIds.length ?? 0))
    }
    if (isSelfOrDescendant(project, payload.id, row.id)) return null
    const parentId = row.parentId
    if (parentId !== null && isSelfOrDescendant(project, payload.id, parentId)) return null
    return () =>
      applyChange('Move', (d) => {
        const list = childList(d, scope, parentId)
        moveNode(d, scope, payload.id, parentId, list.indexOf(row.id) + (position === 'after' ? 1 : 0))
      })
  }

  if (isPlaylist) {
    if (payload.type === 'entry') {
      const len = project.playlists[row.id]?.entries.length ?? 0
      return () => applyChange('Move to playlist', (d) => movePlaylistEntry(d, payload.playlistId, payload.entryId, row.id, len))
    }
    const entries = entriesFromPayload(project, payload)
    return entries.length ? () => addToPlaylist(row.id, entries) : null
  }
  return null
}

interface RowViewProps {
  row: Row
  project: Project
  selected: boolean
  expanded: boolean
  renaming: boolean
  drop: DropPosition | null
  onRowClick: (row: Row) => void
  onToggle: (id: Id) => void
  onContext: (e: React.MouseEvent, row: Row) => void
  onDragOverRow: (e: React.DragEvent, row: Row) => void
  onDropRow: (e: React.DragEvent, row: Row) => void
}

const RowView = memo(function RowView({ row, project, selected, expanded, renaming, drop, onRowClick, onToggle, onContext, onDragOverRow, onDropRow }: RowViewProps): ReactElement {
  let icon: ReactElement
  let name: string
  let badge: string | null = null
  let expandable = false
  let color: string | undefined
  let dragPayload: DragPayload

  if (row.type === 'entry') {
    const e = row.entry
    dragPayload = { type: 'entry', playlistId: row.playlistId, entryId: e.id }
    if (e.kind === 'presentation') {
      const pres = project.presentations[e.presentationId]
      name = pres?.name ?? 'Missing presentation'
      icon = pres?.kind === 'song' ? <Music size={14} /> : pres?.kind === 'scripture' ? <BookOpen size={14} /> : <FileText size={14} />
      badge = pres ? String(pres.slides.length) : null
    } else {
      name = e.title
      icon = <Heading size={14} />
      color = e.color
    }
  } else {
    dragPayload = { type: 'node', scope: project.folders[row.id]?.scope ?? (project.playlists[row.id] ? 'playlists' : 'library'), id: row.id }
    name = itemName(project, row.id)
    const folder = project.folders[row.id]
    const pres = project.presentations[row.id]
    const pl = project.playlists[row.id]
    if (folder) {
      expandable = true
      icon = expanded ? <FolderOpen size={14} /> : <Folder size={14} />
    } else if (pl) {
      expandable = true
      icon = <ListMusic size={14} />
      badge = String(pl.entries.length)
    } else {
      icon = pres?.kind === 'song' ? <Music size={14} /> : pres?.kind === 'scripture' ? <BookOpen size={14} /> : <FileText size={14} />
      badge = pres ? String(pres.slides.length) : null
    }
  }

  const isHeader = row.type === 'entry' && row.entry.kind === 'header'
  return (
    <div
      className={`tree-row${selected ? ' selected' : ''}${isHeader ? ' header-entry' : ''}${drop ? ` drop-${drop}` : ''}`}
      style={{ paddingLeft: 6 + row.depth * 14, ['--header-color' as string]: color }}
      draggable={!renaming}
      onDragStart={(e) => beginDrag(e, dragPayload, name)}
      onDragEnd={endDrag}
      onDragOver={(e) => onDragOverRow(e, row)}
      onDrop={(e) => onDropRow(e, row)}
      onClick={() => onRowClick(row)}
      onDoubleClick={() => row.type === 'node' && expandable && onToggle(row.id)}
      onContextMenu={(e) => onContext(e, row)}
      role="treeitem"
      aria-selected={selected}
      aria-expanded={expandable ? expanded : undefined}
    >
      <span
        className={`tree-chevron${expandable ? '' : ' hidden'}${expanded ? ' open' : ''}`}
        onClick={(e) => {
          e.stopPropagation()
          if (row.type === 'node' && expandable) onToggle(row.id)
        }}
      >
        <ChevronRight size={13} />
      </span>
      <span className="tree-icon">{icon}</span>
      {renaming && row.type === 'node' ? (
        <RenameInput
          initial={name}
          onDone={(value) => {
            ui.set({ renamingId: null })
            if (value !== null) renameItem(row.id, value)
          }}
        />
      ) : (
        <span className="tree-name">{name}</span>
      )}
      {badge !== null && !renaming && <span className="tree-badge">{badge}</span>}
    </div>
  )
})

function RenameInput({ initial, onDone }: { initial: string; onDone: (value: string | null) => void }): ReactElement {
  const done = useRef(false)
  const finish = (v: string | null): void => {
    if (done.current) return
    done.current = true
    onDone(v)
  }
  return (
    <input
      className="tree-rename"
      defaultValue={initial}
      autoFocus
      onFocus={(e) => e.currentTarget.select()}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') finish(e.currentTarget.value)
        if (e.key === 'Escape') finish(null)
      }}
      onBlur={(e) => finish(e.currentTarget.value)}
    />
  )
}

export function TreeSection({ scope }: { scope: TreeScope }): ReactElement {
  const project = useProjectStore((s) => s.project) as Project
  const expanded = useUiStore((s) => s.expanded)
  const treeSelection = useUiStore((s) => s.treeSelection)
  const entrySelection = useUiStore((s) => s.entrySelection)
  const renamingId = useUiStore((s) => s.renamingId)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const [rootDrop, setRootDrop] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  const rows = useMemo(() => buildRows(project, scope, expanded), [project, scope, expanded])

  const isRowSelected = (row: Row): boolean =>
    row.type === 'entry'
      ? entrySelection?.entryId === row.entry.id
      : !entrySelection && treeSelection?.scope === scope && treeSelection.id === row.id

  const selectRow = (row: Row): void => {
    setFocusZone(scope)
    if (row.type === 'entry') {
      const e = row.entry
      ui.set({ treeSelection: { scope, id: row.playlistId } })
      if (e.kind === 'presentation') ui.openPresentation(e.presentationId, { playlistId: row.playlistId, entryId: e.id })
      else ui.set({ entrySelection: { playlistId: row.playlistId, entryId: e.id } })
      return
    }
    ui.set({ treeSelection: { scope, id: row.id }, entrySelection: null })
    if (project.presentations[row.id]) ui.openPresentation(row.id)
  }

  const selectedIndex = rows.findIndex(isRowSelected)
  const selectedRow = rows[selectedIndex]

  useZoneHandlers(scope, {
    delete: () => {
      if (!selectedRow) return
      if (selectedRow.type === 'entry') removeEntry(selectedRow.playlistId, selectedRow.entry.id)
      else void deleteItem(scope, selectedRow.id)
    },
    duplicate: () => selectedRow?.type === 'node' && duplicateItem(scope, selectedRow.id),
    rename: () => {
      if (selectedRow?.type === 'node') ui.set({ renamingId: selectedRow.id })
      else if (selectedRow?.type === 'entry' && selectedRow.entry.kind === 'header') void renameHeader(selectedRow.playlistId, selectedRow.entry.id)
    }
  })

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (renamingId || e.target instanceof HTMLInputElement) return
    const go = (i: number): void => {
      const r = rows[Math.max(0, Math.min(rows.length - 1, i))]
      if (r) selectRow(r)
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        go(selectedIndex + 1)
        break
      case 'ArrowUp':
        e.preventDefault()
        go(selectedIndex < 0 ? rows.length - 1 : selectedIndex - 1)
        break
      case 'ArrowRight':
        if (selectedRow?.type === 'node' && (project.folders[selectedRow.id] || project.playlists[selectedRow.id])) {
          e.preventDefault()
          ui.toggleExpanded(selectedRow.id, true)
        }
        break
      case 'ArrowLeft':
        if (selectedRow?.type === 'node' && expanded[selectedRow.id]) {
          e.preventDefault()
          ui.toggleExpanded(selectedRow.id, false)
        } else if (selectedRow) {
          e.preventDefault()
          const parent = selectedRow.type === 'entry' ? selectedRow.playlistId : findParentId(project, scope, selectedRow.id)
          const idx = rows.findIndex((r) => r.type === 'node' && r.id === parent)
          if (idx >= 0) go(idx)
        }
        break
    }
  }

  const onDragOverRow = (e: React.DragEvent, row: Row): void => {
    const payload = currentDrag()
    if (!payload) return
    const allowInside = row.type === 'node' && (!!project.folders[row.id] || !!project.playlists[row.id])
    let position = dropPositionFor(e, allowInside)
    // Playlists accept content drops on their whole row.
    if (row.type === 'node' && project.playlists[row.id] && !(payload.type === 'node' && payload.scope === scope)) position = 'inside'
    if (!resolveDrop(project, scope, row, payload, position)) {
      if (dropTarget) setDropTarget(null)
      return
    }
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = payload.type === 'node' && payload.scope === scope ? 'move' : payload.type === 'entry' ? 'move' : 'copy'
    if (dropTarget?.key !== row.key || dropTarget.position !== position) setDropTarget({ key: row.key, position })
    if (rootDrop) setRootDrop(false)
  }

  const onDropRow = (e: React.DragEvent, row: Row): void => {
    const payload = currentDrag()
    const position = dropTarget?.key === row.key ? dropTarget.position : null
    setDropTarget(null)
    if (!payload || !position) return
    const action = resolveDrop(project, scope, row, payload, position)
    if (!action) return
    e.preventDefault()
    e.stopPropagation()
    action()
    endDrag()
  }

  const contextFor = (row: Row): MenuItem[] => {
    if (row.type === 'entry') {
      const e = row.entry
      return [
        ...(e.kind === 'header' ? [{ label: 'Rename Header…', icon: <Pencil size={14} />, onSelect: () => void renameHeader(row.playlistId, e.id) }] : []),
        { label: 'Add Header Below…', icon: <Heading size={14} />, onSelect: () => void addHeader(row.playlistId, row.index + 1) },
        { type: 'separator' },
        { label: 'Remove from Playlist', icon: <Trash2 size={14} />, danger: true, shortcut: shortcutLabel('edit.delete'), onSelect: () => removeEntry(row.playlistId, e.id) }
      ]
    }
    const isFolder = !!project.folders[row.id]
    const isPlaylist = !!project.playlists[row.id]
    const items: MenuItem[] = []
    if (scope === 'library') {
      items.push(
        { label: 'New Presentation', icon: <Plus size={14} />, onSelect: newPresentation },
        { label: 'New Presentation from Text…', icon: <Type size={14} />, onSelect: () => void newPresentationFromText() },
        { label: 'New Song…', icon: <Music size={14} />, onSelect: () => void newSong() },
        { label: 'New Folder', icon: <FolderPlus size={14} />, onSelect: () => newFolder('library') }
      )
      if (project.presentations[row.id]) {
        items.push(
          { type: 'separator' },
          { label: project.presentations[row.id]?.kind === 'song' ? 'Edit Song…' : 'Edit as Song…', icon: <Music size={14} />, onSelect: () => void editSong(row.id) },
          { label: 'Export…', onSelect: () => void exportPresentation(row.id) }
        )
      }
      const playlists = profilePlaylists(project)
      if (!isFolder || leafIdsUnder(project, row.id).length > 0) {
        items.push({
          type: 'submenu',
          label: 'Add to Playlist',
          icon: <ListPlus size={14} />,
          items: playlists.length
            ? playlists.map((pl) => ({
                label: pl.name,
                onSelect: () => addToPlaylist(pl.id, entriesFromPayload(project, { type: 'node', scope: 'library', id: row.id }))
              }))
            : [{ label: 'No playlists yet', disabled: true, onSelect: () => undefined }]
        })
      }
    } else {
      items.push({ label: 'New Playlist', icon: <ListPlus size={14} />, onSelect: newPlaylist }, { label: 'New Folder', icon: <FolderPlus size={14} />, onSelect: () => newFolder('playlists') })
      if (isPlaylist) items.push({ label: 'Add Header…', icon: <Heading size={14} />, onSelect: () => void addHeader(row.id) })
    }
    const others = otherProfiles()
    if (others.length) {
      items.push(
        { type: 'separator' },
        { type: 'submenu', label: 'Copy to Profile', icon: <Copy size={14} />, items: others.map((o) => ({ label: o.name, onSelect: () => sendToProfile(scope, row.id, o.id, 'copy') })) },
        { type: 'submenu', label: 'Move to Profile', icon: <CalendarDays size={14} />, items: others.map((o) => ({ label: o.name, onSelect: () => sendToProfile(scope, row.id, o.id, 'move') })) }
      )
    }
    items.push(
      { type: 'separator' },
      { label: 'Rename', icon: <Pencil size={14} />, shortcut: shortcutLabel('edit.rename'), onSelect: () => ui.set({ renamingId: row.id }) },
      { label: 'Duplicate', icon: <Copy size={14} />, shortcut: shortcutLabel('edit.duplicate'), onSelect: () => duplicateItem(scope, row.id) },
      { type: 'separator' },
      { label: 'Delete', icon: <Trash2 size={14} />, danger: true, shortcut: shortcutLabel('edit.delete'), onSelect: () => void deleteItem(scope, row.id) }
    )
    return items
  }

  const onContext = (e: React.MouseEvent, row: Row): void => {
    selectRow(row)
    contextMenu.fromEvent(e, contextFor(row))
  }

  const onBackgroundContext = (e: React.MouseEvent): void => {
    contextMenu.fromEvent(
      e,
      scope === 'library'
        ? [
            { label: 'New Presentation', icon: <Plus size={14} />, onSelect: newPresentation },
            { label: 'New Presentation from Text…', icon: <Type size={14} />, onSelect: () => void newPresentationFromText() },
            { label: 'New Song…', icon: <Music size={14} />, onSelect: () => void newSong() },
            { label: 'New Folder', icon: <FolderPlus size={14} />, onSelect: () => newFolder('library') }
          ]
        : [
            { label: 'New Playlist', icon: <ListPlus size={14} />, onSelect: newPlaylist },
            { label: 'New Folder', icon: <FolderPlus size={14} />, onSelect: () => newFolder('playlists') }
          ]
    )
  }

  return (
    <div
      ref={listRef}
      className={`tree${rootDrop ? ' drop-root' : ''}`}
      role="tree"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={() => setFocusZone(scope)}
      onContextMenu={onBackgroundContext}
      onDragOver={(e) => {
        const payload = currentDrag()
        if (payload && resolveDrop(project, scope, null, payload, 'after')) {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
          setRootDrop(true)
          if (dropTarget) setDropTarget(null)
        }
      }}
      onDragLeave={(e) => {
        if (!listRef.current?.contains(e.relatedTarget as Node)) {
          setDropTarget(null)
          setRootDrop(false)
        }
      }}
      onDrop={(e) => {
        setRootDrop(false)
        const payload = currentDrag()
        const action = payload && resolveDrop(project, scope, null, payload, 'after')
        if (action) {
          e.preventDefault()
          action()
          endDrag()
        }
      }}
    >
      {rows.length === 0 && (
        <div className="tree-empty">
          {scope === 'library' ? 'No presentations yet. Right-click or use + to create one.' : "No playlists yet. Create one to build this profile's service order."}
        </div>
      )}
      {rows.map((row) => (
        <RowView
          key={row.key}
          row={row}
          project={project}
          selected={isRowSelected(row)}
          expanded={row.type === 'node' && !!expanded[row.id]}
          renaming={row.type === 'node' && renamingId === row.id}
          drop={dropTarget?.key === row.key ? dropTarget.position : null}
          onRowClick={selectRow}
          onToggle={(id) => ui.toggleExpanded(id)}
          onContext={onContext}
          onDragOverRow={onDragOverRow}
          onDropRow={onDropRow}
        />
      ))}
    </div>
  )
}
