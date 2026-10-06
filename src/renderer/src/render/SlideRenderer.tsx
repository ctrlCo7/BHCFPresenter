/**
 * Slide drawing. `SlideContent` draws a slide at its logical canvas size (absolute children);
 * `SlideRenderer` wraps it in a GPU-scaled viewport. The same code draws thumbnails, the
 * editor canvas, the preview/program monitors and the output windows, so what the operator
 * sees is exactly what goes out.
 */
import { createContext, memo, useContext, useEffect, useState, type CSSProperties, type ReactElement } from 'react'
import { mediaUrl, thumbnailUrl } from '@shared/media'
import type { Background, CanvasSize, Id, MediaAsset, Slide, SlideElement, TextElement } from '@shared/model/types'
import { hasTokens, resolveTokens, type TimerView } from '@shared/timers'
import { boxShadowFilter, fillCss, gradientCss, textCss, textShadowCss, VERTICAL_JUSTIFY } from './css'
import { fittedFontSize } from './textFit'
import './render.css'

/**
 * thumbnail: static frames; editor: static, but full quality; preview: muted playback;
 * output: playback with sound where allowed.
 */
export type RenderMode = 'thumbnail' | 'editor' | 'preview' | 'output'

/** Live timers for {timer:Name} / {clock} text tokens. */
export const TimersContext = createContext<TimerView[]>([])

function useNow(active: boolean, intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const t = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(t)
  }, [active, intervalMs])
  return now
}

function MissingMedia({ label }: { label: string }): ReactElement {
  return <div className="sr-missing">{label}</div>
}

function VideoView({
  asset,
  fit,
  loop,
  muted,
  mode,
  style
}: {
  asset: MediaAsset
  fit: string
  loop: boolean
  muted: boolean
  mode: RenderMode
  style?: CSSProperties
}): ReactElement {
  const plays = mode === 'preview' || mode === 'output'
  if (!plays && asset.thumbnail) {
    return <img className="sr-fill" style={{ objectFit: fit as CSSProperties['objectFit'], ...style }} src={thumbnailUrl(asset.thumbnail)} alt="" draggable={false} decoding="async" />
  }
  return (
    <video
      className="sr-fill"
      style={{ objectFit: fit as CSSProperties['objectFit'], ...style }}
      // When not playing, a media fragment shows a representative frame.
      src={plays ? mediaUrl(asset.fileName) : `${mediaUrl(asset.fileName)}#t=0.5`}
      autoPlay={plays}
      loop={loop}
      muted={muted}
      playsInline
      preload={plays ? 'auto' : 'metadata'}
    />
  )
}

export function BackgroundView({ bg, media, mode }: { bg: Background; media: Record<Id, MediaAsset>; mode: RenderMode }): ReactElement | null {
  switch (bg.type) {
    case 'none':
      return null
    case 'color':
      return <div className="sr-fill" style={{ backgroundColor: bg.color }} />
    case 'gradient':
      return <div className="sr-fill" style={{ backgroundImage: gradientCss(bg.gradient) }} />
    case 'image': {
      const asset = media[bg.mediaId]
      if (!asset) return <MissingMedia label="Missing background image" />
      return <img className="sr-fill" style={{ objectFit: bg.fit }} src={mediaUrl(asset.fileName)} alt="" draggable={false} decoding="async" />
    }
    case 'video': {
      const asset = media[bg.mediaId]
      if (!asset) return <MissingMedia label="Missing background video" />
      return <VideoView asset={asset} fit={bg.fit} loop={bg.loop} muted mode={mode} />
    }
  }
}

function TextView({ el }: { el: TextElement }): ReactElement {
  const timers = useContext(TimersContext)
  const tokens = hasTokens(el.text)
  const now = useNow(tokens)
  const text = tokens ? resolveTokens(el.text, timers, now) : el.text
  const fontSize = fittedFontSize(tokens ? { ...el, text } : el)
  return (
    <div className="sr-text" style={{ padding: el.padding, backgroundColor: el.fill ?? undefined, justifyContent: VERTICAL_JUSTIFY[el.style.verticalAlign] }}>
      <div className="sr-text-inner" style={{ ...textCss(el.style, fontSize), textShadow: textShadowCss(el.shadow) }}>
        {text}
      </div>
    </div>
  )
}

export function ElementView({
  el,
  media,
  mode,
  audio
}: {
  el: SlideElement
  media: Record<Id, MediaAsset>
  mode: RenderMode
  audio: boolean
}): ReactElement | null {
  if (el.hidden) return null
  const frame: CSSProperties = {
    left: el.frame.x,
    top: el.frame.y,
    width: el.frame.width,
    height: el.frame.height,
    opacity: el.opacity,
    transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined
  }
  let content: ReactElement
  switch (el.type) {
    case 'text':
      content = <TextView el={el} />
      break
    case 'shape':
      content = (
        <div
          className="sr-fill"
          style={{
            ...fillCss(el.fill),
            borderRadius: el.shape === 'ellipse' ? '50%' : el.cornerRadius,
            border: el.strokeWidth > 0 ? `${el.strokeWidth}px solid ${el.strokeColor}` : undefined,
            filter: boxShadowFilter(el.shadow)
          }}
        />
      )
      break
    case 'image': {
      const asset = media[el.mediaId]
      content = asset ? (
        <img className="sr-fill" style={{ objectFit: el.fit, filter: boxShadowFilter(el.shadow) }} src={mediaUrl(asset.fileName)} alt="" draggable={false} decoding="async" />
      ) : (
        <MissingMedia label="Missing image" />
      )
      break
    }
    case 'video': {
      const asset = media[el.mediaId]
      content = asset ? (
        <VideoView asset={asset} fit={el.fit} loop={el.loop} muted={!(audio && mode === 'output' && !el.muted)} mode={mode} style={{ filter: boxShadowFilter(el.shadow) }} />
      ) : (
        <MissingMedia label="Missing video" />
      )
      break
    }
  }
  return (
    <div className="sr-element" style={frame}>
      {content}
    </div>
  )
}

export interface SlideContentProps {
  slide: Slide
  /** Background to draw underneath; null draws none (e.g. overlays, separate background layer) */
  background: Background | null
  media: Record<Id, MediaAsset>
  mode: RenderMode
  /** This instance may play element audio */
  audio?: boolean
  /** Element ids not to draw (e.g. the text box being edited in place) */
  hiddenIds?: ReadonlySet<Id>
}

/** A slide at logical canvas size; position it inside a scaled stage. */
export const SlideContent = memo(function SlideContent({ slide, background, media, mode, audio = false, hiddenIds }: SlideContentProps): ReactElement {
  return (
    <>
      {background && <BackgroundView bg={background} media={media} mode={mode} />}
      {slide.elements.map((el) => (hiddenIds?.has(el.id) ? null : <ElementView key={el.id} el={el} media={media} mode={mode} audio={audio} />))}
    </>
  )
})

export interface SlideRendererProps {
  slide: Slide
  /** Fallback background when the slide has none (presentation → project default) */
  inheritedBackground: Background
  canvas: CanvasSize
  media: Record<Id, MediaAsset>
  /** Rendered width in CSS px; height follows the canvas aspect ratio */
  width: number
  mode: RenderMode
}

export const SlideRenderer = memo(function SlideRenderer({ slide, inheritedBackground, canvas, media, width, mode }: SlideRendererProps): ReactElement {
  const scale = width / canvas.width
  const height = Math.round(canvas.height * scale)
  const bg = slide.background ?? inheritedBackground
  return (
    <div className={`sr-viewport${bg.type === 'none' ? ' sr-transparent' : ''}`} style={{ width, height }} title={bg.type === 'none' ? 'Transparent background — the live background video shows through' : undefined}>
      <div className="sr-stage" style={{ width: canvas.width, height: canvas.height, transform: `scale(${scale})` }}>
        <SlideContent slide={slide} background={bg} media={media} mode={mode} />
      </div>
    </div>
  )
})
