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

/* Bundled fonts (renderer/src/styles/fonts.css), so these look the same on every computer. */
const MONTSERRAT = "'Montserrat Variable', Montserrat, sans-serif"
const POPPINS = 'Poppins, sans-serif'
const NUNITO = "'Nunito Variable', Nunito, sans-serif"
const RALEWAY = "'Raleway Variable', Raleway, sans-serif"
const OSWALD = "'Oswald Variable', Oswald, sans-serif"
const BEBAS = "'Bebas Neue', sans-serif"
const PLAYFAIR = "'Playfair Display Variable', 'Playfair Display', serif"
const LORA = "'Lora Variable', Lora, serif"
const DANCING = "'Dancing Script Variable', 'Dancing Script', cursive"

const glow = (color: string, blur = 30): Shadow => ({ enabled: true, color, blur, offsetX: 0, offsetY: 0 })
const linear = (angle: number, ...colors: string[]): Background => ({
  type: 'gradient',
  gradient: { kind: 'linear', angle, stops: colors.map((color, i) => ({ color, position: i / (colors.length - 1) })) }
})
/** Centred band in the middle of the screen, for short lines. */
const band = (c: CanvasSize): Rect => ({ x: Math.round(c.width * 0.1), y: Math.round(c.height * 0.2), width: Math.round(c.width * 0.8), height: Math.round(c.height * 0.6) })
/** Bottom of the screen, like film subtitles. */
const subtitle = (c: CanvasSize): Rect => ({ x: Math.round(c.width * 0.08), y: Math.round(c.height * 0.68), width: Math.round(c.width * 0.84), height: Math.round(c.height * 0.26) })

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
  },
  {
    id: 'soft-minimal',
    name: 'Soft Minimal',
    description: 'Light Montserrat with airy spacing — calm and clean.',
    style: { fontFamily: MONTSERRAT, fontSize: 70, fontWeight: 300, color: '#ffffff', align: 'center', verticalAlign: 'middle', lineHeight: 1.45, letterSpacing: 2, textTransform: 'none', strokeWidth: 0 },
    frame: band,
    shadow: softShadow,
    fill: null,
    padding: 24,
    background: TRANSPARENT
  },
  {
    id: 'poster-stack',
    name: 'Poster Stack',
    description: 'Tall Bebas Neue capitals stacked tight — bold, modern worship.',
    style: { fontFamily: BEBAS, fontSize: 132, fontWeight: 400, color: '#ffffff', align: 'center', verticalAlign: 'middle', lineHeight: 1.0, letterSpacing: 4, textTransform: 'uppercase', strokeWidth: 0 },
    frame: full,
    shadow: strongShadow,
    fill: null,
    padding: 24,
    background: TRANSPARENT
  },
  {
    id: 'editorial-italic',
    name: 'Editorial Italic',
    description: 'Playfair Display italic in warm ivory — like a magazine cover.',
    style: { fontFamily: PLAYFAIR, fontSize: 84, fontWeight: 500, italic: true, color: '#fff8ee', align: 'center', verticalAlign: 'middle', lineHeight: 1.3, letterSpacing: 0, textTransform: 'none', strokeWidth: 0 },
    frame: full,
    shadow: softShadow,
    fill: null,
    padding: 24,
    background: TRANSPARENT
  },
  {
    id: 'handwritten',
    name: 'Handwritten',
    description: 'Flowing script for intimate songs and short phrases.',
    style: { fontFamily: DANCING, fontSize: 104, fontWeight: 600, color: '#ffffff', align: 'center', verticalAlign: 'middle', lineHeight: 1.25, letterSpacing: 0, textTransform: 'none', strokeWidth: 0 },
    frame: full,
    shadow: softShadow,
    fill: null,
    padding: 24,
    background: TRANSPARENT
  },
  {
    id: 'cinematic',
    name: 'Cinematic',
    description: 'Small spaced capitals near the bottom, like film subtitles.',
    style: { fontFamily: RALEWAY, fontSize: 50, fontWeight: 500, color: '#ffffff', align: 'center', verticalAlign: 'bottom', lineHeight: 1.5, letterSpacing: 6, textTransform: 'uppercase', strokeWidth: 0 },
    frame: subtitle,
    shadow: strongShadow,
    fill: null,
    padding: 16,
    background: TRANSPARENT
  },
  {
    id: 'frosted-glass',
    name: 'Frosted Glass',
    description: 'White words on a soft see-through panel — gentle over bright videos.',
    style: { fontFamily: NUNITO, fontSize: 70, fontWeight: 700, color: '#ffffff', align: 'center', verticalAlign: 'middle', lineHeight: 1.3, letterSpacing: 0, textTransform: 'none', strokeWidth: 0 },
    frame: (c) => ({ x: Math.round(c.width * 0.14), y: Math.round(c.height * 0.26), width: Math.round(c.width * 0.72), height: Math.round(c.height * 0.48) }),
    shadow: { enabled: true, color: 'rgba(0,0,0,0.35)', blur: 10, offsetX: 0, offsetY: 2 },
    fill: 'rgba(255,255,255,0.16)',
    padding: 44,
    background: TRANSPARENT
  },
  {
    id: 'neon-glow',
    name: 'Neon Glow',
    description: 'Icy white capitals with a cyan glow — youth nights and upbeat songs.',
    style: { fontFamily: MONTSERRAT, fontSize: 86, fontWeight: 800, color: '#ecfeff', align: 'center', verticalAlign: 'middle', lineHeight: 1.2, letterSpacing: 1, textTransform: 'uppercase', strokeWidth: 0 },
    frame: full,
    shadow: glow('rgba(34,211,238,0.95)', 34),
    fill: null,
    padding: 24,
    background: TRANSPARENT
  },
  {
    id: 'sunset-glow',
    name: 'Sunset Glow',
    description: 'Warm cream text with an orange halo — golden-hour feel.',
    style: { fontFamily: POPPINS, fontSize: 80, fontWeight: 700, color: '#fff4e6', align: 'center', verticalAlign: 'middle', lineHeight: 1.25, letterSpacing: 0, textTransform: 'none', strokeWidth: 0 },
    frame: full,
    shadow: glow('rgba(249,115,22,0.85)', 30),
    fill: null,
    padding: 24,
    background: TRANSPARENT
  },
  {
    id: 'pastel-blush',
    name: 'Pastel Blush',
    description: 'Rounded blush-pink lettering — soft and friendly.',
    style: { fontFamily: NUNITO, fontSize: 82, fontWeight: 800, color: '#ffe4ec', align: 'center', verticalAlign: 'middle', lineHeight: 1.25, letterSpacing: 0, textTransform: 'none', strokeWidth: 0 },
    frame: full,
    shadow: { enabled: true, color: 'rgba(80,20,50,0.6)', blur: 16, offsetX: 0, offsetY: 4 },
    fill: null,
    padding: 24,
    background: TRANSPARENT
  },
  {
    id: 'anthem',
    name: 'Anthem',
    description: 'Condensed Oswald capitals, big and confident — for declarations.',
    style: { fontFamily: OSWALD, fontSize: 108, fontWeight: 700, color: '#ffffff', align: 'center', verticalAlign: 'middle', lineHeight: 1.05, letterSpacing: 2, textTransform: 'uppercase', strokeWidth: 0 },
    frame: full,
    shadow: strongShadow,
    fill: null,
    padding: 24,
    background: TRANSPARENT
  },
  {
    id: 'corner-modern',
    name: 'Corner Modern',
    description: 'Left-aligned in the lower-left corner — leaves the picture open.',
    style: { fontFamily: POPPINS, fontSize: 64, fontWeight: 600, color: '#ffffff', align: 'left', verticalAlign: 'bottom', lineHeight: 1.25, letterSpacing: 0, textTransform: 'none', strokeWidth: 0 },
    frame: (c) => ({ x: Math.round(c.width * 0.06), y: Math.round(c.height * 0.45), width: Math.round(c.width * 0.62), height: Math.round(c.height * 0.47) }),
    shadow: softShadow,
    fill: null,
    padding: 16,
    background: TRANSPARENT
  },
  {
    id: 'midnight',
    name: 'Midnight',
    description: 'Lora serif on a deep navy-to-violet gradient — reflective and still.',
    style: { fontFamily: LORA, fontSize: 78, fontWeight: 500, color: '#eef2ff', align: 'center', verticalAlign: 'middle', lineHeight: 1.4, letterSpacing: 0, textTransform: 'none', strokeWidth: 0 },
    frame: full,
    shadow: softShadow,
    fill: null,
    padding: 24,
    background: linear(160, '#0b1026', '#1e1b4b', '#3b0764')
  },
  {
    id: 'forest-dawn',
    name: 'Forest Dawn',
    description: 'Soft white on a deep green gradient, in the BHCF colours.',
    style: { fontFamily: MONTSERRAT, fontSize: 78, fontWeight: 600, color: '#f0fdf4', align: 'center', verticalAlign: 'middle', lineHeight: 1.3, letterSpacing: 0.5, textTransform: 'none', strokeWidth: 0 },
    frame: full,
    shadow: softShadow,
    fill: null,
    padding: 24,
    background: linear(145, '#052e16', '#14532d', '#3f6212')
  },
  {
    id: 'paper-ink',
    name: 'Paper & Ink',
    description: 'Dark serif text on warm paper — for bright rooms and daytime services.',
    style: { fontFamily: PLAYFAIR, fontSize: 80, fontWeight: 600, color: '#1c1917', align: 'center', verticalAlign: 'middle', lineHeight: 1.35, letterSpacing: 0, textTransform: 'none', strokeWidth: 0 },
    frame: full,
    shadow: null,
    fill: null,
    padding: 24,
    background: { type: 'color', color: '#f5efe3' }
  }
]

export function findTheme(id: string | undefined): LyricTheme | undefined {
  return LYRIC_THEMES.find((t) => t.id === id)
}

/** Template for generating song slides with a theme (see buildSongSlides). */
export function themeTemplate(theme: LyricTheme, canvas: CanvasSize, base: TextStyle = defaultTextStyle()): { style: TextStyle; frame: Rect } {
  return { style: { ...base, italic: false, letterSpacing: 0, ...theme.style }, frame: theme.frame(canvas) }
}

/** Restyles one text element in place. */
export function applyThemeToElement(el: TextElement, theme: LyricTheme, canvas: CanvasSize): void {
  // Italic and letter spacing reset first, so switching away from a theme that sets them clears them.
  el.style = { ...el.style, italic: false, letterSpacing: 0, ...theme.style }
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
