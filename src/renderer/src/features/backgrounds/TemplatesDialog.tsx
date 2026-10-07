import { Check, Clapperboard, Image as ImageIcon, Loader2, Palette as PaletteIcon, Sparkles } from 'lucide-react'
import { createElement, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { createSlide } from '@shared/model/factory'
import { applyThemeToElement, applyThemeToPresentation, LYRIC_THEMES, type LyricTheme } from '@shared/model/themes'
import type { Background, Slide } from '@shared/model/types'
import { Segmented, Toggle } from '../../components/ui/fields'
import { playBackground } from '../../live/liveActions'
import { SlideRenderer } from '../../render/SlideRenderer'
import { dialogs, errorMessage, toast } from '../../store/overlayStore'
import { applyChange, useProjectStore } from '../../store/projectStore'
import { useUiStore } from '../../store/uiStore'
import { addNewMedia } from '../media/mediaActions'
import { useElementWidth } from '../monitor/PreviewMonitor'
import { LOOP_SECONDS, PALETTES, PRESETS, recordMotionLoop, renderStill, type MotionPreset, type Palette } from './motionPresets'
import './templates.css'

export type TemplatesTab = 'backgrounds' | 'themes'

/** Small live preview drawing the preset continuously. */
function PresetPreview({ preset, palette }: { preset: MotionPreset; palette: Palette }): ReactElement {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    let raf = 0
    const loop = (): void => {
      const p = (performance.now() % (LOOP_SECONDS * 1000)) / (LOOP_SECONDS * 1000)
      preset.draw(ctx, p, canvas.width, canvas.height, palette)
      raf = requestAnimationFrame(loop)
    }
    loop()
    return () => cancelAnimationFrame(raf)
  }, [preset, palette])
  return <canvas ref={ref} width={320} height={180} className="tpl-canvas" />
}

function BackgroundsTab(): ReactElement {
  const [palette, setPalette] = useState<Palette>(PALETTES[0] as Palette)
  const [useNow, setUseNow] = useState(true)
  const [busy, setBusy] = useState<{ id: string; progress: number } | null>(null)
  const [done, setDone] = useState<string[]>([])

  const make = async (preset: MotionPreset, kind: 'video' | 'still'): Promise<void> => {
    if (busy) return
    const key = `${preset.id}-${palette.id}-${kind}`
    setBusy({ id: key, progress: 0 })
    try {
      const name = `${preset.name} (${palette.name})${kind === 'still' ? ' Still' : ''}`
      const bytes = kind === 'video' ? await recordMotionLoop(preset, palette, (progress) => setBusy({ id: key, progress })) : await renderStill(preset, palette)
      const asset = await window.bhcf.media.saveGenerated(name, kind === 'video' ? 'webm' : 'png', bytes)
      await addNewMedia([asset], `Add background ${name}`)
      setDone((d) => [...d, key])
      if (useNow) playBackground(asset.id)
      toast.success(kind === 'video' ? 'Motion background added' : 'Background image added', `${name} is in the Media tab${useNow ? ' and playing behind your lyrics' : ''}.`)
    } catch (err) {
      toast.error('Could not create the background', errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="tpl-body">
      <div className="tpl-toolbar">
        <span className="muted">Colour</span>
        <Segmented value={palette.id} options={PALETTES.map((p) => ({ value: p.id, label: <span className="tpl-swatch" style={{ background: `linear-gradient(135deg, ${p.colors[1]}, ${p.colors[2]})` }} title={p.name} /> }))} onChange={(id) => setPalette(PALETTES.find((p) => p.id === id) as Palette)} />
        <span className="tpl-spacer" />
        <Toggle checked={useNow} onChange={setUseNow} label="Play behind lyrics right away" />
      </div>
      <p className="muted tpl-hint">
        Original loops made by the app — free to use, no download needed. A video loop takes about {LOOP_SECONDS} seconds to create and is saved in your project's media.
      </p>
      <div className="tpl-grid">
        {PRESETS.map((preset) => {
          const vKey = `${preset.id}-${palette.id}-video`
          const sKey = `${preset.id}-${palette.id}-still`
          const recording = busy?.id === vKey
          return (
            <div key={preset.id} className="tpl-card">
              <div className="tpl-preview">
                <PresetPreview preset={preset} palette={palette} />
                {recording && (
                  <div className="tpl-progress">
                    <div style={{ width: `${Math.round((busy?.progress ?? 0) * 100)}%` }} />
                  </div>
                )}
              </div>
              <div className="tpl-name">{preset.name}</div>
              <div className="tpl-actions">
                <button className="btn primary" disabled={!!busy} onClick={() => void make(preset, 'video')}>
                  {recording ? <Loader2 size={13} className="spin" /> : done.includes(vKey) ? <Check size={13} /> : <Clapperboard size={13} />}
                  {recording ? `Creating ${Math.round((busy?.progress ?? 0) * 100)}%` : 'Video loop'}
                </button>
                <button className="btn" disabled={!!busy} onClick={() => void make(preset, 'still')}>
                  {done.includes(sKey) ? <Check size={13} /> : <ImageIcon size={13} />} Still
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

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
          <Sparkles size={14} /> Motion Backgrounds
        </button>
        <button className={tab === 'themes' ? 'active' : ''} onClick={() => setTab('themes')}>
          <PaletteIcon size={14} /> Lyric Themes
        </button>
      </div>
      {tab === 'backgrounds' ? <BackgroundsTab /> : <ThemesTab />}
    </div>
  )
}

export function openTemplates(tab: TemplatesTab = 'backgrounds'): void {
  void dialogs.custom<void>({ title: 'Templates', width: 1120, render: () => createElement(Templates, { initial: tab }) })
}
