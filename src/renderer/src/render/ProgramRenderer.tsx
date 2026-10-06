/**
 * Draws the live program from a LiveState: background → slide → media cue → overlays →
 * logo → black, each layer with its own animated transition. Used by audience outputs and
 * by the operator's Program monitor.
 */
import { memo, useMemo, useRef, type ReactElement } from 'react'
import type { LiveState } from '@shared/live'
import { mediaUrl } from '@shared/media'
import type { TransitionSpec } from '@shared/model/types'
import { LayerStack } from './LayerStack'
import { MediaLayer } from './MediaLayer'
import { BackgroundView, SlideContent, TimersContext } from './SlideRenderer'
import './render.css'

export interface ProgramRendererProps {
  live: LiveState
  /** Box to fit into (letterboxed to the canvas aspect ratio) */
  width: number
  height: number
  /** This instance plays sound */
  audio: boolean
}

export const ProgramRenderer = memo(function ProgramRenderer({ live, width, height, audio }: ProgramRendererProps): ReactElement {
  const { canvas } = live
  const scale = Math.min(width / canvas.width, height / canvas.height)
  const offsetX = (width - canvas.width * scale) / 2
  const offsetY = (height - canvas.height * scale) / 2
  const slideSpec: TransitionSpec = live.slide?.transition ?? live.fade

  // Overlays leave with an animation, so remember every overlay seen and render a stack for each.
  const seenOverlays = useRef<string[]>([])
  for (const o of live.overlays) if (!seenOverlays.current.includes(o.id)) seenOverlays.current.push(o.id)
  const activeOverlays = useMemo(() => new Map(live.overlays.map((o) => [o.id, o.slide])), [live.overlays])

  const mediaAsset = live.media ? live.assets[live.media.mediaId] : undefined
  const bgAsset = live.backgroundMedia ? live.assets[live.backgroundMedia.mediaId] : undefined
  const logoAsset = live.logo ? live.assets[live.logo] : undefined

  return (
    <div className="program-viewport" style={{ width, height }}>
      <div
        className="program-stage"
        style={{ width: canvas.width, height: canvas.height, transform: `translate(${offsetX}px, ${offsetY}px) scale(${scale})` }}
      >
        <TimersContext.Provider value={live.timers}>
          {/* Live background (looping motion video) sits under everything; transparent slides show it. */}
          <LayerStack
            itemKey={live.backgroundMedia && bgAsset ? `bgmedia:${live.backgroundMedia.cueId}` : null}
            spec={live.fade}
            node={
              live.backgroundMedia && bgAsset ? (
                <MediaLayer playback={live.backgroundMedia} asset={bgAsset} audio={audio} masterVolume={live.masterVolume} />
              ) : null
            }
          />
          <LayerStack
            itemKey={live.background?.key ?? null}
            spec={slideSpec}
            node={live.background ? <BackgroundView bg={live.background.background} media={live.assets} mode="output" /> : null}
          />
          <LayerStack
            itemKey={live.slide ? `slide:${live.slide.takeId}` : null}
            spec={slideSpec}
            node={live.slide ? <SlideContent slide={live.slide.slide} background={null} media={live.assets} mode="output" audio={audio} /> : null}
          />
          <LayerStack
            itemKey={live.media && mediaAsset ? `media:${live.media.cueId}` : null}
            spec={live.fade}
            node={live.media && mediaAsset ? <MediaLayer playback={live.media} asset={mediaAsset} audio={audio} masterVolume={live.masterVolume} /> : null}
          />
          {seenOverlays.current.map((id) => {
            const slide = activeOverlays.get(id)
            return (
              <LayerStack
                key={id}
                itemKey={slide ? `overlay:${id}` : null}
                spec={live.fade}
                node={slide ? <SlideContent slide={slide} background={null} media={live.assets} mode="output" audio={audio} /> : null}
              />
            )
          })}
          <LayerStack
            itemKey={logoAsset ? `logo:${logoAsset.id}` : null}
            spec={live.fade}
            node={
              logoAsset ? (
                <div className="sr-fill" style={{ background: '#000' }}>
                  <img className="sr-fill" style={{ objectFit: 'contain', padding: '12%' }} src={mediaUrl(logoAsset.fileName)} alt="" draggable={false} />
                </div>
              ) : null
            }
          />
          <LayerStack itemKey={live.black ? 'black' : null} spec={live.fade} node={<div className="sr-fill" style={{ background: '#000' }} />} />
        </TimersContext.Provider>
      </div>
    </div>
  )
})
