import {
  PROJECT_FORMAT,
  PROJECT_SCHEMA_VERSION,
  type Background,
  type CanvasSize,
  type Folder,
  type Id,
  type ImageElement,
  type MediaAsset,
  type Overlay,
  type Playlist,
  type Presentation,
  type PresentationKind,
  type Project,
  type ProjectSettings,
  type Rect,
  type ShapeElement,
  type ShapeKind,
  type Slide,
  type TextElement,
  type TextStyle,
  type TimerDef,
  type TimerKind,
  type TransitionSpec,
  type TreeScope,
  type VideoElement
} from './types'

export function newId(): Id {
  return globalThis.crypto.randomUUID()
}

export function nowIso(): string {
  return new Date().toISOString()
}

export const DEFAULT_CANVAS: CanvasSize = { width: 1920, height: 1080 }

export function defaultTextStyle(): TextStyle {
  return {
    fontFamily: 'Segoe UI, Helvetica Neue, Arial, sans-serif',
    fontSize: 84,
    fontWeight: 600,
    italic: false,
    underline: false,
    color: '#ffffff',
    align: 'center',
    verticalAlign: 'middle',
    lineHeight: 1.2,
    letterSpacing: 0,
    textTransform: 'none',
    strokeColor: '#000000',
    strokeWidth: 0
  }
}

export function defaultTransition(): TransitionSpec {
  return { type: 'fade', durationMs: 400, direction: 'left' }
}

export function defaultBackground(): Background {
  return { type: 'color', color: '#000000' }
}

export function defaultProjectSettings(): ProjectSettings {
  return {
    canvas: { ...DEFAULT_CANVAS },
    defaultBackground: defaultBackground(),
    defaultTransition: defaultTransition(),
    defaultTextStyle: defaultTextStyle(),
    logoMediaId: null,
    // 0 = automatic (chosen from line lengths)
    linesPerSlide: 0
  }
}

export function createProject(name: string): Project {
  const now = nowIso()
  return {
    format: PROJECT_FORMAT,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: newId(),
    name,
    createdAt: now,
    updatedAt: now,
    settings: defaultProjectSettings(),
    trees: { library: [], playlists: [] },
    folders: {},
    presentations: {},
    playlists: {},
    media: {},
    overlays: {},
    overlayOrder: [],
    timers: {},
    timerOrder: []
  }
}

/* ------------------------------------------------------------------ */
/* Elements                                                            */
/* ------------------------------------------------------------------ */

function baseElement(name: string, frame: Rect): Omit<TextElement, 'type' | 'text' | 'style' | 'padding' | 'fill' | 'autoFit'> {
  return { id: newId(), name, frame, rotation: 0, opacity: 1, locked: false, hidden: false, shadow: null }
}

export function safeAreaRect(canvas: CanvasSize): Rect {
  const marginX = Math.round(canvas.width * 0.06)
  const marginY = Math.round(canvas.height * 0.08)
  return { x: marginX, y: marginY, width: canvas.width - marginX * 2, height: canvas.height - marginY * 2 }
}

/** A text box; defaults to the full safe area, the standard lyric/announcement layout. */
export function createTextElement(
  canvas: CanvasSize,
  text: string,
  style: TextStyle = defaultTextStyle(),
  frame: Rect = safeAreaRect(canvas)
): TextElement {
  return {
    ...baseElement('Text', frame),
    shadow: { enabled: true, color: 'rgba(0,0,0,0.6)', blur: 12, offsetX: 0, offsetY: 4 },
    type: 'text',
    text,
    style: { ...style },
    padding: 24,
    fill: null,
    autoFit: true
  }
}

export function createShapeElement(canvas: CanvasSize, shape: ShapeKind): ShapeElement {
  const w = Math.round(canvas.width * 0.3)
  const h = shape === 'ellipse' ? w : Math.round(canvas.height * 0.25)
  return {
    ...baseElement(shape === 'ellipse' ? 'Ellipse' : 'Rectangle', {
      x: Math.round((canvas.width - w) / 2),
      y: Math.round((canvas.height - h) / 2),
      width: w,
      height: h
    }),
    type: 'shape',
    shape,
    fill: { type: 'solid', color: '#16a34a' },
    strokeColor: '#ffffff',
    strokeWidth: 0,
    cornerRadius: shape === 'rectangle' ? 12 : 0
  }
}

/** Fits a media asset's aspect ratio inside `fraction` of the canvas, centred. */
function mediaFrame(canvas: CanvasSize, asset: MediaAsset, fraction = 0.6): Rect {
  const aspect = asset.width && asset.height ? asset.width / asset.height : 16 / 9
  let w = canvas.width * fraction
  let h = w / aspect
  if (h > canvas.height * fraction) {
    h = canvas.height * fraction
    w = h * aspect
  }
  return { x: Math.round((canvas.width - w) / 2), y: Math.round((canvas.height - h) / 2), width: Math.round(w), height: Math.round(h) }
}

export function createImageElement(canvas: CanvasSize, asset: MediaAsset): ImageElement {
  return { ...baseElement(asset.name || 'Image', mediaFrame(canvas, asset)), type: 'image', mediaId: asset.id, fit: 'contain' }
}

export function createVideoElement(canvas: CanvasSize, asset: MediaAsset): VideoElement {
  return { ...baseElement(asset.name || 'Video', mediaFrame(canvas, asset)), type: 'video', mediaId: asset.id, fit: 'contain', loop: true, muted: false }
}

/* ------------------------------------------------------------------ */
/* Slides & presentations                                              */
/* ------------------------------------------------------------------ */

export function createSlide(canvas: CanvasSize, text = '', style?: TextStyle): Slide {
  return {
    id: newId(),
    label: '',
    color: null,
    groupId: null,
    elements: [createTextElement(canvas, text, style)],
    background: null,
    notes: '',
    transition: null,
    enabled: true
  }
}

export function createEmptySlide(): Slide {
  return { id: newId(), label: '', color: null, groupId: null, elements: [], background: null, notes: '', transition: null, enabled: true }
}

export function createPresentation(name: string, slides: Slide[] = [], kind: PresentationKind = 'standard'): Presentation {
  const now = nowIso()
  return {
    id: newId(),
    name,
    kind,
    slides,
    groups: [],
    background: null,
    transition: null,
    meta: {},
    song: null,
    createdAt: now,
    updatedAt: now
  }
}

export function createFolder(scope: TreeScope, name: string): Folder {
  return { id: newId(), scope, name, childIds: [] }
}

export function createPlaylist(name: string): Playlist {
  const now = nowIso()
  return { id: newId(), name, entries: [], createdAt: now, updatedAt: now }
}

/** Deep-copies a slide giving it (and its elements) fresh ids. */
export function cloneSlide(slide: Slide): Slide {
  const copy = structuredClone(slide)
  copy.id = newId()
  for (const el of copy.elements) el.id = newId()
  return copy
}

/** Deep-copies a presentation with fresh ids everywhere, remapping slide group references. */
export function clonePresentation(source: Presentation, name: string): Presentation {
  const copy = structuredClone(source)
  const now = nowIso()
  copy.id = newId()
  copy.name = name
  copy.createdAt = now
  copy.updatedAt = now
  const groupMap = new Map<Id, Id>()
  for (const g of copy.groups) {
    const fresh = newId()
    groupMap.set(g.id, fresh)
    g.id = fresh
  }
  copy.slides = copy.slides.map((s) => {
    const c = cloneSlide(s)
    c.groupId = s.groupId ? (groupMap.get(s.groupId) ?? null) : null
    return c
  })
  // Song sections double as group ids; keep them in sync.
  if (copy.song) {
    copy.song.sections = copy.song.sections.map((sec) => ({ ...sec, id: groupMap.get(sec.id) ?? sec.id }))
    copy.song.arrangement = copy.song.arrangement.map((id) => groupMap.get(id) ?? id)
  }
  return copy
}

/**
 * Splits free text into slide texts. Blank lines separate slides; leading/trailing
 * whitespace is trimmed. Used by "New Presentation from Text" and the lyrics importer.
 */
export function splitTextIntoSlides(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
}

/* ------------------------------------------------------------------ */
/* Overlays & timers                                                   */
/* ------------------------------------------------------------------ */

export type OverlayTemplate = 'blank' | 'lower-third' | 'social' | 'announcement' | 'countdown' | 'logo'

export function createOverlay(canvas: CanvasSize, template: OverlayTemplate, logo?: MediaAsset, timerName = 'Countdown'): Overlay {
  const slide = createEmptySlide()
  slide.background = { type: 'none' }
  const W = canvas.width
  const H = canvas.height
  const style = (patch: Partial<TextStyle>): TextStyle => ({ ...defaultTextStyle(), ...patch })
  let name = 'Overlay'
  switch (template) {
    case 'lower-third': {
      name = 'Lower Third'
      const bar: ShapeElement = {
        ...createShapeElement(canvas, 'rectangle'),
        name: 'Bar',
        frame: { x: Math.round(W * 0.05), y: Math.round(H * 0.74), width: Math.round(W * 0.5), height: Math.round(H * 0.15) },
        fill: { type: 'gradient', gradient: { kind: 'linear', angle: 90, stops: [{ color: 'rgba(21,128,61,0.95)', position: 0 }, { color: 'rgba(21,128,61,0.55)', position: 1 }] } },
        cornerRadius: 10
      }
      const title = createTextElement(canvas, 'Speaker Name', style({ fontSize: 64, align: 'left', fontWeight: 700 }), {
        x: bar.frame.x + 30,
        y: bar.frame.y + 8,
        width: bar.frame.width - 60,
        height: Math.round(bar.frame.height * 0.6)
      })
      title.name = 'Name'
      title.padding = 0
      const subtitle = createTextElement(canvas, 'Title or Role', style({ fontSize: 38, align: 'left', fontWeight: 400 }), {
        x: bar.frame.x + 30,
        y: bar.frame.y + Math.round(bar.frame.height * 0.58),
        width: bar.frame.width - 60,
        height: Math.round(bar.frame.height * 0.36)
      })
      subtitle.name = 'Subtitle'
      subtitle.padding = 0
      slide.elements = [bar, title, subtitle]
      break
    }
    case 'social': {
      name = 'Social Handle'
      const t = createTextElement(canvas, '@yourchurch', style({ fontSize: 48, align: 'right', verticalAlign: 'bottom' }), {
        x: Math.round(W * 0.55),
        y: Math.round(H * 0.86),
        width: Math.round(W * 0.42),
        height: Math.round(H * 0.1)
      })
      slide.elements = [t]
      break
    }
    case 'announcement': {
      name = 'Announcement Banner'
      const bar: ShapeElement = {
        ...createShapeElement(canvas, 'rectangle'),
        name: 'Banner',
        frame: { x: 0, y: 0, width: W, height: Math.round(H * 0.12) },
        fill: { type: 'solid', color: 'rgba(0,0,0,0.75)' },
        cornerRadius: 0
      }
      const t = createTextElement(canvas, 'Welcome! Service begins shortly.', style({ fontSize: 54 }), { ...bar.frame })
      t.padding = 12
      slide.elements = [bar, t]
      break
    }
    case 'countdown': {
      name = `${timerName} Overlay`
      const t = createTextElement(canvas, `{timer:${timerName}}`, style({ fontSize: 220, fontWeight: 700 }), {
        x: Math.round(W * 0.2),
        y: Math.round(H * 0.3),
        width: Math.round(W * 0.6),
        height: Math.round(H * 0.4)
      })
      t.autoFit = false
      slide.elements = [t]
      break
    }
    case 'logo': {
      name = 'Logo Bug'
      if (logo) {
        const img = createImageElement(canvas, logo)
        const w = Math.round(W * 0.12)
        const aspect = logo.width && logo.height ? logo.width / logo.height : 1
        img.frame = { x: W - w - Math.round(W * 0.03), y: Math.round(H * 0.04), width: w, height: Math.round(w / aspect) }
        slide.elements = [img]
      }
      break
    }
    case 'blank':
      break
  }
  return { id: newId(), name, slide }
}

export function createTimer(name: string, kind: TimerKind = 'countdown'): TimerDef {
  return { id: newId(), name, kind, durationSec: 300, targetTime: '10:00', allowOverrun: false }
}
