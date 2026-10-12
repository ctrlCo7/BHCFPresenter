import { createElement } from 'react'
import { createPresentation, nowIso } from '@shared/model/factory'
import { buildSongSlides, type SongTemplate } from '@shared/model/songs'
import { applyThemeToElement, findTheme, themeTemplate } from '@shared/model/themes'
import type { Background, Id, Presentation, Project, SongData } from '@shared/model/types'
import { addFolder, addPresentation } from '../../engine/projectOps'
import { applyDesignToSlides } from '../../engine/elementOps'
import { songFromFile } from '@shared/songImport'
import { dialogs, errorMessage, toast } from '../../store/overlayStore'
import { applyChange, requireProject } from '../../store/projectStore'
import { ui } from '../../store/uiStore'
import { SongEditor, type SongEditorResult } from './SongEditor'
import { rootList } from '../../engine/tree'

const SONGS_FOLDER = 'Songs'

/** Text style + frame of the song's first text box, so regenerated slides keep their look. */
function templateFrom(p: Project, pres?: Presentation): SongTemplate {
  for (const s of pres?.slides ?? []) {
    const el = s.elements.find((e) => e.type === 'text')
    if (el && el.type === 'text') return { style: el.style, frame: el.frame }
  }
  return { style: p.settings.defaultTextStyle }
}

function songMeta(song: SongData): Record<string, string> {
  const meta: Record<string, string> = {}
  if (song.artist) meta.artist = song.artist
  if (song.copyright) meta.copyright = song.copyright
  if (song.ccli) meta.ccli = song.ccli
  return meta
}

/** Builds slides, styled with the chosen theme or (when keeping the look) the song's current text style. */
function buildSlides(p: Project, song: SongData, maxLines: number, themeId: string | null, existing?: Presentation): ReturnType<typeof buildSongSlides> {
  const theme = findTheme(themeId ?? undefined)
  const template = theme ? themeTemplate(theme, p.settings.canvas, p.settings.defaultTextStyle) : templateFrom(p, existing)
  const built = buildSongSlides(song, p.settings.canvas, template, maxLines)
  if (theme) {
    for (const s of built.slides) {
      const el = s.elements[0]
      if (el?.type === 'text') applyThemeToElement(el, theme, p.settings.canvas)
    }
  } else if (existing?.slides[0]) {
    // Keep the song's whole design (text style, shapes/logos, slide background, transition)
    // by applying its first slide to the regenerated slides, exactly like "Apply to All".
    const ref = existing.slides[0]
    const temp = { ...existing, slides: [ref, ...built.slides] }
    applyDesignToSlides(temp, ref.id, built.slides.map((s) => s.id), { textStyle: true, background: true, decorations: true, transition: true })
    built.slides = temp.slides.slice(1)
  }
  return built
}

function openSongEditor(initial: SongData, background: Background | null, theme: string | null, linesPerSlide: number): Promise<SongEditorResult | null> {
  const media = Object.values(requireProject().media)
  return dialogs.custom<SongEditorResult>({
    title: initial.title ? `Edit Song — ${initial.title}` : 'New Song',
    width: 1080,
    render: (close) => createElement(SongEditor, { initial, initialBackground: background, initialTheme: theme, linesPerSlide, media, onClose: close })
  })
}

export async function newSong(): Promise<void> {
  const p = requireProject()
  const result = await openSongEditor({ title: '', artist: '', copyright: '', ccli: '', sections: [], arrangement: [] }, { type: 'none' }, null, p.settings.linesPerSlide)
  if (!result) return
  const { groups, slides } = buildSlides(p, result.song, result.linesPerSlide, result.themeId)
  const pres = createPresentation(result.song.title, slides, 'song')
  pres.groups = groups
  pres.song = result.song
  pres.meta = { ...songMeta(result.song), ...(result.themeId ? { theme: result.themeId } : {}) }
  pres.background = result.background
  applyChange('New song', (d) => {
    let folderId = rootList(d, 'library').find((id) => d.folders[id]?.name === SONGS_FOLDER)
    folderId ??= addFolder(d, 'library', SONGS_FOLDER).id
    addPresentation(d, pres, folderId)
    d.settings.linesPerSlide = result.linesPerSlide
  })
  ui.set({ treeSelection: { scope: 'library', id: pres.id } })
  ui.openPresentation(pres.id)
}

/** File → Import Songs: text, ChordPro, OpenLyrics and PowerPoint files become songs in the Songs folder. */
export async function importSongs(): Promise<void> {
  let res: Awaited<ReturnType<typeof window.bhcf.songs.importFiles>>
  try {
    res = await window.bhcf.songs.importFiles()
  } catch (err) {
    toast.error('Could not import songs', errorMessage(err))
    return
  }
  if (!res) return
  const p = requireProject()
  const errors = [...res.errors]
  const made: Presentation[] = []
  for (const file of res.files) {
    try {
      const song = songFromFile(file)
      const { groups, slides } = buildSlides(p, song, p.settings.linesPerSlide, null)
      const pres = createPresentation(song.title, slides, 'song')
      pres.groups = groups
      pres.song = song
      pres.meta = songMeta(song)
      pres.background = { type: 'none' }
      made.push(pres)
    } catch (err) {
      errors.push(`${file.name}: ${errorMessage(err)}`)
    }
  }
  const first = made[0]
  if (first) {
    applyChange(made.length === 1 ? 'Import song' : `Import ${made.length} songs`, (d) => {
      let folderId = rootList(d, 'library').find((id) => d.folders[id]?.name === SONGS_FOLDER)
      folderId ??= addFolder(d, 'library', SONGS_FOLDER).id
      for (const pres of made) addPresentation(d, pres, folderId)
    })
    ui.set({ treeSelection: { scope: 'library', id: first.id } })
    ui.openPresentation(first.id)
  }
  if (errors.length) {
    const more = errors.length > 4 ? `\n…and ${errors.length - 4} more` : ''
    toast.error(made.length ? `Imported ${made.length}, skipped ${errors.length}` : 'No songs imported', errors.slice(0, 4).join('\n') + more)
  } else if (made.length) toast.success(made.length === 1 ? 'Song imported' : `${made.length} songs imported`, 'Library › Songs')
}

export async function editSong(presentationId: Id): Promise<void> {
  const p = requireProject()
  const pres = p.presentations[presentationId]
  if (!pres) return
  const initial: SongData = pres.song ?? {
    title: pres.name,
    artist: pres.meta.artist ?? '',
    copyright: pres.meta.copyright ?? '',
    ccli: pres.meta.ccli ?? '',
    // Turn an existing (non-song) presentation's slides into sections.
    sections: pres.slides
      .map((s, i) => ({ id: s.id, name: s.label || `Verse ${i + 1}`, text: s.elements.map((e) => (e.type === 'text' ? e.text : '')).join('\n').trim() }))
      .filter((s) => s.text),
    arrangement: []
  }
  const result = await openSongEditor(initial, pres.background, pres.meta.theme ?? null, p.settings.linesPerSlide)
  if (!result) return
  const { groups, slides } = buildSlides(p, result.song, result.linesPerSlide, result.themeId, pres)
  applyChange('Edit song', (d) => {
    const x = d.presentations[presentationId]
    if (!x) return
    x.kind = 'song'
    x.name = result.song.title
    x.song = result.song
    x.groups = groups
    x.slides = slides
    x.background = result.background
    x.meta = { ...x.meta, ...songMeta(result.song), ...(result.themeId ? { theme: result.themeId } : {}) }
    x.updatedAt = nowIso()
    d.settings.linesPerSlide = result.linesPerSlide
  })
  ui.selectSlides([])
}
