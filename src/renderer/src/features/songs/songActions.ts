import { createElement } from 'react'
import { createPresentation, nowIso } from '@shared/model/factory'
import { buildSongSlides, type SongTemplate } from '@shared/model/songs'
import { applyThemeToElement, findTheme, themeTemplate } from '@shared/model/themes'
import type { Background, Id, Presentation, Project, SongData } from '@shared/model/types'
import { addFolder, addPresentation } from '../../engine/projectOps'
import { applyDesignToSlides } from '../../engine/elementOps'
import { dialogs } from '../../store/overlayStore'
import { applyChange, requireProject } from '../../store/projectStore'
import { ui } from '../../store/uiStore'
import { SongEditor, type SongEditorResult } from './SongEditor'

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
    let folderId = d.trees.library.find((id) => d.folders[id]?.name === SONGS_FOLDER)
    folderId ??= addFolder(d, 'library', SONGS_FOLDER).id
    addPresentation(d, pres, folderId)
    d.settings.linesPerSlide = result.linesPerSlide
  })
  ui.set({ treeSelection: { scope: 'library', id: pres.id } })
  ui.openPresentation(pres.id)
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
