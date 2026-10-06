/** Background + transition pickers shared by the inspector and project settings. */
import type { ReactElement } from 'react'
import type { Background, Id, MediaAsset, MediaFit, TransitionDirection, TransitionSpec, TransitionType } from '@shared/model/types'
import { ColorField, NumberField, Row, Select, Toggle } from '../../components/ui/fields'

type BgKind = 'inherit' | Background['type']

const FITS: { value: MediaFit; label: string }[] = [
  { value: 'cover', label: 'Fill (crop)' },
  { value: 'contain', label: 'Fit' },
  { value: 'fill', label: 'Stretch' }
]

export function BackgroundEditor({
  value,
  onChange,
  media,
  allowInherit,
  inheritLabel = 'Inherit'
}: {
  value: Background | null
  onChange: (bg: Background | null, coalesce?: string) => void
  media: Record<Id, MediaAsset>
  allowInherit: boolean
  inheritLabel?: string
}): ReactElement {
  const kind: BgKind = value ? value.type : 'inherit'
  const images = Object.values(media).filter((m) => m.kind === 'image')
  const videos = Object.values(media).filter((m) => m.kind === 'video')
  const options: { value: BgKind; label: string }[] = [
    ...(allowInherit ? [{ value: 'inherit' as const, label: inheritLabel }] : []),
    { value: 'none', label: 'None (transparent)' },
    { value: 'color', label: 'Solid colour' },
    { value: 'gradient', label: 'Gradient' },
    { value: 'image', label: 'Image' },
    { value: 'video', label: 'Video (animated)' }
  ]

  const setKind = (k: BgKind): void => {
    switch (k) {
      case 'inherit':
        return onChange(null)
      case 'none':
        return onChange({ type: 'none' })
      case 'color':
        return onChange({ type: 'color', color: '#000000' })
      case 'gradient':
        return onChange({
          type: 'gradient',
          gradient: { kind: 'linear', angle: 160, stops: [{ color: '#14532d', position: 0 }, { color: '#000000', position: 1 }] }
        })
      case 'image':
        return images[0] ? onChange({ type: 'image', mediaId: images[0].id, fit: 'cover' }) : undefined
      case 'video':
        return videos[0] ? onChange({ type: 'video', mediaId: videos[0].id, fit: 'cover', loop: true, muted: true }) : undefined
    }
  }

  return (
    <>
      <Row label="Type">
        <Select value={kind} options={options} onChange={setKind} />
      </Row>
      {(kind === 'image' && images.length === 0) || (kind === 'video' && videos.length === 0) ? <div className="muted">Import media first.</div> : null}
      {value?.type === 'color' && (
        <Row label="Colour">
          <ColorField value={value.color} onChange={(color) => onChange({ type: 'color', color }, 'bg-color')} />
        </Row>
      )}
      {value?.type === 'gradient' && (
        <>
          <Row label="Style">
            <Select
              value={value.gradient.kind}
              options={[
                { value: 'linear', label: 'Linear' },
                { value: 'radial', label: 'Radial' }
              ]}
              onChange={(k) => onChange({ type: 'gradient', gradient: { ...value.gradient, kind: k } })}
            />
          </Row>
          {value.gradient.kind === 'linear' && (
            <Row label="Angle">
              <NumberField value={value.gradient.angle} min={0} max={360} suffix="°" onChange={(angle) => onChange({ type: 'gradient', gradient: { ...value.gradient, angle } })} />
            </Row>
          )}
          {value.gradient.stops.map((stop, i) => (
            <Row key={i} label={i === 0 ? 'From' : i === value.gradient.stops.length - 1 ? 'To' : `Stop ${i + 1}`}>
              <ColorField
                value={stop.color}
                onChange={(color) =>
                  onChange({ type: 'gradient', gradient: { ...value.gradient, stops: value.gradient.stops.map((s, j) => (j === i ? { ...s, color } : s)) } }, `bg-stop-${i}`)
                }
              />
            </Row>
          ))}
        </>
      )}
      {(value?.type === 'image' || value?.type === 'video') && (
        <>
          <Row label={value.type === 'image' ? 'Image' : 'Video'}>
            <Select
              value={value.mediaId}
              options={(value.type === 'image' ? images : videos).map((m) => ({ value: m.id, label: m.name }))}
              onChange={(mediaId) => onChange({ ...value, mediaId })}
            />
          </Row>
          <Row label="Fit">
            <Select value={value.fit} options={FITS} onChange={(fit) => onChange({ ...value, fit })} />
          </Row>
          {value.type === 'video' && (
            <Row label="Loop">
              <Toggle checked={value.loop} onChange={(loop) => onChange({ ...value, loop })} />
            </Row>
          )}
        </>
      )}
    </>
  )
}

export const TRANSITIONS: { value: TransitionType; label: string }[] = [
  { value: 'cut', label: 'Cut' },
  { value: 'fade', label: 'Fade' },
  { value: 'dissolve', label: 'Dissolve' },
  { value: 'slide', label: 'Slide' },
  { value: 'push', label: 'Push' },
  { value: 'zoom', label: 'Zoom' },
  { value: 'wipe', label: 'Wipe' }
]

const DIRECTIONS: { value: TransitionDirection; label: string }[] = [
  { value: 'left', label: 'From right ←' },
  { value: 'right', label: 'From left →' },
  { value: 'up', label: 'From bottom ↑' },
  { value: 'down', label: 'From top ↓' }
]

export function TransitionEditor({
  value,
  onChange,
  allowInherit,
  inheritLabel = 'Inherit'
}: {
  value: TransitionSpec | null
  onChange: (t: TransitionSpec | null) => void
  allowInherit: boolean
  inheritLabel?: string
}): ReactElement {
  const type = value?.type ?? 'inherit'
  return (
    <>
      <Row label="Transition">
        <Select
          value={type}
          options={[...(allowInherit ? [{ value: 'inherit', label: inheritLabel }] : []), ...TRANSITIONS]}
          onChange={(t) => onChange(t === 'inherit' ? null : { type: t as TransitionType, durationMs: value?.durationMs ?? 400, direction: value?.direction ?? 'left' })}
        />
      </Row>
      {value && value.type !== 'cut' && (
        <Row label="Duration">
          <NumberField value={value.durationMs} min={0} max={10000} step={50} suffix="ms" onChange={(durationMs) => onChange({ ...value, durationMs })} />
        </Row>
      )}
      {value && (value.type === 'slide' || value.type === 'push' || value.type === 'wipe') && (
        <Row label="Direction">
          <Select value={value.direction} options={DIRECTIONS} onChange={(direction) => onChange({ ...value, direction })} />
        </Row>
      )}
    </>
  )
}
