import { useState, type ReactElement } from 'react'
import type { Presentation, Slide } from '@shared/model/types'
import { Toggle } from '../../components/ui/fields'
import type { ApplyDesignOptions } from '../../engine/elementOps'

export interface ApplyToAllResult {
  options: ApplyDesignOptions
  targetIds: string[]
}

type Scope = 'all' | 'section' | 'after'

/** Lets the operator choose what to copy from the current slide and to which slides. */
export function ApplyToAllDialog({ pres, source, onClose }: { pres: Presentation; source: Slide; onClose: (r: ApplyToAllResult | null) => void }): ReactElement {
  const hasDecorations = source.elements.some((e) => e.type !== 'text')
  const [opts, setOpts] = useState<ApplyDesignOptions>({ textStyle: true, background: true, decorations: hasDecorations, transition: source.transition !== null })
  const section = source.groupId ? pres.groups.find((g) => g.id === source.groupId) : undefined
  const [scope, setScope] = useState<Scope>('all')

  const index = pres.slides.findIndex((s) => s.id === source.id)
  const targets = pres.slides.filter((s, i) => {
    if (s.id === source.id) return false
    if (scope === 'section') return s.groupId === source.groupId
    if (scope === 'after') return i > index
    return true
  })
  const anything = opts.textStyle || opts.background || opts.decorations || opts.transition
  const set = (k: keyof ApplyDesignOptions) => (v: boolean) => setOpts((o) => ({ ...o, [k]: v }))

  return (
    <div className="modal-body apply-all">
      <p className="modal-message">
        Copy the look of <b>slide {index + 1}</b> to other slides in <b>{pres.name}</b>. Every slide keeps its own words.
      </p>
      <div className="apply-all-options">
        <Toggle checked={opts.textStyle} onChange={set('textStyle')} label="Text style & position — font, size, colour, alignment, outline, shadow, box" />
        <Toggle checked={opts.background} onChange={set('background')} label={`Background — ${describeBackground(source)}`} />
        <Toggle
          checked={opts.decorations}
          onChange={set('decorations')}
          label={hasDecorations ? 'Shapes, images & videos — logos, bars, frames (replaces those on the other slides)' : 'Shapes, images & videos — removes them from the other slides (this slide has none)'}
        />
        <Toggle checked={opts.transition} onChange={set('transition')} label="Transition" />
      </div>
      <div className="apply-all-scope">
        <span className="field-label">Apply to</span>
        <label>
          <input type="radio" checked={scope === 'all'} onChange={() => setScope('all')} /> All slides ({pres.slides.length - 1})
        </label>
        {section && (
          <label>
            <input type="radio" checked={scope === 'section'} onChange={() => setScope('section')} /> Only “{section.name}” slides ({pres.slides.filter((s) => s.groupId === source.groupId).length - 1})
          </label>
        )}
        <label>
          <input type="radio" checked={scope === 'after'} onChange={() => setScope('after')} /> Slides after this one ({pres.slides.length - 1 - index})
        </label>
      </div>
      <div className="modal-footer">
        <span className="muted modal-hint">Undo with Ctrl+Z</span>
        <button className="btn" onClick={() => onClose(null)}>
          Cancel
        </button>
        <button className="btn primary" disabled={!anything || targets.length === 0} onClick={() => onClose({ options: opts, targetIds: targets.map((t) => t.id) })}>
          Apply to {targets.length} slide{targets.length === 1 ? '' : 's'}
        </button>
      </div>
    </div>
  )
}

function describeBackground(s: Slide): string {
  const bg = s.background
  if (!bg) return 'use the presentation background'
  switch (bg.type) {
    case 'none':
      return 'transparent'
    case 'color':
      return `colour ${bg.color}`
    case 'gradient':
      return 'gradient'
    case 'image':
      return 'image'
    case 'video':
      return 'video'
  }
}
