/**
 * Lyric themes: ready-made text looks for songs and other text slides. Applying a theme
 * restyles the main text box of every slide (font, size, colour, position, shadow, box) and,
 * when the theme says so, the presentation background. Lyrics themes keep the background
 * transparent so a live background video shows behind the words.
 */
import { defaultTextStyle } from './factory'
import type { Background, CanvasSize, Presentation, Rect, Shadow, TextElement, TextStyle } from './types'

export interface LyricTheme {
  id: string
  name: string
  description: string
  style: Partial<TextStyle>
  frame: (c: CanvasSize) => Rect
  shadow: Shadow | null
  /** Box behind the text, null = none */
  fill: string | null
  padding: number
  /** Presentation background; undefined = leave as is, null = project default */
  background?: Background | null
}

const full = (c: CanvasSize): Rect => {
  const mx = Math.round(c.width * 0.06)
  const my = Math.round(c.height * 0.08)
  return { x: mx, y: my, width: c.width - mx * 2, height: c.height - my * 2 }
}

const softShadow: Shadow = { enabled: true, color: 'rgba(0,0,0,0.65)', blur: 14, offsetX: 0, offsetY: 4 }
const strongShadow: Shadow = { enabled: true, color: 'rgba(0,0,0,0.85)', blur: 24, offsetX: 0, offsetY: 6 }
const TRANSPARENT: Background = { type: 'none' }

export const LYRIC_THEMES: LyricTheme[] = [
  {
    id: 'classic',
    name: 'Classic Center',
    description: 'White, centred, soft shadow. Works on almost any background.',
    style: { fontFamily: 'Segoe UI, Helvetica Neue, Arial, sans-serif', fontSize: 84, fontWeight: 600, color: '#ffffff', align: 'center', verticalAlign: 'middle', lineHeight: 1.2, textTransform: 'none', strokeWidth: 0 },
    frame: full,
    shadow: softShadow,
    fill: null,
    padding: 24,
    background: TRANSPARENT
  },
  {
    id: 'bold-caps',
    name: 'Bold Caps',
    description: 'Big uppercase words with letter spacing — modern worship look.',
    style: { fontFamily: 'Segoe UI, Helvetica Neue, Arial, sans-serif', fontSize: 92, fontWeight: 800, color: '#ffffff', align: 'center', verticalAlign: 'middle', lineHeight: 1.15, letterSpacing: 3, textTransform: 'uppercase', strokeWidth: 0 },
    frame: full,
    shadow: strongShadow,
    fill: null,
    padding: 24,
    background: TRANSPARENT
  },
  {
    id: 'lower-third',
    name: 'Lower Third',
    description: 'Lyrics along the bottom on a dark band — keeps the video or camera visible.',
    style: { fontFamily: 'Segoe UI, Helvetica Neue, Arial, sans-serif', fontSize: 60, fontWeight: 600, color: '#ffffff', align: 'center', verticalAlign: 'middle', lineHeight: 1.2, textTransform: 'none', strokeWidth: 0 },
    frame: (c) => ({ x: 0, y: Math.round(c.height * 0.72), width: c.width, height: Math.round(c.height * 0.24) }),
    shadow: null,
    fill: 'rgba(0,0,0,0.6)',
    padding: 20,
    background: TRANSPARENT
  },
  {
    id: 'boxed',
    name: 'Boxed',
    description: 'Text on a soft dark panel — readable over busy or bright videos.',
    style: { fontFamily: 'Segoe UI, Helvetica Neue, Arial, sans-serif', fontSize: 72, fontWeight: 600, color: '#ffffff', align: 'center', verticalAlign: 'middle', lineHeight: 1.25, textTransform: 'none', strokeWidth: 0 },
    frame: (c) => ({ x: Math.round(c.width * 0.12), y: Math.round(c.height * 0.24), width: Math.round(c.width * 0.76), height: Math.round(c.height * 0.52) }),
    shadow: null,
    fill: 'rgba(0,0,0,0.5)',
    padding: 40,
    background: TRANSPARENT
  },
  {
    id: 'outline',
    name: 'Outline',
    description: 'White text with a black outline — stays sharp on any video.',
    style: { fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 88, fontWeight: 700, color: '#ffffff', align: 'center', verticalAlign: 'middle', lineHeight: 1.2, textTransform: 'none', strokeColor: '#000000', strokeWidth: 6 },
    frame: full,
    shadow: null,
    fill: null,
    padding: 24,
    background: TRANSPARENT
  },
  {
    id: 'serif',
    name: 'Elegant Serif',
    description: 'Classic serif for hymns and reflective songs.',
    style: { fontFamily: 'Georgia, Times New Roman, serif', fontSize: 80, fontWeight: 400, color: '#fdf6e3', align: 'center', verticalAlign: 'middle', lineHeight: 1.35, textTransform: 'none', strokeWidth: 0 },
    frame: full,
    shadow: softShadow,
    fill: null,
    padding: 24,
    background: TRANSPARENT
  },
  {
    id: 'modern-left',
    name: 'Modern Left',
    description: 'Left-aligned on the left of the screen, leaving space for the background.',
    style: { fontFamily: 'Segoe UI, Helvetica Neue, Arial, sans-serif', fontSize: 76, fontWeight: 700, color: '#ffffff', align: 'left', verticalAlign: 'middle', lineHeight: 1.2, textTransform: 'none', strokeWidth: 0 },
    frame: (c) => ({ x: Math.round(c.width * 0.07), y: Math.round(c.height * 0.1), width: Math.round(c.width * 0.6), height: Math.round(c.height * 0.8) }),
    shadow: softShadow,
    fill: null,
    padding: 16,
    background: TRANSPARENT
  },
  {
    id: 'gold',
    name: 'Warm Gold',
    description: 'Gold lettering for Christmas, Easter and special services.',
    style: { fontFamily: 'Georgia, Times New Roman, serif', fontSize: 84, fontWeight: 700, color: '#fcd34d', align: 'center', verticalAlign: 'middle', lineHeight: 1.25, textTransform: 'none', strokeWidth: 0 },
    frame: full,
    shadow: strongShadow,
    fill: null,
    padding: 24,
    background: TRANSPARENT
  }
]

export function findTheme(id: string | undefined): LyricTheme | undefined {
  return LYRIC_THEMES.find((t) => t.id === id)
}

/** Template for generating song slides with a theme (see buildSongSlides). */
export function themeTemplate(theme: LyricTheme, canvas: CanvasSize, base: TextStyle = defaultTextStyle()): { style: TextStyle; frame: Rect } {
  return { style: { ...base, ...theme.style }, frame: theme.frame(canvas) }
}

/** Restyles one text element in place. */
export function applyThemeToElement(el: TextElement, theme: LyricTheme, canvas: CanvasSize): void {
  el.style = { ...el.style, ...theme.style }
  el.frame = theme.frame(canvas)
  el.shadow = theme.shadow ? { ...theme.shadow } : null
  el.fill = theme.fill
  el.padding = theme.padding
  el.autoFit = true
}

/**
 * Applies a theme to a presentation (inside an Immer draft): the first text box of every
 * slide is restyled; other elements are left alone.
 */
export function applyThemeToPresentation(p: Presentation, theme: LyricTheme, canvas: CanvasSize): void {
  for (const slide of p.slides) {
    const el = slide.elements.find((e) => e.type === 'text')
    if (el && el.type === 'text') applyThemeToElement(el, theme, canvas)
  }
  if (theme.background !== undefined) p.background = theme.background
  p.meta = { ...p.meta, theme: theme.id }
}
