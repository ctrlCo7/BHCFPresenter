/**
 * Validation, migration and repair of project documents loaded from disk.
 *
 * The loader never trusts the file: every collection is checked item by item, missing
 * fields are filled with defaults, invalid items are dropped, and dangling tree / playlist
 * references are repaired. Every repair is reported so the UI can tell the user.
 */
import { isValidMediaFileName } from '../media'
import { createMediaPlaylist, createProfile, DEFAULT_PROFILE_NAMES, defaultBackground, defaultMediaPlaylists, defaultProjectSettings, defaultTextStyle, defaultTransition, nowIso } from './factory'
import {
  PROJECT_FORMAT,
  PROJECT_SCHEMA_VERSION,
  MEDIA_PLAYLIST_KINDS,
  mediaPlaylistAccepts,
  type Background,
  type Folder,
  type Id,
  type MediaAsset,
  type MediaPlaylist,
  type Overlay,
  type Playlist,
  type PlaylistEntry,
  type Profile,
  type Presentation,
  type Project,
  type ProjectSettings,
  type Slide,
  type SlideElement,
  type SongData,
  type TextStyle,
  type TimerDef,
  type TransitionSpec,
  type TreeScope
} from './types'

export class ProjectFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProjectFormatError'
  }
}

export interface NormalizeResult {
  project: Project
  repairs: string[]
}

type Obj = Record<string, unknown>

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown, fallback: string): string => (typeof v === 'string' ? v : fallback)
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback)
const oneOf = <T extends string>(v: unknown, options: readonly T[], fallback: T): T =>
  typeof v === 'string' && (options as readonly string[]).includes(v) ? (v as T) : fallback
const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v))

const TRANSITIONS = ['cut', 'fade', 'dissolve', 'slide', 'push', 'zoom', 'wipe'] as const
const DIRECTIONS = ['left', 'right', 'up', 'down'] as const
const FITS = ['contain', 'cover', 'fill'] as const
const MEDIA_KINDS = ['image', 'video', 'audio'] as const
const KIND_LABELS = { image: 'Images', video: 'Videos', audio: 'Audio' } as const

function normTransition(v: unknown): TransitionSpec | null {
  if (!isObj(v)) return null
  const d = defaultTransition()
  return {
    type: oneOf(v.type, TRANSITIONS, d.type),
    durationMs: clamp(num(v.durationMs, d.durationMs), 0, 10_000),
    direction: oneOf(v.direction, DIRECTIONS, d.direction)
  }
}

function normGradientStops(v: unknown): { color: string; position: number }[] {
  if (!Array.isArray(v)) return []
  return v.filter(isObj).map((s) => ({ color: str(s.color, '#000000'), position: clamp(num(s.position, 0), 0, 1) }))
}

function normBackground(v: unknown): Background | null {
  if (!isObj(v)) return null
  switch (v.type) {
    case 'none':
      return { type: 'none' }
    case 'color':
      return { type: 'color', color: str(v.color, '#000000') }
    case 'gradient': {
      const g = isObj(v.gradient) ? v.gradient : {}
      const stops = normGradientStops(g.stops)
      if (stops.length < 2) return defaultBackground()
      return { type: 'gradient', gradient: { kind: oneOf(g.kind, ['linear', 'radial'] as const, 'linear'), angle: num(g.angle, 180), stops } }
    }
    case 'image':
      if (typeof v.mediaId !== 'string') return null
      return { type: 'image', mediaId: v.mediaId, fit: oneOf(v.fit, FITS, 'cover') }
    case 'video':
      if (typeof v.mediaId !== 'string') return null
      return {
        type: 'video',
        mediaId: v.mediaId,
        fit: oneOf(v.fit, FITS, 'cover'),
        loop: bool(v.loop, true),
        muted: bool(v.muted, true)
      }
    default:
      return null
  }
}

function normTextStyle(v: unknown, base: TextStyle = defaultTextStyle()): TextStyle {
  const s = isObj(v) ? v : {}
  return {
    fontFamily: str(s.fontFamily, base.fontFamily),
    fontSize: clamp(num(s.fontSize, base.fontSize), 1, 2000),
    fontWeight: clamp(num(s.fontWeight, base.fontWeight), 100, 900),
    italic: bool(s.italic, base.italic),
    underline: bool(s.underline, base.underline),
    color: str(s.color, base.color),
    align: oneOf(s.align, ['left', 'center', 'right', 'justify'] as const, base.align),
    verticalAlign: oneOf(s.verticalAlign, ['top', 'middle', 'bottom'] as const, base.verticalAlign),
    lineHeight: clamp(num(s.lineHeight, base.lineHeight), 0.5, 5),
    letterSpacing: num(s.letterSpacing, base.letterSpacing),
    textTransform: oneOf(s.textTransform, ['none', 'uppercase', 'lowercase', 'capitalize'] as const, base.textTransform),
    strokeColor: str(s.strokeColor, base.strokeColor),
    strokeWidth: clamp(num(s.strokeWidth, base.strokeWidth), 0, 100)
  }
}

function normElement(v: unknown): SlideElement | null {
  if (!isObj(v) || typeof v.id !== 'string') return null
  const f = isObj(v.frame) ? v.frame : {}
  const sh = isObj(v.shadow) ? v.shadow : null
  const base = {
    id: v.id,
    name: str(v.name, 'Element'),
    frame: { x: num(f.x, 0), y: num(f.y, 0), width: Math.max(1, num(f.width, 100)), height: Math.max(1, num(f.height, 100)) },
    rotation: num(v.rotation, 0),
    opacity: clamp(num(v.opacity, 1), 0, 1),
    locked: bool(v.locked, false),
    hidden: bool(v.hidden, false),
    shadow: sh
      ? {
          enabled: bool(sh.enabled, true),
          color: str(sh.color, 'rgba(0,0,0,0.5)'),
          blur: Math.max(0, num(sh.blur, 8)),
          offsetX: num(sh.offsetX, 0),
          offsetY: num(sh.offsetY, 4)
        }
      : null
  }
  switch (v.type) {
    case 'text':
      return {
        ...base,
        type: 'text',
        text: str(v.text, ''),
        style: normTextStyle(v.style),
        padding: Math.max(0, num(v.padding, 0)),
        fill: typeof v.fill === 'string' ? v.fill : null,
        autoFit: bool(v.autoFit, true)
      }
    case 'image':
      if (typeof v.mediaId !== 'string') return null
      return { ...base, type: 'image', mediaId: v.mediaId, fit: oneOf(v.fit, FITS, 'contain') }
    case 'video':
      if (typeof v.mediaId !== 'string') return null
      return {
        ...base,
        type: 'video',
        mediaId: v.mediaId,
        fit: oneOf(v.fit, FITS, 'contain'),
        loop: bool(v.loop, false),
        muted: bool(v.muted, false)
      }
    case 'shape': {
      const fill = isObj(v.fill) ? v.fill : {}
      const gradient = isObj(fill.gradient) ? fill.gradient : null
      const stops = gradient ? normGradientStops(gradient.stops) : []
      return {
        ...base,
        type: 'shape',
        shape: oneOf(v.shape, ['rectangle', 'ellipse'] as const, 'rectangle'),
        fill:
          fill.type === 'gradient' && gradient && stops.length >= 2
            ? { type: 'gradient', gradient: { kind: oneOf(gradient.kind, ['linear', 'radial'] as const, 'linear'), angle: num(gradient.angle, 180), stops } }
            : { type: 'solid', color: str(fill.color, '#3b82f6') },
        strokeColor: str(v.strokeColor, '#ffffff'),
        strokeWidth: Math.max(0, num(v.strokeWidth, 0)),
        cornerRadius: Math.max(0, num(v.cornerRadius, 0))
      }
    }
    default:
      return null
  }
}

function normSlide(v: unknown, repairs: string[], ctx: string): Slide | null {
  if (!isObj(v) || typeof v.id !== 'string') {
    repairs.push(`Dropped an unreadable slide in ${ctx}.`)
    return null
  }
  const rawEls = Array.isArray(v.elements) ? v.elements : []
  const elements = rawEls.map(normElement).filter((e): e is SlideElement => e !== null)
  if (elements.length !== rawEls.length) repairs.push(`Dropped ${rawEls.length - elements.length} unreadable element(s) in ${ctx}.`)
  return {
    id: v.id,
    label: str(v.label, ''),
    color: typeof v.color === 'string' ? v.color : null,
    groupId: typeof v.groupId === 'string' ? v.groupId : null,
    elements,
    background: normBackground(v.background),
    notes: str(v.notes, ''),
    transition: normTransition(v.transition),
    enabled: bool(v.enabled, true)
  }
}

function normSong(v: unknown): SongData | null {
  if (!isObj(v)) return null
  const sections = (Array.isArray(v.sections) ? v.sections : [])
    .filter(isObj)
    .filter((s) => typeof s.id === 'string')
    .map((s) => ({ id: s.id as string, name: str(s.name, 'Verse'), text: str(s.text, '') }))
  const ids = new Set(sections.map((s) => s.id))
  return {
    title: str(v.title, ''),
    artist: str(v.artist, ''),
    copyright: str(v.copyright, ''),
    ccli: str(v.ccli, ''),
    sections,
    arrangement: (Array.isArray(v.arrangement) ? v.arrangement : []).filter((x): x is string => typeof x === 'string' && ids.has(x))
  }
}

/** Validates a presentation coming from outside the project (e.g. an imported file). */
export function normalizePresentation(v: unknown): { presentation: Presentation; repairs: string[] } | null {
  const repairs: string[] = []
  const id = isObj(v) && typeof v.id === 'string' ? v.id : globalThis.crypto.randomUUID()
  const presentation = normPresentation(id, v, repairs)
  return presentation ? { presentation, repairs } : null
}

function normOverlay(id: Id, v: unknown, repairs: string[]): Overlay | null {
  if (!isObj(v)) return null
  const name = str(v.name, 'Overlay')
  const slide = normSlide(v.slide, repairs, `overlay "${name}"`)
  if (!slide) return null
  return { id, name, slide: { ...slide, background: { type: 'none' } } }
}

function normTimer(id: Id, v: unknown): TimerDef | null {
  if (!isObj(v)) return null
  return {
    id,
    name: str(v.name, 'Timer'),
    kind: oneOf(v.kind, ['countdown', 'countup', 'clock', 'countdown-to-time'] as const, 'countdown'),
    durationSec: clamp(Math.round(num(v.durationSec, 300)), 0, 24 * 3600),
    targetTime: typeof v.targetTime === 'string' && /^\d{1,2}:\d{2}$/.test(v.targetTime) ? v.targetTime : '10:00',
    allowOverrun: bool(v.allowOverrun, false)
  }
}

/** Keeps only known ids, each once, and appends any that the order list missed. */
/** The known ids in `order`, each once (unknown and repeated ids dropped). */
function knownIds(order: unknown, ids: Id[]): Id[] {
  const known = new Set(ids)
  const seen = new Set<Id>()
  const out: Id[] = []
  for (const id of Array.isArray(order) ? order : []) {
    if (typeof id === 'string' && known.has(id) && !seen.has(id)) {
      seen.add(id)
      out.push(id)
    }
  }
  return out
}

/** `order` repaired to list every id exactly once (missing ones appended). */
function repairOrder(order: unknown, ids: Id[]): Id[] {
  const out = knownIds(order, ids)
  const seen = new Set(out)
  for (const id of ids) if (!seen.has(id)) out.push(id)
  return out
}

function normPresentation(id: Id, v: unknown, repairs: string[]): Presentation | null {
  if (!isObj(v)) return null
  const name = str(v.name, 'Untitled')
  const ctx = `"${name}"`
  const groups = (Array.isArray(v.groups) ? v.groups : [])
    .filter(isObj)
    .filter((g) => typeof g.id === 'string')
    .map((g) => ({ id: g.id as string, name: str(g.name, 'Group'), color: str(g.color, '#64748b') }))
  const groupIds = new Set(groups.map((g) => g.id))
  const slides = (Array.isArray(v.slides) ? v.slides : [])
    .map((s) => normSlide(s, repairs, ctx))
    .filter((s): s is Slide => s !== null)
    .map((s) => (s.groupId && !groupIds.has(s.groupId) ? { ...s, groupId: null } : s))
  const meta: Record<string, string> = {}
  if (isObj(v.meta)) for (const [k, val] of Object.entries(v.meta)) if (typeof val === 'string') meta[k] = val
  const now = nowIso()
  return {
    id,
    name,
    kind: oneOf(v.kind, ['standard', 'song', 'scripture'] as const, 'standard'),
    slides,
    groups,
    background: normBackground(v.background),
    transition: normTransition(v.transition),
    meta,
    song: normSong(v.song),
    createdAt: str(v.createdAt, now),
    updatedAt: str(v.updatedAt, now)
  }
}

function normMedia(id: Id, v: unknown): MediaAsset | null {
  if (!isObj(v) || typeof v.fileName !== 'string' || v.fileName.length === 0) return null
  // fileName must be a bare name inside the media directory — never a path — or one inside
  // the single allowed subfolder, "P&W Backgrounds/".
  if (!isValidMediaFileName(v.fileName)) return null
  const kind = oneOf(v.kind, ['image', 'video', 'audio'] as const, 'image')
  const nullableNum = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null)
  return {
    id,
    name: str(v.name, v.fileName),
    kind,
    fileName: v.fileName,
    originalName: str(v.originalName, v.fileName),
    mimeType: str(v.mimeType, 'application/octet-stream'),
    sizeBytes: Math.max(0, num(v.sizeBytes, 0)),
    width: nullableNum(v.width),
    height: nullableNum(v.height),
    durationSec: nullableNum(v.durationSec),
    thumbnail: typeof v.thumbnail === 'string' && /^[\w.-]+$/.test(v.thumbnail) ? v.thumbnail : null,
    importedAt: str(v.importedAt, nowIso())
  }
}

/**
 * `legacyMedia` collects media entries, which older versions kept in service-order playlists;
 * the caller moves them into Media-tab playlists.
 */
function normPlaylist(id: Id, v: unknown, project: Pick<Project, 'presentations' | 'media'>, legacyMedia: Id[], repairs: string[]): Playlist | null {
  if (!isObj(v)) return null
  const name = str(v.name, 'Playlist')
  const entries: PlaylistEntry[] = []
  for (const e of Array.isArray(v.entries) ? v.entries : []) {
    if (!isObj(e) || typeof e.id !== 'string') continue
    if (e.kind === 'presentation' && typeof e.presentationId === 'string') {
      if (project.presentations[e.presentationId]) entries.push({ id: e.id, kind: 'presentation', presentationId: e.presentationId })
      else repairs.push(`Removed a missing presentation from playlist "${name}".`)
    } else if (e.kind === 'media' && typeof e.mediaId === 'string') {
      if (project.media[e.mediaId]) legacyMedia.push(e.mediaId)
    } else if (e.kind === 'header') {
      entries.push({ id: e.id, kind: 'header', title: str(e.title, 'Header'), color: str(e.color, '#64748b') })
    }
  }
  const now = nowIso()
  return { id, name, entries, createdAt: str(v.createdAt, now), updatedAt: str(v.updatedAt, now) }
}

function normMediaPlaylist(id: Id, v: unknown, media: Record<Id, MediaAsset>): MediaPlaylist | null {
  if (!isObj(v)) return null
  const kind = oneOf(v.kind, MEDIA_PLAYLIST_KINDS, 'image')
  const ids = Array.isArray(v.mediaIds) ? v.mediaIds : []
  const now = nowIso()
  return {
    id,
    name: str(v.name, 'Playlist'),
    kind,
    // Only existing media the playlist accepts, each once.
    mediaIds: [...new Set(ids.filter((m): m is string => typeof m === 'string' && mediaPlaylistAccepts(kind, media[m]?.kind)))],
    ...(v.role === 'pw-backgrounds' ? { role: 'pw-backgrounds' as const } : {}),
    createdAt: str(v.createdAt, now),
    updatedAt: str(v.updatedAt, now)
  }
}

/** Puts media from an old service-order playlist into Media-tab playlists named after it, one per kind. */
function moveLegacyMedia(name: string, mediaIds: Id[], media: Record<Id, MediaAsset>, playlists: Record<Id, MediaPlaylist>, order: Id[]): void {
  const kinds = MEDIA_KINDS.filter((k) => mediaIds.some((id) => media[id]?.kind === k))
  for (const kind of kinds) {
    const ids = [...new Set(mediaIds.filter((id) => media[id]?.kind === kind))]
    const label = kinds.length > 1 ? `${name} (${KIND_LABELS[kind]})` : name
    const m = createMediaPlaylist(label, kind, ids)
    playlists[m.id] = m
    order.push(m.id)
  }
}

/** Schema 3 added a Backgrounds media playlist; older projects get one right after Images. */
function addBackgroundsPlaylist(mediaPlaylists: Record<Id, MediaPlaylist>, mediaOrder: Id[]): void {
  if (mediaOrder.some((id) => mediaPlaylists[id]?.kind === 'background')) return
  const bg = createMediaPlaylist('Backgrounds', 'background')
  mediaPlaylists[bg.id] = bg
  const images = mediaOrder.findIndex((id) => mediaPlaylists[id]?.kind === 'image')
  mediaOrder.splice(images + 1, 0, bg.id)
}

/** The stored shape of a profile before repair. */
interface RawProfile {
  id: Id
  name: string
  trees: Obj
  mediaIds: unknown
  mediaPlaylistOrder: unknown
  createdAt: string
  updatedAt: string
}

/**
 * Profiles as stored. Projects before schema 4 had a single workspace: it becomes a "General"
 * profile holding everything, followed by empty church-event profiles.
 */
function rawProfiles(raw: Obj, version: number, now: string): { list: RawProfile[]; legacy: boolean } {
  if (version >= 4 && isObj(raw.profiles)) {
    const stored = raw.profiles
    const list: RawProfile[] = []
    for (const id of repairOrder(raw.profileOrder, Object.keys(stored))) {
      const v = stored[id]
      if (!isObj(v)) continue
      list.push({
        id,
        name: str(v.name, 'Profile'),
        trees: isObj(v.trees) ? v.trees : {},
        mediaIds: v.mediaIds,
        mediaPlaylistOrder: v.mediaPlaylistOrder,
        createdAt: str(v.createdAt, now),
        updatedAt: str(v.updatedAt, now)
      })
    }
    if (list.length) return { list, legacy: false }
  }
  return {
    legacy: true,
    list: [
      {
        id: globalThis.crypto.randomUUID(),
        name: 'General',
        trees: isObj(raw.trees) ? raw.trees : {},
        mediaIds: isObj(raw.media) ? Object.keys(raw.media) : [],
        mediaPlaylistOrder: raw.mediaPlaylistOrder,
        createdAt: now,
        updatedAt: now
      }
    ]
  }
}

/** Schema 3 created empty event playlists, which are now profiles; drop the untouched ones. */
function dropAutoEventPlaylists(playlists: Record<Id, Playlist>, roots: Id[]): void {
  const names = new Set<string>(DEFAULT_PROFILE_NAMES)
  for (const id of [...roots]) {
    const pl = playlists[id]
    if (pl && names.has(pl.name) && pl.entries.length === 0) {
      delete playlists[id]
      roots.splice(roots.indexOf(id), 1)
    }
  }
}

function normSettings(v: unknown): ProjectSettings {
  const d = defaultProjectSettings()
  if (!isObj(v)) return d
  const c = isObj(v.canvas) ? v.canvas : {}
  return {
    canvas: {
      width: clamp(Math.round(num(c.width, d.canvas.width)), 320, 7680),
      height: clamp(Math.round(num(c.height, d.canvas.height)), 240, 4320)
    },
    defaultBackground: normBackground(v.defaultBackground) ?? d.defaultBackground,
    defaultTransition: normTransition(v.defaultTransition) ?? d.defaultTransition,
    defaultTextStyle: normTextStyle(v.defaultTextStyle, d.defaultTextStyle),
    logoMediaId: typeof v.logoMediaId === 'string' ? v.logoMediaId : null,
    linesPerSlide: clamp(Math.round(num(v.linesPerSlide, d.linesPerSlide)), 0, 12)
  }
}

/**
 * Rebuilds one scope's trees (one root list per profile) so every item appears exactly once
 * across all profiles, folders contain only valid children and nothing forms a cycle. Items
 * that exist but are unreachable are appended to the first profile's root.
 */
function repairTrees(
  scope: TreeScope,
  rootLists: unknown[],
  folders: Record<Id, Folder>,
  leafIds: Set<Id>,
  repairs: string[]
): Id[][] {
  const seen = new Set<Id>()
  const visit = (ids: unknown, ancestors: Set<Id>): Id[] => {
    const out: Id[] = []
    for (const id of Array.isArray(ids) ? ids : []) {
      if (typeof id !== 'string' || seen.has(id)) continue
      const folder = folders[id]
      if (folder && folder.scope === scope && !ancestors.has(id)) {
        seen.add(id)
        const nextAncestors = new Set(ancestors).add(id)
        folder.childIds = visit(folder.childIds, nextAncestors)
        out.push(id)
      } else if (leafIds.has(id)) {
        seen.add(id)
        out.push(id)
      }
    }
    return out
  }
  const lists = rootLists.map((ids) => visit(ids, new Set()))
  const roots = lists[0] ?? []
  for (const folder of Object.values(folders)) {
    if (folder.scope === scope && !seen.has(folder.id)) {
      seen.add(folder.id)
      folder.childIds = visit(folder.childIds, new Set([folder.id]))
      roots.push(folder.id)
      repairs.push(`Recovered folder "${folder.name}" into the ${scope} root.`)
    }
  }
  for (const id of leafIds) {
    if (!seen.has(id)) {
      roots.push(id)
      repairs.push(`Recovered an unfiled item into the ${scope} root.`)
    }
  }
  return lists
}

export function normalizeProject(raw: unknown): NormalizeResult {
  if (!isObj(raw)) throw new ProjectFormatError('The project file is not a JSON object.')
  if (raw.format !== PROJECT_FORMAT) throw new ProjectFormatError('This file is not a BHCF Presenter project.')
  const version = num(raw.schemaVersion, 0)
  if (version > PROJECT_SCHEMA_VERSION) {
    throw new ProjectFormatError(
      `This project was saved by a newer version of BHCF Presenter (schema ${version}). Please update the application.`
    )
  }
  // Schema 1 → 2 added songs, overlays, timers, video thumbnails and logo/lyrics settings.
  // Every new field has a default below, so migrating is just normalising.
  // Schema 2 → 3 added the Backgrounds media playlist (and briefly, event-named playlists).
  // Schema 3 → 4 added profiles: the old single workspace becomes "General" (see rawProfiles).

  const repairs: string[] = []
  const now = nowIso()

  const media: Record<Id, MediaAsset> = {}
  if (isObj(raw.media)) {
    for (const [id, v] of Object.entries(raw.media)) {
      const m = normMedia(id, v)
      if (m) media[id] = m
      else repairs.push('Dropped an unreadable media entry.')
    }
  }

  const presentations: Record<Id, Presentation> = {}
  if (isObj(raw.presentations)) {
    for (const [id, v] of Object.entries(raw.presentations)) {
      const p = normPresentation(id, v, repairs)
      if (p) presentations[id] = p
      else repairs.push('Dropped an unreadable presentation.')
    }
  }

  const { list: stored, legacy } = rawProfiles(raw, version, now)

  const mediaPlaylists: Record<Id, MediaPlaylist> = {}
  if (isObj(raw.mediaPlaylists)) {
    for (const [id, v] of Object.entries(raw.mediaPlaylists)) {
      const m = normMediaPlaylist(id, v, media)
      if (m) mediaPlaylists[id] = m
    }
  } else if (legacy) {
    // Projects from before Media-tab playlists start with the defaults.
    const defaults = defaultMediaPlaylists()
    for (const m of defaults) mediaPlaylists[m.id] = m
    for (const p of stored) p.mediaPlaylistOrder = defaults.map((m) => m.id)
  }
  // Each media playlist belongs to exactly one profile; strays go to the first.
  const claimed = new Set<Id>()
  const mediaOrders = stored.map((p) => {
    const order = knownIds(p.mediaPlaylistOrder, Object.keys(mediaPlaylists)).filter((id) => !claimed.has(id))
    for (const id of order) claimed.add(id)
    return order
  })
  for (const id of Object.keys(mediaPlaylists)) if (!claimed.has(id)) mediaOrders[0]?.push(id)
  // Legacy media entries of service-order playlists move into the first profile's Media tab.
  const firstMediaOrder = mediaOrders[0] ?? []

  const playlists: Record<Id, Playlist> = {}
  if (isObj(raw.playlists)) {
    for (const [id, v] of Object.entries(raw.playlists)) {
      const legacyMedia: Id[] = []
      const p = normPlaylist(id, v, { presentations, media }, legacyMedia, repairs)
      if (p) playlists[id] = p
      if (legacyMedia.length) {
        moveLegacyMedia(p?.name ?? 'Playlist', legacyMedia, media, mediaPlaylists, firstMediaOrder)
        repairs.push(`Moved ${legacyMedia.length} media item(s) from playlist "${p?.name ?? 'Playlist'}" to the Media tab.`)
      }
    }
  }

  const folders: Record<Id, Folder> = {}
  if (isObj(raw.folders)) {
    for (const [id, v] of Object.entries(raw.folders)) {
      if (!isObj(v)) continue
      const scope = oneOf(v.scope, ['library', 'playlists'] as const, 'library')
      folders[id] = {
        id,
        scope,
        name: str(v.name, 'Folder'),
        childIds: Array.isArray(v.childIds) ? v.childIds.filter((x): x is string => typeof x === 'string') : []
      }
    }
  }

  const overlays: Record<Id, Overlay> = {}
  if (isObj(raw.overlays)) {
    for (const [id, v] of Object.entries(raw.overlays)) {
      const o = normOverlay(id, v, repairs)
      if (o) overlays[id] = o
    }
  }
  const timers: Record<Id, TimerDef> = {}
  if (isObj(raw.timers)) {
    for (const [id, v] of Object.entries(raw.timers)) {
      const t = normTimer(id, v)
      if (t) timers[id] = t
    }
  }

  const libraryRoots = repairTrees('library', stored.map((p) => p.trees.library), folders, new Set(Object.keys(presentations)), repairs)
  const playlistRoots = repairTrees('playlists', stored.map((p) => p.trees.playlists), folders, new Set(Object.keys(playlists)), repairs)

  // Media: each profile lists existing assets once; assets in no profile go to the first.
  const listed = new Set<Id>()
  const mediaLists = stored.map((p) => {
    const ids = [...new Set(Array.isArray(p.mediaIds) ? p.mediaIds.filter((id): id is string => typeof id === 'string' && !!media[id]) : [])]
    for (const id of ids) listed.add(id)
    return ids
  })
  for (const id of Object.keys(media)) if (!listed.has(id)) mediaLists[0]?.push(id)

  if (version < 3) for (const order of mediaOrders) addBackgroundsPlaylist(mediaPlaylists, order)
  if (version === 3 && legacy) dropAutoEventPlaylists(playlists, playlistRoots[0] ?? [])

  const profiles: Record<Id, Profile> = {}
  stored.forEach((p, i) => {
    profiles[p.id] = {
      id: p.id,
      name: p.name,
      trees: { library: libraryRoots[i] ?? [], playlists: playlistRoots[i] ?? [] },
      mediaIds: mediaLists[i] ?? [],
      mediaPlaylistOrder: mediaOrders[i] ?? [],
      createdAt: p.createdAt,
      updatedAt: p.updatedAt
    }
  })
  if (legacy) {
    // Schema 4: empty church-event profiles next to "General".
    for (const name of DEFAULT_PROFILE_NAMES) {
      const c = createProfile(name)
      profiles[c.profile.id] = c.profile
      for (const m of c.mediaPlaylists) mediaPlaylists[m.id] = m
    }
  }
  const profileOrder = Object.keys(profiles)
  const activeProfileId = typeof raw.activeProfileId === 'string' && profiles[raw.activeProfileId] ? raw.activeProfileId : (profileOrder[0] as Id)

  const project: Project = {
    format: PROJECT_FORMAT,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: str(raw.id, globalThis.crypto.randomUUID()),
    name: str(raw.name, 'Untitled Project'),
    createdAt: str(raw.createdAt, now),
    updatedAt: str(raw.updatedAt, now),
    settings: normSettings(raw.settings),
    profiles,
    profileOrder,
    activeProfileId,
    folders,
    presentations,
    playlists,
    media,
    mediaPlaylists,
    overlays,
    overlayOrder: repairOrder(raw.overlayOrder, Object.keys(overlays)),
    timers,
    timerOrder: repairOrder(raw.timerOrder, Object.keys(timers))
  }
  if (project.settings.logoMediaId && !media[project.settings.logoMediaId]) project.settings.logoMediaId = null
  return { project, repairs }
}
