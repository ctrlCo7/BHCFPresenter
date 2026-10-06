import { Clapperboard, Film, Music, Pause, Play, Repeat, Square, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useRef, useState, type ReactElement } from 'react'
import { mediaPosition } from '@shared/live'
import { backgroundToggleMute, mediaSeek, mediaSetLoop, mediaSetVolume, mediaStop, mediaToggle, mediaToggleMute, stopBackground } from '../../live/liveActions'
import { useLiveStore } from '../../live/liveStore'
import { useProjectStore } from '../../store/projectStore'
import { formatDuration } from '../media/mediaActions'

/** The looping live background behind the slides. */
function BackgroundRow(): ReactElement | null {
  const bg = useLiveStore((s) => s.bgMedia)
  const asset = useProjectStore((s) => (bg ? s.project?.media[bg.mediaId] : undefined))
  if (!bg || !asset) return null
  return (
    <div className="transport transport-bg">
      <div className="transport-title">
        <Clapperboard size={13} />
        <span className="transport-name">Background: {asset.name}</span>
        {asset.kind === 'video' && (
          <button className={`icon-btn${bg.muted ? ' active' : ''}`} title={bg.muted ? 'Unmute background' : 'Mute background'} onClick={backgroundToggleMute}>
            {bg.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </button>
        )}
        <button className="icon-btn" title="Remove background" onClick={stopBackground}>
          <Square size={13} />
        </button>
      </div>
    </div>
  )
}

/** Transport for the live background and the media cue. */
export function MediaTransport(): ReactElement | null {
  return (
    <>
      <BackgroundRow />
      <CueTransport />
    </>
  )
}

/** Transport for the full-screen media cue: play/pause, stop, seek, loop, volume, mute, progress. */
function CueTransport(): ReactElement | null {
  const media = useLiveStore((s) => s.media)
  const asset = useProjectStore((s) => (media ? s.project?.media[media.mediaId] : undefined))
  const [now, setNow] = useState(() => Date.now())
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!media?.playing) return
    const t = window.setInterval(() => setNow(Date.now()), 200)
    return () => window.clearInterval(t)
  }, [media?.playing])

  if (!media || !asset) return null
  const duration = asset.durationSec
  const pos = mediaPosition(media, media.playing ? now : media.anchorAt, duration)
  const pct = duration ? Math.min(100, (pos / duration) * 100) : 0

  const seekFromEvent = (clientX: number): void => {
    const r = barRef.current?.getBoundingClientRect()
    if (!r || !duration) return
    mediaSeek(Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * duration)
  }

  return (
    <div className="transport">
      <div className="transport-title">
        {asset.kind === 'audio' ? <Music size={13} /> : <Film size={13} />}
        <span className="transport-name">{asset.name}</span>
        <span className="transport-time">
          {formatDuration(pos)} / {duration ? formatDuration(duration) : '--:--'}
        </span>
      </div>
      {asset.kind !== 'image' && (
        <div
          ref={barRef}
          className="transport-bar"
          role="slider"
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={duration ?? 0}
          aria-valuenow={pos}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            seekFromEvent(e.clientX)
          }}
          onPointerMove={(e) => {
            if (e.buttons === 1) seekFromEvent(e.clientX)
          }}
        >
          <div className="transport-fill" style={{ width: `${pct}%` }} />
        </div>
      )}
      <div className="transport-controls">
        {asset.kind !== 'image' && (
          <button className="icon-btn" title={media.playing ? 'Pause' : 'Play'} onClick={mediaToggle}>
            {media.playing ? <Pause size={15} /> : <Play size={15} />}
          </button>
        )}
        <button className="icon-btn" title="Stop and clear media" onClick={mediaStop}>
          <Square size={14} />
        </button>
        {asset.kind !== 'image' && (
          <>
            <button className={`icon-btn${media.loop ? ' active' : ''}`} title="Loop" onClick={() => mediaSetLoop(!media.loop)}>
              <Repeat size={14} />
            </button>
            <button className={`icon-btn${media.muted ? ' active' : ''}`} title={media.muted ? 'Unmute' : 'Mute'} onClick={mediaToggleMute}>
              {media.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
            <input className="transport-volume" type="range" min={0} max={1} step={0.01} value={media.volume} onChange={(e) => mediaSetVolume(Number(e.target.value))} title="Cue volume" />
          </>
        )}
      </div>
    </div>
  )
}
