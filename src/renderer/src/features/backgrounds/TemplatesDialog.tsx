import { Check, Clapperboard, Palette as PaletteIcon } from 'lucide-react'
import { createElement, useMemo, useState, type ReactElement } from 'react'
import { createSlide } from '@shared/model/factory'
import { applyThemeToElement, applyThemeToPresentation, LYRIC_THEMES, type LyricTheme } from '@shared/model/themes'
import type { Background, Slide } from '@shared/model/types'
import { SlideRenderer } from '../../render/SlideRenderer'
import { dialogs, toast } from '../../store/overlayStore'
import { applyChange, useProjectStore } from '../../store/projectStore'
import { useUiStore } from '../../store/uiStore'
import { useElementWidth } from '../monitor/PreviewMonitor'
import { FolderBackgroundsTab } from './FolderBackgroundsTab'
import './templates.css'

/** 'backgrounds' = the videos and images of the backgrounds folder (My Backgrounds). */
export type TemplatesTab = 'backgrounds' | 'themes'

const SAMPLE_BG: Background = { type: 'gradient', gradient: { kind: 'linear', angle: 135, stops: [{ color: '#0f3d22', position: 0 }, { color: '#1e3a8a', position: 1 }] } }

function ThemePreview({ slide, canvas, background }: { slide: Slide; canvas: { width: number; height: number }; background?: Background | null }): ReactElement {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  return (
    <div ref={ref} className="tpl-preview">
      {width > 0 && <SlideRenderer slide={slide} inheritedBackground={background && background.type !== 'none' ? background : SAMPLE_BG} canvas={canvas} media={{}} width={width} mode="thumbnail" />}
    </div>
  )
}

function themeSample(theme: LyricTheme, canvas: { width: number; height: number }): Slide {
  const s = createSlide(canvas, 'Amazing grace how sweet the sound\nThat saved a wretch like me')
  const el = s.elements[0]
  if (el?.type === 'text') applyThemeToElement(el, theme, canvas)
  return s
}

function ThemesTab(): ReactElement {
  const project = useProjectStore((s) => s.project)
  const activeId = useUiStore((s) => s.activePresentationId)
  const pres = activeId ? project?.presentations[activeId] : undefined
  const canvas = project?.settings.canvas ?? { width: 1920, height: 1080 }
  const samples = useMemo(() => LYRIC_THEMES.map((t) => ({ theme: t, slide: themeSample(t, canvas) })), [canvas])
  const current = pres?.meta.theme

  const apply = (theme: LyricTheme): void => {
    if (!pres || !project) return
    applyChange(`Apply theme ${theme.name}`, (d) => {
      const x = d.presentations[pres.id]
      if (x) applyThemeToPresentation(x, theme, project.settings.canvas)
    })
    toast.success(`Theme applied to ${pres.name}`, theme.background?.type === 'none' ? 'Background set to transparent — play a background video behind it.' : undefined)
  }

  return (
    <div className="tpl-body">
      <p className="muted tpl-hint">
        {pres ? (
          <>
            Click a theme to restyle <b>{pres.name}</b> ({pres.slides.length} slides). Most themes make the background transparent so your live background video shows through; Midnight, Forest Dawn and Paper & Ink bring their own background. Undo with Ctrl+Z.
          </>
        ) : (
          'Open a song or presentation first, then pick a theme here. New songs can choose a theme in the song editor.'
        )}
      </p>
      <div className="tpl-grid">
        {samples.map(({ theme, slide }) => (
          <button key={theme.id} className={`tpl-card tpl-theme${current === theme.id ? ' current' : ''}`} disabled={!pres} onClick={() => apply(theme)}>
            <ThemePreview slide={slide} canvas={canvas} background={theme.background} />
            <div className="tpl-name">
              {theme.name} {current === theme.id && <Check size={13} />}
            </div>
            <div className="muted tpl-desc">{theme.description}</div>
          </button>
        ))}
      </div>
    </div>
  )
}

function Templates({ initial }: { initial: TemplatesTab }): ReactElement {
  const [tab, setTab] = useState<TemplatesTab>(initial)
  return (
    <div className="templates">
      <div className="tpl-tabs">
        <button className={tab === 'backgrounds' ? 'active' : ''} onClick={() => setTab('backgrounds')}>
          <Clapperboard size={14} /> My Backgrounds
        </button>
        <button className={tab === 'themes' ? 'active' : ''} onClick={() => setTab('themes')}>
          <PaletteIcon size={14} /> Lyric Themes
        </button>
      </div>
      {tab === 'backgrounds' ? <FolderBackgroundsTab /> : <ThemesTab />}
    </div>
  )
}

export function openTemplates(tab: TemplatesTab = 'backgrounds'): void {
  void dialogs.custom<void>({ title: 'Templates', width: 1120, render: () => createElement(Templates, { initial: tab }) })
}
