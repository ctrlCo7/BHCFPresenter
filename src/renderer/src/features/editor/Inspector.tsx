import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  Bold,
  Italic,
  Underline
} from 'lucide-react'
import type { ReactElement } from 'react'
import type { Background, Id, MediaAsset, Project, Shadow, Slide, SlideElement, TextStyle } from '@shared/model/types'
import { FontPicker } from '../../components/ui/FontPicker'
import { ColorField, NumberField, Row, Section, Segmented, Select, Slider, TextInput, Toggle } from '../../components/ui/fields'
import { applyChange } from '../../store/projectStore'
import type { EditTarget } from '../../store/uiStore'
import { BackgroundEditor, TransitionEditor } from './BackgroundEditor'
import { applyCurrentSlideToAll, applyTextStyleToAll, editElements, editSlide } from './editorActions'
import { useUiStore } from '../../store/uiStore'
import { useProjectStore } from '../../store/projectStore'
import { profileMediaRecord } from '../../engine/tree'

const WEIGHTS = [
  { value: '300', label: 'Light' },
  { value: '400', label: 'Regular' },
  { value: '500', label: 'Medium' },
  { value: '600', label: 'Semibold' },
  { value: '700', label: 'Bold' },
  { value: '800', label: 'Extra bold' },
  { value: '900', label: 'Black' }
]

/** Shown under text styling when editing a presentation slide with siblings. */
function ApplyStyleButtons(): ReactElement | null {
  const target = useUiStore((s) => s.editTarget)
  const count = useProjectStore((s) => (target?.kind === 'slide' ? (s.project?.presentations[target.presentationId]?.slides.length ?? 0) : 0))
  if (target?.kind !== 'slide' || count < 2) return null
  return (
    <div className="apply-row">
      <button className="btn" onClick={applyTextStyleToAll} title="Same font, size, colour, position and effects on every slide — words stay the same">
        Apply text style to all {count} slides
      </button>
      <button className="btn ghost" onClick={() => void applyCurrentSlideToAll()}>
        More options…
      </button>
    </div>
  )
}

function TextSection({ el }: { el: Extract<SlideElement, { type: 'text' }> }): ReactElement {
  const s = el.style
  const setStyle = (patch: Partial<TextStyle>, coalesce?: string): void =>
    editElements(
      'Text style',
      (x) => {
        if (x.type === 'text') x.style = { ...x.style, ...patch }
      },
      coalesce
    )
  return (
    <Section title="Text">
      <textarea
        className="input"
        rows={4}
        value={el.text}
        onChange={(e) => {
          const text = e.target.value
          editElements('Edit text', (x) => x.type === 'text' && (x.text = text), 'text-typing')
        }}
        onKeyDown={(e) => e.stopPropagation()}
      />
      <Row label="Font">
        <FontPicker value={s.fontFamily} onChange={(fontFamily) => setStyle({ fontFamily })} />
      </Row>
      <Row label="Size / weight">
        <NumberField value={s.fontSize} min={6} max={600} suffix="px" onChange={(fontSize) => setStyle({ fontSize }, 'font-size')} />
        <Select value={String(s.fontWeight)} options={WEIGHTS} onChange={(w) => setStyle({ fontWeight: Number(w) })} width={100} />
      </Row>
      <Row label="Style">
        <Segmented
          value={'' as string}
          options={[
            { value: 'b', label: <Bold size={13} strokeWidth={s.fontWeight >= 700 ? 3 : 2} />, title: 'Bold' },
            { value: 'i', label: <Italic size={13} strokeWidth={s.italic ? 3 : 2} />, title: 'Italic' },
            { value: 'u', label: <Underline size={13} strokeWidth={s.underline ? 3 : 2} />, title: 'Underline' }
          ]}
          onChange={(v) => setStyle(v === 'b' ? { fontWeight: s.fontWeight >= 700 ? 400 : 700 } : v === 'i' ? { italic: !s.italic } : { underline: !s.underline })}
        />
        <Select
          value={s.textTransform}
          options={[
            { value: 'none', label: 'Aa' },
            { value: 'uppercase', label: 'AA' },
            { value: 'lowercase', label: 'aa' },
            { value: 'capitalize', label: 'Aa Bb' }
          ]}
          onChange={(textTransform) => setStyle({ textTransform })}
          width={80}
        />
      </Row>
      <Row label="Colour">
        <ColorField value={s.color} onChange={(color) => setStyle({ color }, 'text-color')} />
      </Row>
      <Row label="Align">
        <Segmented
          value={s.align}
          options={[
            { value: 'left', label: <AlignLeft size={13} />, title: 'Left' },
            { value: 'center', label: <AlignCenter size={13} />, title: 'Centre' },
            { value: 'right', label: <AlignRight size={13} />, title: 'Right' },
            { value: 'justify', label: <AlignJustify size={13} />, title: 'Justify' }
          ]}
          onChange={(align) => setStyle({ align })}
        />
        <Segmented
          value={s.verticalAlign}
          options={[
            { value: 'top', label: <AlignVerticalJustifyStart size={13} />, title: 'Top' },
            { value: 'middle', label: <AlignVerticalJustifyCenter size={13} />, title: 'Middle' },
            { value: 'bottom', label: <AlignVerticalJustifyEnd size={13} />, title: 'Bottom' }
          ]}
          onChange={(verticalAlign) => setStyle({ verticalAlign })}
        />
      </Row>
      <Row label="Line / letter">
        <NumberField value={s.lineHeight} min={0.5} max={5} step={0.05} onChange={(lineHeight) => setStyle({ lineHeight }, 'line-height')} title="Line height" />
        <NumberField value={s.letterSpacing} min={-20} max={100} suffix="px" onChange={(letterSpacing) => setStyle({ letterSpacing }, 'letter-spacing')} title="Letter spacing" />
      </Row>
      <Row label="Outline">
        <NumberField value={s.strokeWidth} min={0} max={40} suffix="px" onChange={(strokeWidth) => setStyle({ strokeWidth }, 'stroke')} width={70} />
        {s.strokeWidth > 0 && <ColorField value={s.strokeColor} alpha={false} onChange={(strokeColor) => setStyle({ strokeColor }, 'stroke-color')} />}
      </Row>
      <Row label="Box fill">
        <Toggle checked={el.fill !== null} onChange={(on) => editElements('Box fill', (x) => x.type === 'text' && (x.fill = on ? 'rgba(0,0,0,0.5)' : null))} />
        {el.fill !== null && <ColorField value={el.fill} onChange={(fill) => editElements('Box fill', (x) => x.type === 'text' && (x.fill = fill), 'box-fill')} />}
      </Row>
      <Row label="Padding">
        <NumberField value={el.padding} min={0} max={400} suffix="px" onChange={(padding) => editElements('Padding', (x) => x.type === 'text' && (x.padding = padding), 'padding')} />
      </Row>
      <Row label="Auto-fit">
        <Toggle checked={el.autoFit} label="Shrink text to fit box" onChange={(autoFit) => editElements('Auto-fit', (x) => x.type === 'text' && (x.autoFit = autoFit))} />
      </Row>
      <ApplyStyleButtons />
      <div className="muted inspector-tip">Tokens: {'{clock}'} shows the time, {'{timer:Name}'} shows a timer.</div>
    </Section>
  )
}

function ShapeSection({ el }: { el: Extract<SlideElement, { type: 'shape' }> }): ReactElement {
  const edit = (label: string, fn: (x: Extract<SlideElement, { type: 'shape' }>) => void, coalesce?: string): void =>
    editElements(label, (x) => x.type === 'shape' && fn(x), coalesce)
  const fill = el.fill
  return (
    <Section title="Shape">
      <Row label="Shape">
        <Select
          value={el.shape}
          options={[
            { value: 'rectangle', label: 'Rectangle' },
            { value: 'ellipse', label: 'Ellipse' }
          ]}
          onChange={(shape) => edit('Shape', (x) => (x.shape = shape))}
        />
      </Row>
      <Row label="Fill">
        <Select
          value={fill.type}
          options={[
            { value: 'solid', label: 'Solid' },
            { value: 'gradient', label: 'Gradient' }
          ]}
          onChange={(t) =>
            edit('Fill', (x) => {
              x.fill =
                t === 'solid'
                  ? { type: 'solid', color: fill.type === 'gradient' ? (fill.gradient.stops[0]?.color ?? '#16a34a') : fill.color }
                  : { type: 'gradient', gradient: { kind: 'linear', angle: 90, stops: [{ color: fill.type === 'solid' ? fill.color : '#16a34a', position: 0 }, { color: '#000000', position: 1 }] } }
            })
          }
        />
      </Row>
      {fill.type === 'solid' ? (
        <Row label="Colour">
          <ColorField value={fill.color} onChange={(color) => edit('Fill colour', (x) => (x.fill = { type: 'solid', color }), 'shape-fill')} />
        </Row>
      ) : (
        <>
          <Row label="Angle">
            <NumberField value={fill.gradient.angle} min={0} max={360} suffix="°" onChange={(angle) => edit('Gradient', (x) => x.fill.type === 'gradient' && (x.fill.gradient.angle = angle))} />
          </Row>
          {fill.gradient.stops.map((stop, i) => (
            <Row key={i} label={i === 0 ? 'From' : 'To'}>
              <ColorField value={stop.color} onChange={(color) => edit('Gradient', (x) => x.fill.type === 'gradient' && x.fill.gradient.stops[i] && (x.fill.gradient.stops[i].color = color), `stop-${i}`)} />
            </Row>
          ))}
        </>
      )}
      <Row label="Border">
        <NumberField value={el.strokeWidth} min={0} max={100} suffix="px" onChange={(w) => edit('Border', (x) => (x.strokeWidth = w), 'border')} width={70} />
        {el.strokeWidth > 0 && <ColorField value={el.strokeColor} onChange={(c) => edit('Border colour', (x) => (x.strokeColor = c), 'border-color')} />}
      </Row>
      {el.shape === 'rectangle' && (
        <Row label="Corners">
          <NumberField value={el.cornerRadius} min={0} max={2000} suffix="px" onChange={(r) => edit('Corners', (x) => (x.cornerRadius = r), 'radius')} />
        </Row>
      )}
    </Section>
  )
}

function MediaSection({ el, media }: { el: Extract<SlideElement, { type: 'image' | 'video' }>; media: Record<Id, MediaAsset> }): ReactElement {
  const assets = Object.values(media).filter((m) => m.kind === el.type)
  return (
    <Section title={el.type === 'image' ? 'Image' : 'Video'}>
      <Row label="Source">
        <Select
          value={el.mediaId}
          options={[...(media[el.mediaId] ? [] : [{ value: el.mediaId, label: 'Missing media' }]), ...assets.map((m) => ({ value: m.id, label: m.name }))]}
          onChange={(mediaId) => editElements('Change media', (x) => (x.type === 'image' || x.type === 'video') && (x.mediaId = mediaId))}
        />
      </Row>
      <Row label="Fit">
        <Select
          value={el.fit}
          options={[
            { value: 'contain', label: 'Fit' },
            { value: 'cover', label: 'Fill (crop)' },
            { value: 'fill', label: 'Stretch' }
          ]}
          onChange={(fit) => editElements('Fit', (x) => (x.type === 'image' || x.type === 'video') && (x.fit = fit))}
        />
      </Row>
      {el.type === 'video' && (
        <>
          <Row label="Loop">
            <Toggle checked={el.loop} onChange={(loop) => editElements('Loop', (x) => x.type === 'video' && (x.loop = loop))} />
          </Row>
          <Row label="Sound">
            <Toggle checked={!el.muted} label="Play audio when live" onChange={(on) => editElements('Sound', (x) => x.type === 'video' && (x.muted = !on))} />
          </Row>
        </>
      )}
    </Section>
  )
}

function ShadowRows({ shadow }: { shadow: Shadow | null }): ReactElement {
  const s = shadow ?? { enabled: false, color: 'rgba(0,0,0,0.6)', blur: 12, offsetX: 0, offsetY: 4 }
  const set = (patch: Partial<Shadow>, coalesce?: string): void => editElements('Shadow', (x) => (x.shadow = { ...s, ...x.shadow, ...patch }), coalesce)
  return (
    <>
      <Row label="Shadow">
        <Toggle checked={s.enabled} onChange={(enabled) => set({ enabled })} />
        {s.enabled && <ColorField value={s.color} onChange={(color) => set({ color }, 'shadow-color')} />}
      </Row>
      {s.enabled && (
        <Row label="Blur / offset">
          <NumberField value={s.blur} min={0} max={200} onChange={(blur) => set({ blur }, 'shadow-blur')} title="Blur" />
          <NumberField value={s.offsetX} min={-200} max={200} onChange={(offsetX) => set({ offsetX }, 'shadow-x')} title="Offset X" />
          <NumberField value={s.offsetY} min={-200} max={200} onChange={(offsetY) => set({ offsetY }, 'shadow-y')} title="Offset Y" />
        </Row>
      )}
    </>
  )
}

export function ElementInspector({ elements, media }: { elements: SlideElement[]; media: Record<Id, MediaAsset> }): ReactElement {
  const el = elements[0] as SlideElement
  const many = elements.length > 1
  const frame = (key: 'x' | 'y' | 'width' | 'height', v: number): void =>
    editElements(
      'Position',
      (x) => {
        x.frame[key] = key === 'width' || key === 'height' ? Math.max(1, v) : v
      },
      `frame-${key}`
    )
  const allText = elements.every((e) => e.type === 'text')
  return (
    <>
      <Section title={many ? `${elements.length} elements` : el.type === 'text' ? 'Text box' : el.type === 'shape' ? 'Shape' : el.type === 'image' ? 'Image' : 'Video'}>
        {!many && (
          <Row label="Name">
            <TextInput value={el.name} onChange={(name) => name.trim() && editElements('Rename element', (x) => (x.name = name.trim()))} />
          </Row>
        )}
        {!many && (
          <>
            <Row label="Position">
              <NumberField value={el.frame.x} suffix="X" onChange={(v) => frame('x', v)} />
              <NumberField value={el.frame.y} suffix="Y" onChange={(v) => frame('y', v)} />
            </Row>
            <Row label="Size">
              <NumberField value={el.frame.width} min={1} suffix="W" onChange={(v) => frame('width', v)} />
              <NumberField value={el.frame.height} min={1} suffix="H" onChange={(v) => frame('height', v)} />
            </Row>
            <Row label="Rotation">
              <NumberField value={el.rotation} min={-180} max={180} suffix="°" onChange={(rotation) => editElements('Rotate', (x) => (x.rotation = rotation), 'rotation')} />
            </Row>
          </>
        )}
        <Row label="Opacity">
          <Slider value={el.opacity} min={0} max={1} format={(v) => `${Math.round(v * 100)}%`} onChange={(opacity) => editElements('Opacity', (x) => (x.opacity = opacity), 'opacity')} />
        </Row>
        <ShadowRows shadow={el.shadow} />
        <Row label="Lock / hide">
          <Toggle checked={el.locked} label="Locked" onChange={(locked) => editElements('Lock', (x) => (x.locked = locked))} />
          <Toggle checked={el.hidden} label="Hidden" onChange={(hidden) => editElements('Hide', (x) => (x.hidden = hidden))} />
        </Row>
      </Section>
      {allText && el.type === 'text' && <TextSection el={el} />}
      {!many && el.type === 'shape' && <ShapeSection el={el} />}
      {!many && (el.type === 'image' || el.type === 'video') && <MediaSection el={el} media={media} />}
    </>
  )
}

/** Slide-level settings: background (slide / presentation / project), transition, label. */
export function SlideInspector({ project, target, slide }: { project: Project; target: EditTarget; slide: Slide }): ReactElement {
  if (target.kind === 'overlay') {
    const overlay = project.overlays[target.overlayId]
    return (
      <Section title="Overlay">
        <Row label="Name">
          <TextInput value={overlay?.name ?? ''} onChange={(name) => {
              if (!name.trim()) return
              applyChange('Rename overlay', (d) => {
                const o = d.overlays[target.overlayId]
                if (o) o.name = name.trim()
              })
            }}
          />
        </Row>
        <div className="muted inspector-tip">Overlays are always transparent and appear above slides. Turn them on and off in the Overlays panel during live.</div>
      </Section>
    )
  }
  const pres = project.presentations[target.presentationId]
  const setPresBackground = (bg: Background | null, coalesce?: string): void => {
    applyChange(
      'Presentation background',
      (d) => {
        const p = d.presentations[target.presentationId]
        if (p) p.background = bg
      },
      { coalesce }
    )
  }
  return (
    <>
      <Section title="Slide">
        <Row label="Label">
          <TextInput value={slide.label} placeholder="e.g. Verse 1" onChange={(label) => editSlide('Label slide', (s) => (s.label = label.trim()))} />
        </Row>
        <Row label="Enabled">
          <Toggle checked={slide.enabled} label="Include in live navigation" onChange={(enabled) => editSlide('Enable slide', (s) => (s.enabled = enabled))} />
        </Row>
      </Section>
      <Section title="Slide background">
        <BackgroundEditor
          value={slide.background}
          media={profileMediaRecord(project)}
          allowInherit
          inheritLabel="Use presentation background"
          onChange={(bg, coalesce) => editSlide('Slide background', (s) => (s.background = bg), coalesce)}
        />
        <div className="apply-row">
          <button
            className="btn"
            onClick={() =>
              applyChange('Apply background to all slides', (d) => {
                const p = d.presentations[target.presentationId]
                if (p) for (const s of p.slides) s.background = slide.background
              })
            }
          >
            Apply background to all slides
          </button>
          <button className="btn ghost" onClick={() => void applyCurrentSlideToAll()}>
            Apply whole design…
          </button>
        </div>
      </Section>
      {pres && (
        <Section title="Presentation background">
          <BackgroundEditor value={pres.background} media={profileMediaRecord(project)} allowInherit inheritLabel="Use project default" onChange={setPresBackground} />
        </Section>
      )}
      <Section title="Slide transition">
        <TransitionEditor value={slide.transition} allowInherit inheritLabel="Use presentation / project" onChange={(t) => editSlide('Slide transition', (s) => (s.transition = t))} />
      </Section>
    </>
  )
}
