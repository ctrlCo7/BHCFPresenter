/** Compact inspector form controls with commit-on-blur semantics. */
import { useEffect, useState, type ReactElement, type ReactNode } from 'react'
import { parseColor, toHex, withAlpha, withHex } from '@shared/color'
import './fields.css'

export function Section({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }): ReactElement {
  return (
    <section className="f-section">
      <header className="f-section-title">
        <span>{title}</span>
        {actions}
      </header>
      <div className="f-section-body">{children}</div>
    </section>
  )
}

export function Row({ label, children }: { label?: string; children: ReactNode }): ReactElement {
  return (
    <div className="f-row">
      {label !== undefined && <label className="f-label">{label}</label>}
      <div className="f-control">{children}</div>
    </div>
  )
}

export function NumberField({
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  title,
  width
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  suffix?: string
  title?: string
  width?: number
}): ReactElement {
  const [text, setText] = useState(String(round(value)))
  useEffect(() => setText(String(round(value))), [value])
  const clamp = (v: number): number => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v))
  const commit = (raw: string): void => {
    const v = Number(raw)
    if (Number.isFinite(v)) {
      const c = clamp(v)
      if (c !== value) onChange(c)
      setText(String(round(c)))
    } else setText(String(round(value)))
  }
  return (
    <span className="f-number" style={{ width }} title={title}>
      <input
        className="input"
        value={text}
        inputMode="decimal"
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit(e.currentTarget.value)
          else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault()
            const delta = (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1)
            const v = clamp(round(value + delta))
            onChange(v)
          }
          e.stopPropagation()
        }}
      />
      {suffix && <span className="f-suffix">{suffix}</span>}
    </span>
  )
}

const round = (v: number): number => Math.round(v * 100) / 100

export function Slider({ value, onChange, min, max, step = 0.01, format }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number; format?: (v: number) => string }): ReactElement {
  return (
    <span className="f-slider">
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="f-slider-value">{format ? format(value) : value}</span>
    </span>
  )
}

/** Colour swatch + hex + optional alpha. Works with hex and rgba() strings. */
export function ColorField({ value, onChange, alpha = true }: { value: string; onChange: (v: string) => void; alpha?: boolean }): ReactElement {
  const parsed = parseColor(value) ?? { r: 0, g: 0, b: 0, a: 1 }
  const hex = toHex(parsed)
  const [text, setText] = useState(hex)
  useEffect(() => setText(hex), [hex])
  return (
    <span className="f-color">
      <input type="color" value={hex} onChange={(e) => onChange(withHex(value, e.target.value))} />
      <input
        className="input f-hex"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => (parseColor(text) ? onChange(withHex(value, text)) : setText(hex))}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur()
        }}
      />
      {alpha && (
        <input
          type="range"
          className="f-alpha"
          min={0}
          max={1}
          step={0.01}
          value={parsed.a}
          title={`Opacity ${Math.round(parsed.a * 100)}%`}
          onChange={(e) => onChange(withAlpha(value, Number(e.target.value)))}
        />
      )}
    </span>
  )
}

export function Select<T extends string>({ value, options, onChange, width }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; width?: number | string }): ReactElement {
  return (
    <select className="input f-select" style={{ width }} value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }): ReactElement {
  return (
    <label className="f-toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="f-switch" aria-hidden />
      {label && <span>{label}</span>}
    </label>
  )
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void }): ReactElement {
  return (
    <span className="f-seg" role="radiogroup">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} title={o.title} className={value === o.value ? 'active' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </span>
  )
}

export function TextInput({ value, onChange, placeholder, list }: { value: string; onChange: (v: string) => void; placeholder?: string; list?: string }): ReactElement {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  return (
    <input
      className="input"
      value={text}
      placeholder={placeholder}
      list={list}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text !== value && onChange(text)}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur()
      }}
    />
  )
}
