/**
 * Full-screen media cue (video, audio or still). Playback follows the shared timeline in
 * MediaPlayback: each window seeks to the computed position and corrects drift above 0.3 s,
 * so the operator's monitor and every output stay in sync without streaming frames.
 */
import { useEffect, useRef, type ReactElement } from 'react'
import { mediaPosition, type MediaPlayback } from '@shared/live'
import { mediaUrl } from '@shared/media'
import type { MediaAsset } from '@shared/model/types'

const DRIFT_TOLERANCE_S = 0.3

export function MediaLayer({
  playback,
  asset,
  audio,
  masterVolume,
  showVideo = true
}: {
  playback: MediaPlayback
  asset: MediaAsset
  /** This window is the audio target */
  audio: boolean
  masterVolume: number
  showVideo?: boolean
}): ReactElement | null {
  const ref = useRef<HTMLVideoElement & HTMLAudioElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const sync = (): void => {
      const duration = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : asset.durationSec
      const target = mediaPosition(playback, Date.now(), duration)
      if (Math.abs(el.currentTime - target) > DRIFT_TOLERANCE_S) el.currentTime = target
      const ended = !playback.loop && duration !== null && target >= duration - 0.05
      if (playback.playing && el.paused && !ended) void el.play().catch(() => undefined)
      if ((!playback.playing || ended) && !el.paused) el.pause()
    }
    sync()
    const timer = window.setInterval(sync, 1000)
    el.addEventListener('loadedmetadata', sync)
    return () => {
      window.clearInterval(timer)
      el.removeEventListener('loadedmetadata', sync)
    }
  }, [playback, asset.durationSec])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.muted = !audio || playback.muted
    el.volume = Math.max(0, Math.min(1, playback.volume * masterVolume))
  }, [audio, playback.muted, playback.volume, masterVolume])

  const src = mediaUrl(asset.fileName)
  if (asset.kind === 'image') {
    return <img className="sr-fill media-cue" style={{ objectFit: playback.fit }} src={src} alt="" draggable={false} />
  }
  if (asset.kind === 'audio') {
    // Audio cues are invisible; only the audio target loads them.
    return audio ? <audio ref={ref} src={src} preload="auto" loop={playback.loop} /> : null
  }
  return (
    <video
      ref={ref}
      className="sr-fill media-cue"
      style={{ objectFit: playback.fit, background: '#000', visibility: showVideo ? 'visible' : 'hidden' }}
      src={src}
      preload="auto"
      playsInline
      loop={playback.loop}
    />
  )
}
