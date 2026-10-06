/** Project lifecycle flows: new / open / save / save as / close / backup / restore. */
import { createElement } from 'react'
import type { OpenedProject } from '@shared/ipc'
import { flushSave } from './autosave'
import { dialogs, errorMessage, toast } from '../store/overlayStore'
import { loadProject, unloadProject, useProjectStore } from '../store/projectStore'
import { ui } from '../store/uiStore'
import { BackupPicker } from '../features/shell/BackupPicker'

function adopt(opened: OpenedProject): void {
  ui.resetForProject()
  loadProject(opened)
  if (opened.recoveredFrom) {
    toast.warning('Project recovered', `The main project file was unreadable, so it was restored from ${opened.recoveredFrom}.`)
  }
  if (opened.repairs.length > 0) {
    const shown = opened.repairs.slice(0, 4).join('\n')
    const more = opened.repairs.length > 4 ? `\n…and ${opened.repairs.length - 4} more.` : ''
    toast.warning(`Repaired ${opened.repairs.length} problem(s) while loading`, shown + more)
  }
}

/** Saves the current project before leaving it. Asks before discarding if saving fails. */
async function leaveCurrentProject(): Promise<boolean> {
  if (!useProjectStore.getState().project) return true
  try {
    await flushSave()
    return true
  } catch (err) {
    return dialogs.confirm({
      title: 'Unsaved changes',
      message: `The project could not be saved (${errorMessage(err)}). Leave anyway and lose the latest changes?`,
      confirmLabel: 'Leave without saving',
      danger: true
    })
  }
}

export async function newProject(): Promise<void> {
  const name = await dialogs.prompt({
    title: 'New Project',
    label: 'Project name',
    placeholder: 'e.g. Sunday Services',
    confirmLabel: 'Create',
    validate: (v) => (v.trim() ? null : 'Enter a name')
  })
  if (!name || !(await leaveCurrentProject())) return
  try {
    adopt(await window.bhcf.project.create(name))
    toast.success('Project created', name)
  } catch (err) {
    toast.error('Could not create project', errorMessage(err))
  }
}

export async function openProject(path?: string): Promise<void> {
  if (!(await leaveCurrentProject())) return
  try {
    const opened = await window.bhcf.project.open(path)
    if (opened) adopt(opened)
  } catch (err) {
    toast.error('Could not open project', errorMessage(err))
  }
}

export async function openLastProject(): Promise<void> {
  try {
    const opened = await window.bhcf.project.openLast()
    if (opened) adopt(opened)
  } catch (err) {
    toast.error('Could not reopen the last project', errorMessage(err))
  }
}

export async function saveNow(): Promise<void> {
  try {
    await flushSave()
    toast.success('Project saved')
  } catch (err) {
    toast.error('Save failed', errorMessage(err))
  }
}

export async function saveProjectAs(): Promise<void> {
  const { project } = useProjectStore.getState()
  if (!project) return
  try {
    await flushSave()
  } catch {
    /* save-as writes the in-memory state anyway */
  }
  try {
    const opened = await window.bhcf.project.saveAs(project)
    if (opened) {
      adopt(opened)
      toast.success('Saved a copy', `Now working in "${opened.project.name}".`)
    }
  } catch (err) {
    toast.error('Save As failed', errorMessage(err))
  }
}

export async function closeProject(): Promise<void> {
  if (!(await leaveCurrentProject())) return
  await window.bhcf.project.close().catch(() => undefined)
  ui.resetForProject()
  unloadProject()
}

export async function backupNow(): Promise<void> {
  const { project } = useProjectStore.getState()
  if (!project) return
  try {
    await window.bhcf.project.backup(project, 'manual')
    toast.success('Backup created')
  } catch (err) {
    toast.error('Backup failed', errorMessage(err))
  }
}

export async function restoreFromBackup(): Promise<void> {
  if (!useProjectStore.getState().project) return
  let backups
  try {
    backups = await window.bhcf.project.listBackups()
  } catch (err) {
    toast.error('Could not list backups', errorMessage(err))
    return
  }
  if (backups.length === 0) {
    toast.info('No backups yet', 'Backups are created when a project is opened, every 10 minutes while you work, and on demand.')
    return
  }
  const chosen = await dialogs.custom<string>({
    title: 'Restore from Backup',
    width: 520,
    render: (close) => createElement(BackupPicker, { backups, onPick: close })
  })
  if (!chosen) return
  try {
    await flushSave().catch(() => undefined)
    const current = useProjectStore.getState().project
    if (!current) return
    adopt(await window.bhcf.project.restoreBackup(chosen, current))
    toast.success('Backup restored', 'Your previous state was saved as a "before-restore" backup.')
  } catch (err) {
    toast.error('Restore failed', errorMessage(err))
  }
}

export async function revealProject(): Promise<void> {
  await window.bhcf.project.reveal().catch((err: unknown) => toast.error('Could not open folder', errorMessage(err)))
}
