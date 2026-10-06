/**
 * Auto-fit: finds the largest font size (≤ the element's size) at which the text fits its
 * frame. Uses one shared off-screen measuring node and caches results, so hundreds of
 * thumbnails showing the same slide only measure once.
 */
import type { TextElement } from '@shared/model/types'
import { textCss } from './css'

const cache = new Map<string, number>()
const CACHE_LIMIT = 2000
let measurer: HTMLDivElement | null = null

function getMeasurer(): HTMLDivElement {
  if (measurer) return measurer
  measurer = document.createElement('div')
  Object.assign(measurer.style, {
    position: 'absolute',
    left: '-100000px',
    top: '0',
    visibility: 'hidden',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word',
    contain: 'layout style'
  })
  document.body.appendChild(measurer)
  return measurer
}

export function fittedFontSize(el: TextElement): number {
  const max = el.style.fontSize
  if (!el.autoFit || !el.text.trim()) return max
  const innerW = Math.max(1, el.frame.width - el.padding * 2)
  const innerH = Math.max(1, el.frame.height - el.padding * 2)
  const key = JSON.stringify([el.text, el.style, innerW, innerH])
  const hit = cache.get(key)
  if (hit !== undefined) return hit

  const m = getMeasurer()
  m.style.width = `${innerW}px`
  m.textContent = el.text
  const fits = (size: number): boolean => {
    const css = textCss(el.style, size)
    Object.assign(m.style, {
      fontFamily: css.fontFamily,
      fontSize: `${size}px`,
      fontWeight: String(css.fontWeight),
      fontStyle: css.fontStyle,
      lineHeight: String(css.lineHeight),
      letterSpacing: `${el.style.letterSpacing}px`,
      textTransform: css.textTransform
    })
    return m.scrollHeight <= innerH && m.scrollWidth <= innerW + 1
  }

  let result = max
  if (!fits(max)) {
    let lo = 8
    let hi = max
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2)
      if (fits(mid)) lo = mid
      else hi = mid
    }
    result = lo
  }
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string)
  cache.set(key, result)
  return result
}

/** Fonts that finish loading change metrics; clear cached fits when that happens. */
if (typeof document !== 'undefined' && document.fonts) {
  document.fonts.addEventListener('loadingdone', () => cache.clear())
}
