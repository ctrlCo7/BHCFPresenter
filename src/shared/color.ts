/** Small colour helpers for the inspector (hex + alpha ⇄ CSS colour strings). */

export interface Rgba {
  r: number
  g: number
  b: number
  a: number
}

export function parseColor(input: string): Rgba | null {
  const s = input.trim().toLowerCase()
  let m = /^#([0-9a-f]{3,8})$/.exec(s)
  if (m) {
    let h = m[1] as string
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('')
    if (h.length !== 6 && h.length !== 8) return null
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1
    }
  }
  m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(s)
  if (m) return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: m[4] === undefined ? 1 : Number(m[4]) }
  if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 }
  if (s === 'white') return { r: 255, g: 255, b: 255, a: 1 }
  if (s === 'black') return { r: 0, g: 0, b: 0, a: 1 }
  return null
}

const hex2 = (n: number): string => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0')

export function toHex(c: Rgba): string {
  return `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`
}

export function toCss(c: Rgba): string {
  return c.a >= 1 ? toHex(c) : `rgba(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)},${Number(c.a.toFixed(3))})`
}

/** Replaces the RGB part of `color` keeping its alpha. */
export function withHex(color: string, hex: string): string {
  const base = parseColor(color) ?? { r: 0, g: 0, b: 0, a: 1 }
  const next = parseColor(hex)
  return next ? toCss({ ...next, a: base.a }) : color
}

export function withAlpha(color: string, alpha: number): string {
  const base = parseColor(color) ?? { r: 0, g: 0, b: 0, a: 1 }
  return toCss({ ...base, a: Math.max(0, Math.min(1, alpha)) })
}
