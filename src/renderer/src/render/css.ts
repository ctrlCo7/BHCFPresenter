import type { CSSProperties } from 'react'
import type { Gradient, MediaFit, Shadow, ShapeFill, TextStyle } from '@shared/model/types'

export function gradientCss(g: Gradient): string {
  const stops = [...g.stops]
    .sort((a, b) => a.position - b.position)
    .map((s) => `${s.color} ${(s.position * 100).toFixed(1)}%`)
    .join(', ')
  return g.kind === 'radial' ? `radial-gradient(circle at center, ${stops})` : `linear-gradient(${g.angle}deg, ${stops})`
}

export function fillCss(fill: ShapeFill): CSSProperties {
  return fill.type === 'solid' ? { backgroundColor: fill.color } : { backgroundImage: gradientCss(fill.gradient) }
}

export function objectFit(fit: MediaFit): CSSProperties['objectFit'] {
  return fit
}

export function textShadowCss(shadow: Shadow | null): string | undefined {
  if (!shadow?.enabled) return undefined
  return `${shadow.offsetX}px ${shadow.offsetY}px ${shadow.blur}px ${shadow.color}`
}

export function boxShadowFilter(shadow: Shadow | null): string | undefined {
  if (!shadow?.enabled) return undefined
  return `drop-shadow(${shadow.offsetX}px ${shadow.offsetY}px ${shadow.blur / 2}px ${shadow.color})`
}

export function textCss(style: TextStyle, fontSize: number): CSSProperties {
  return {
    fontFamily: style.fontFamily,
    fontSize,
    fontWeight: style.fontWeight,
    fontStyle: style.italic ? 'italic' : 'normal',
    textDecoration: style.underline ? 'underline' : 'none',
    color: style.color,
    textAlign: style.align,
    lineHeight: style.lineHeight,
    letterSpacing: style.letterSpacing,
    textTransform: style.textTransform,
    WebkitTextStroke: style.strokeWidth > 0 ? `${style.strokeWidth}px ${style.strokeColor}` : undefined,
    paintOrder: style.strokeWidth > 0 ? 'stroke fill' : undefined
  }
}

export const VERTICAL_JUSTIFY: Record<TextStyle['verticalAlign'], CSSProperties['justifyContent']> = {
  top: 'flex-start',
  middle: 'center',
  bottom: 'flex-end'
}
