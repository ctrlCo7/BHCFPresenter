/**
 * Core document model for a BHCF Presenter project.
 *
 * Everything in here is plain, serialisable data (no classes, no functions) so it can be
 * persisted as JSON, sent over IPC to output windows, and diffed cheaply via structural sharing.
 * All geometry is expressed in logical canvas pixels (see ProjectSettings.canvas).
 */

export type Id = string
export type IsoDate = string

/* ------------------------------------------------------------------ */
/* Fills & backgrounds                                                  */
/* ------------------------------------------------------------------ */

export interface GradientStop {
  color: string
  /** 0..1 */
  position: number
}

export interface Gradient {
  kind: 'linear' | 'radial'
  /** degrees, linear only */
  angle: number
  stops: GradientStop[]
}

export type MediaFit = 'contain' | 'cover' | 'fill'

export type Background =
  | { type: 'none' }
  | { type: 'color'; color: string }
  | { type: 'gradient'; gradient: Gradient }
  | { type: 'image'; mediaId: Id; fit: MediaFit }
  | { type: 'video'; mediaId: Id; fit: MediaFit; loop: boolean; muted: boolean }

export type ShapeFill = { type: 'solid'; color: string } | { type: 'gradient'; gradient: Gradient }

/* ------------------------------------------------------------------ */
/* Slide elements                                                       */
/* ------------------------------------------------------------------ */

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface Shadow {
  enabled: boolean
  color: string
  blur: number
  offsetX: number
  offsetY: number
}

export interface ElementBase {
  id: Id
  name: string
  frame: Rect
  /** degrees */
  rotation: number
  /** 0..1 */
  opacity: number
  locked: boolean
  hidden: boolean
  shadow: Shadow | null
}

export type TextAlign = 'left' | 'center' | 'right' | 'justify'
export type VerticalAlign = 'top' | 'middle' | 'bottom'
export type TextTransform = 'none' | 'uppercase' | 'lowercase' | 'capitalize'

export interface TextStyle {
  fontFamily: string
  fontSize: number
  fontWeight: number
  italic: boolean
  underline: boolean
  color: string
  align: TextAlign
  verticalAlign: VerticalAlign
  /** unitless multiplier */
  lineHeight: number
  /** px */
  letterSpacing: number
  textTransform: TextTransform
  strokeColor: string
  /** px, 0 = no outline */
  strokeWidth: number
}

export interface TextElement extends ElementBase {
  type: 'text'
  text: string
  style: TextStyle
  padding: number
  /** Box fill behind the text; null = transparent */
  fill: string | null
  /** Shrink font to fit the frame when the text overflows */
  autoFit: boolean
}

export interface ImageElement extends ElementBase {
  type: 'image'
  mediaId: Id
  fit: MediaFit
}

export interface VideoElement extends ElementBase {
  type: 'video'
  mediaId: Id
  fit: MediaFit
  loop: boolean
  muted: boolean
}

export type ShapeKind = 'rectangle' | 'ellipse'

export interface ShapeElement extends ElementBase {
  type: 'shape'
  shape: ShapeKind
  fill: ShapeFill
  strokeColor: string
  strokeWidth: number
  cornerRadius: number
}

export type SlideElement = TextElement | ImageElement | VideoElement | ShapeElement
export type SlideElementType = SlideElement['type']

/* ------------------------------------------------------------------ */
/* Slides & presentations                                              */
/* ------------------------------------------------------------------ */

export type TransitionType = 'cut' | 'fade' | 'dissolve' | 'slide' | 'push' | 'zoom' | 'wipe'
export type TransitionDirection = 'left' | 'right' | 'up' | 'down'

export interface TransitionSpec {
  type: TransitionType
  durationMs: number
  direction: TransitionDirection
}

/** A named section of a presentation (e.g. "Verse 1", "Chorus"). */
export interface SlideGroup {
  id: Id
  name: string
  color: string
}

export interface Slide {
  id: Id
  label: string
  /** Label colour shown on thumbnails, null = none */
  color: string | null
  groupId: Id | null
  elements: SlideElement[]
  /** null = inherit presentation / project background */
  background: Background | null
  notes: string
  /** null = inherit presentation / project transition */
  transition: TransitionSpec | null
  /** Disabled slides are skipped by next/previous during live */
  enabled: boolean
}

export type PresentationKind = 'standard' | 'song' | 'scripture'

/** One section of a song's lyrics ("Verse 1", "Chorus", …). */
export interface SongSection {
  id: Id
  name: string
  text: string
}

/** Source lyrics of a song presentation; slides are generated from it. */
export interface SongData {
  title: string
  artist: string
  copyright: string
  ccli: string
  sections: SongSection[]
  /** Section ids in performance order; empty = sections in written order */
  arrangement: Id[]
}

export interface Presentation {
  id: Id
  name: string
  kind: PresentationKind
  slides: Slide[]
  groups: SlideGroup[]
  background: Background | null
  transition: TransitionSpec | null
  /** Free-form metadata (artist, copyright, CCLI number, reference…) */
  meta: Record<string, string>
  /** Lyrics source for kind === 'song' */
  song: SongData | null
  createdAt: IsoDate
  updatedAt: IsoDate
}

/* ------------------------------------------------------------------ */
/* Overlays & timers                                                   */
/* ------------------------------------------------------------------ */

/** A reusable layer (logo, lower third, social handle…) shown above slides during live. */
export interface Overlay {
  id: Id
  name: string
  /** Edited with the slide editor; its background is ignored (always transparent) */
  slide: Slide
}

export type TimerKind = 'countdown' | 'countup' | 'clock' | 'countdown-to-time'

export interface TimerDef {
  id: Id
  name: string
  kind: TimerKind
  /** countdown length in seconds */
  durationSec: number
  /** "HH:MM" (24h) for countdown-to-time */
  targetTime: string
  /** Keep counting below zero (shown as -m:ss) instead of stopping at 0:00 */
  allowOverrun: boolean
}

/* ------------------------------------------------------------------ */
/* Media                                                               */
/* ------------------------------------------------------------------ */

export type MediaKind = 'image' | 'video' | 'audio'

export interface MediaAsset {
  id: Id
  name: string
  kind: MediaKind
  /** File name inside the project's media directory */
  fileName: string
  originalName: string
  mimeType: string
  sizeBytes: number
  width: number | null
  height: number | null
  /** seconds */
  durationSec: number | null
  /** Poster image file name inside media/.thumbs (videos) */
  thumbnail: string | null
  importedAt: IsoDate
}

/** What a media playlist holds: one kind of media, or backgrounds (images and videos). */
export type MediaPlaylistKind = MediaKind | 'background'

export const MEDIA_PLAYLIST_KINDS: readonly MediaPlaylistKind[] = ['image', 'background', 'video', 'audio']

export function mediaPlaylistAccepts(kind: MediaPlaylistKind, media: MediaKind | undefined): boolean {
  return kind === 'background' ? media === 'image' || media === 'video' : media === kind
}

/** A named collection in the Media tab, in display order. */
/** "pw-backgrounds": the playlist Templates backgrounds go into; its items are hidden from All Media. */
export type MediaPlaylistRole = 'pw-backgrounds'

export interface MediaPlaylist {
  id: Id
  name: string
  kind: MediaPlaylistKind
  mediaIds: Id[]
  role?: MediaPlaylistRole
  createdAt: IsoDate
  updatedAt: IsoDate
}

/* ------------------------------------------------------------------ */
/* Library organisation                                                */
/* ------------------------------------------------------------------ */

export type TreeScope = 'library' | 'playlists'

export interface Folder {
  id: Id
  scope: TreeScope
  name: string
  /** Ordered child ids: folders plus presentations (library) or playlists (playlists) */
  childIds: Id[]
}

export type PlaylistEntry =
  | { id: Id; kind: 'presentation'; presentationId: Id }
  | { id: Id; kind: 'header'; title: string; color: string }

export interface Playlist {
  id: Id
  name: string
  entries: PlaylistEntry[]
  createdAt: IsoDate
  updatedAt: IsoDate
}

/* ------------------------------------------------------------------ */
/* Project                                                             */
/* ------------------------------------------------------------------ */

export interface CanvasSize {
  width: number
  height: number
}

export interface ProjectSettings {
  canvas: CanvasSize
  defaultBackground: Background
  defaultTransition: TransitionSpec
  defaultTextStyle: TextStyle
  /** Image shown full screen by the Logo button */
  logoMediaId: Id | null
  /** Max lyric lines per generated song slide (0 = automatic) */
  linesPerSlide: number
}

/**
 * A workspace for one church event (Sunday Celebration, Lifeclass…). Each profile has its own
 * library pages, service-order playlists and media; the items themselves live in the project's
 * records and a profile lists which ones it shows.
 */
export interface Profile {
  id: Id
  name: string
  /** Root-level ordered ids of this profile's Library and Playlists trees */
  trees: Record<TreeScope, Id[]>
  /** Media assets shown in this profile (an asset may be shared by several profiles) */
  mediaIds: Id[]
  /** This profile's Media-tab playlists, in order */
  mediaPlaylistOrder: Id[]
  createdAt: IsoDate
  updatedAt: IsoDate
}

export const PROJECT_FORMAT = 'bhcf-project'
export const PROJECT_SCHEMA_VERSION = 4

export interface Project {
  format: typeof PROJECT_FORMAT
  schemaVersion: number
  id: Id
  name: string
  createdAt: IsoDate
  updatedAt: IsoDate
  settings: ProjectSettings
  profiles: Record<Id, Profile>
  profileOrder: Id[]
  /** The profile the workspace shows (always one of profileOrder) */
  activeProfileId: Id
  folders: Record<Id, Folder>
  presentations: Record<Id, Presentation>
  playlists: Record<Id, Playlist>
  media: Record<Id, MediaAsset>
  mediaPlaylists: Record<Id, MediaPlaylist>
  overlays: Record<Id, Overlay>
  overlayOrder: Id[]
  timers: Record<Id, TimerDef>
  timerOrder: Id[]
}
