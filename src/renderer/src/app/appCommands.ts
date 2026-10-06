/** Registers every application command and its default shortcut. */
import { isMac, registerCommands, type Command } from '../services/commands'
import { zoneAction } from '../services/focusZones'
import {
  backupNow,
  closeProject,
  newProject,
  openProject,
  restoreFromBackup,
  revealProject,
  saveNow,
  saveProjectAs
} from '../services/projectActions'
import { toast } from '../store/overlayStore'
import { redo, undo, useProjectStore } from '../store/projectStore'
import { ui } from '../store/uiStore'
import { newFolder, newPlaylist, newPresentation, newPresentationFromText } from '../features/library/libraryActions'
import { importMedia } from '../features/media/mediaActions'
import { addSlide } from '../features/presentation/slideActions'
import { showAbout, showShortcuts } from '../features/shell/HelpDialogs'
import { enterEditMode, openEditor } from '../features/editor/editorActions'
import { openSettings } from '../features/settings/SettingsDialog'
import { newSong } from '../features/songs/songActions'
import { openTemplates } from '../features/backgrounds/TemplatesDialog'
import { exportActivePresentation, importPresentationFile } from '../features/presentation/transferActions'
import { cleanupUnusedMedia } from '../features/media/mediaActions'
import { clearAll, clearSlide, mediaStop, mediaToggle, nextSlide, prevSlide, toggleBlack, toggleLogo, toggleOutputs } from '../live/liveActions'
import { live } from '../live/liveStore'

const hasProject = (): boolean => useProjectStore.getState().project !== null
const hasPresentation = (): boolean => hasProject() && ui.get().activePresentationId !== null
/** Arrow / space navigation is live control, except in the editor where arrows nudge elements. */
const liveNav = (): boolean => hasProject() && ui.get().mode !== 'edit'
const hasMedia = (): boolean => live.get().media !== null

/** In text fields, undo/redo/copy/paste act on the text, not the project. */
function nativeEditTarget(): boolean {
  const el = document.activeElement
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el instanceof HTMLElement && el.isContentEditable)
}

export function registerAppCommands(): void {
  const commands: Command[] = [
    // File
    { id: 'file.new', label: 'New Project…', category: 'File', defaultKeys: ['Mod+Shift+N'], allowInInput: true, run: newProject },
    { id: 'file.open', label: 'Open Project…', category: 'File', defaultKeys: ['Mod+O'], allowInInput: true, run: () => openProject() },
    { id: 'file.save', label: 'Save', category: 'File', defaultKeys: ['Mod+S'], allowInInput: true, enabled: hasProject, run: saveNow },
    { id: 'file.saveAs', label: 'Save As…', category: 'File', defaultKeys: ['Mod+Shift+S'], allowInInput: true, enabled: hasProject, run: saveProjectAs },
    { id: 'file.importMedia', label: 'Import Media…', category: 'File', defaultKeys: ['Mod+I'], enabled: hasProject, run: () => void importMedia() },
    { id: 'file.importPresentation', label: 'Import Presentation…', category: 'File', enabled: hasProject, run: importPresentationFile },
    { id: 'file.exportPresentation', label: 'Export Presentation…', category: 'File', enabled: hasPresentation, run: exportActivePresentation },
    { id: 'file.cleanupMedia', label: 'Clean Up Unused Media…', category: 'File', enabled: hasProject, run: cleanupUnusedMedia },
    { id: 'file.settings', label: 'Settings…', category: 'File', defaultKeys: ['Mod+,'], allowInInput: true, run: () => openSettings() },
    { id: 'file.backup', label: 'Back Up Now', category: 'File', enabled: hasProject, run: backupNow },
    { id: 'file.restore', label: 'Restore from Backup…', category: 'File', enabled: hasProject, run: restoreFromBackup },
    { id: 'file.reveal', label: 'Show Project Folder', category: 'File', enabled: hasProject, run: revealProject },
    { id: 'file.close', label: 'Close Project', category: 'File', enabled: hasProject, run: closeProject },

    // Edit
    {
      id: 'edit.undo',
      label: 'Undo',
      category: 'Edit',
      defaultKeys: ['Mod+Z'],
      enabled: () => useProjectStore.getState().past.length > 0,
      run: () => {
        const label = undo()
        if (label) toast.info(`Undo: ${label}`)
      }
    },
    {
      id: 'edit.redo',
      label: 'Redo',
      category: 'Edit',
      defaultKeys: ['Mod+Y', 'Mod+Shift+Z'],
      enabled: () => useProjectStore.getState().future.length > 0,
      run: () => {
        const label = redo()
        if (label) toast.info(`Redo: ${label}`)
      }
    },
    { id: 'edit.copy', label: 'Copy', category: 'Edit', defaultKeys: ['Mod+C'], enabled: () => !nativeEditTarget(), run: () => zoneAction('copy')?.() },
    { id: 'edit.paste', label: 'Paste', category: 'Edit', defaultKeys: ['Mod+V'], enabled: () => !nativeEditTarget(), run: () => zoneAction('paste')?.() },
    { id: 'edit.duplicate', label: 'Duplicate', category: 'Edit', defaultKeys: ['Mod+D'], enabled: hasProject, run: () => zoneAction('duplicate')?.() },
    { id: 'edit.rename', label: 'Rename / Label', category: 'Edit', defaultKeys: ['F2'], enabled: hasProject, run: () => zoneAction('rename')?.() },
    { id: 'edit.delete', label: 'Delete', category: 'Edit', defaultKeys: isMac ? ['Backspace', 'Delete'] : ['Delete'], enabled: hasProject, run: () => zoneAction('delete')?.() },
    { id: 'edit.selectAll', label: 'Select All', category: 'Edit', defaultKeys: ['Mod+A'], enabled: hasProject, run: () => zoneAction('selectAll')?.() },
    {
      id: 'edit.find',
      label: 'Find in Library',
      category: 'Edit',
      defaultKeys: ['Mod+F'],
      allowInInput: true,
      enabled: hasProject,
      run: () => {
        const input = document.getElementById('library-search') as HTMLInputElement | null
        input?.focus()
        input?.select()
      }
    },

    // Library
    { id: 'library.newPresentation', label: 'New Presentation', category: 'Library', defaultKeys: ['Mod+N'], allowInInput: true, enabled: hasProject, run: newPresentation },
    { id: 'library.newFromText', label: 'New Presentation from Text…', category: 'Library', defaultKeys: ['Mod+Shift+T'], enabled: hasProject, run: newPresentationFromText },
    { id: 'library.newSong', label: 'New Song…', category: 'Library', defaultKeys: ['Mod+Shift+L'], enabled: hasProject, run: newSong },
    { id: 'library.templates', label: 'Templates (Backgrounds & Lyric Themes)…', category: 'Library', defaultKeys: ['Mod+T'], enabled: hasProject, run: () => openTemplates('backgrounds') },
    { id: 'library.newFolder', label: 'New Library Folder', category: 'Library', enabled: hasProject, run: () => newFolder('library') },
    { id: 'library.newPlaylist', label: 'New Playlist', category: 'Library', defaultKeys: ['Mod+Shift+P'], enabled: hasProject, run: newPlaylist },
    { id: 'library.newPlaylistFolder', label: 'New Playlist Folder', category: 'Library', enabled: hasProject, run: () => newFolder('playlists') },

    // Slides
    { id: 'slides.add', label: 'New Slide', category: 'Slides', defaultKeys: ['Mod+Enter'], enabled: hasPresentation, run: addSlide },
    {
      id: 'slides.edit',
      label: 'Edit Slide in Editor',
      category: 'Slides',
      defaultKeys: ['E'],
      enabled: () => hasPresentation() && ui.get().mode !== 'edit',
      run: () => {
        const id = ui.get().activePresentationId
        if (id) openEditor(id, ui.get().selectedSlideIds[0])
      }
    },

    // Live
    { id: 'live.next', label: 'Next Slide', category: 'Live', defaultKeys: ['Space', 'ArrowRight', 'PageDown'], enabled: liveNav, run: nextSlide },
    { id: 'live.prev', label: 'Previous Slide', category: 'Live', defaultKeys: ['ArrowLeft', 'PageUp'], enabled: liveNav, run: prevSlide },
    { id: 'live.black', label: 'Black Screen', category: 'Live', defaultKeys: ['B'], enabled: hasProject, run: toggleBlack },
    { id: 'live.clear', label: 'Clear Slide', category: 'Live', defaultKeys: ['C'], enabled: hasProject, run: clearSlide },
    { id: 'live.clearAll', label: 'Clear All', category: 'Live', defaultKeys: ['Shift+C'], enabled: hasProject, run: clearAll },
    { id: 'live.logo', label: 'Logo Screen', category: 'Live', defaultKeys: ['L'], enabled: hasProject, run: toggleLogo },
    { id: 'live.outputs', label: 'Outputs On / Off (fullscreen)', category: 'Live', defaultKeys: ['F'], run: toggleOutputs },
    {
      id: 'live.exit',
      label: 'Exit Live Mode',
      category: 'Live',
      defaultKeys: ['Escape'],
      enabled: () => ui.get().mode === 'live',
      run: () => void ui.set({ mode: 'show' })
    },

    // Media
    { id: 'media.toggle', label: 'Play / Pause Media', category: 'Media', defaultKeys: ['P'], enabled: hasMedia, run: mediaToggle },
    { id: 'media.stop', label: 'Stop Media', category: 'Media', defaultKeys: ['Shift+P'], enabled: hasMedia, run: mediaStop },

    // View
    { id: 'view.show', label: 'Show Mode', category: 'View', defaultKeys: ['Mod+1'], enabled: hasProject, run: () => void ui.set({ mode: 'show' }) },
    { id: 'view.edit', label: 'Edit Mode', category: 'View', defaultKeys: ['Mod+2'], enabled: hasProject, run: enterEditMode },
    { id: 'view.live', label: 'Live Mode', category: 'View', defaultKeys: ['Mod+3'], enabled: hasProject, run: () => void ui.set({ mode: 'live' }) },
    {
      id: 'view.toggleMedia',
      label: 'Toggle Media Bin',
      category: 'View',
      defaultKeys: ['Mod+M'],
      enabled: hasProject,
      run: () => ui.setLayout({ bottomOpen: !ui.get().layout.bottomOpen })
    },
    { id: 'view.zoomIn', label: 'Larger Thumbnails', category: 'View', defaultKeys: ['Mod+='], run: () => void ui.set({ thumbWidth: Math.min(420, ui.get().thumbWidth + 30) }) },
    { id: 'view.zoomOut', label: 'Smaller Thumbnails', category: 'View', defaultKeys: ['Mod+-'], run: () => void ui.set({ thumbWidth: Math.max(120, ui.get().thumbWidth - 30) }) },
    { id: 'view.devtools', label: 'Developer Tools', category: 'View', run: () => void window.bhcf.app.toggleDevtools() },

    // Help
    { id: 'help.shortcuts', label: 'Keyboard Shortcuts', category: 'Help', defaultKeys: ['Mod+/'], allowInInput: true, run: showShortcuts },
    { id: 'help.about', label: 'About BHCF Presenter', category: 'Help', run: showAbout }
  ]
  registerCommands(commands)
}
