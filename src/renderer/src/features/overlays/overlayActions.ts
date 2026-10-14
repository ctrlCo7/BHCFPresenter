import { createOverlay, createTimer, newId, type OverlayTemplate } from '@shared/model/factory'
import type { Id, Overlay, Project, TimerDef } from '@shared/model/types'
import { toggleOverlay } from '../../live/liveActions'
import { live } from '../../live/liveStore'
import { dialogs, toast } from '../../store/overlayStore'
import { applyChange, requireProject } from '../../store/projectStore'
import { ui } from '../../store/uiStore'
import { openOverlayEditor } from '../editor/editorActions'

/** A timer passed in makes the overlay that timer's screen (linked by id, not just by name). */
export function newOverlay(template: OverlayTemplate, timer?: Pick<TimerDef, 'id' | 'name'>): Id | null {
  const p = requireProject()
  let logo
  if (template === 'logo') {
    logo = (p.settings.logoMediaId ? p.media[p.settings.logoMediaId] : undefined) ?? Object.values(p.media).find((m) => m.kind === 'image')
    if (!logo) {
      toast.info('Import an image first', 'The logo overlay uses your logo image (Settings → Project) or the first image in the media bin.')
      return null
    }
  }
  const overlay = createOverlay(p.settings.canvas, template, logo, timer?.name)
  if (timer && template === 'countdown') overlay.timerId = timer.id
  applyChange('New overlay', (d) => {
    d.overlays[overlay.id] = overlay
    d.overlayOrder.push(overlay.id)
  })
  return overlay.id
}

export async function renameOverlay(id: Id): Promise<void> {
  const o = requireProject().overlays[id]
  if (!o) return
  const name = await dialogs.prompt({ title: 'Rename Overlay', defaultValue: o.name, confirmLabel: 'Rename' })
  if (name?.trim()) applyChange('Rename overlay', (d) => d.overlays[id] && (d.overlays[id].name = name.trim()))
}

export function duplicateOverlay(id: Id): void {
  const o = requireProject().overlays[id]
  if (!o) return
  const copy = structuredClone(o)
  copy.id = newId()
  copy.name = `${o.name} copy`
  copy.slide.id = newId()
  for (const e of copy.slide.elements) e.id = newId()
  applyChange('Duplicate overlay', (d) => {
    d.overlays[copy.id] = copy
    d.overlayOrder.splice(d.overlayOrder.indexOf(id) + 1, 0, copy.id)
  })
}

export async function deleteOverlay(id: Id): Promise<void> {
  const o = requireProject().overlays[id]
  if (!o) return
  if (!(await dialogs.confirm({ title: 'Delete overlay', message: `Delete "${o.name}"?`, confirmLabel: 'Delete', danger: true }))) return
  live.set((s) => ({ overlays: s.overlays.filter((x) => x !== id) }))
  applyChange('Delete overlay', (d) => {
    delete d.overlays[id]
    d.overlayOrder = d.overlayOrder.filter((x) => x !== id)
  })
  const t = ui.get().editTarget
  if (t?.kind === 'overlay' && t.overlayId === id) ui.set({ editTarget: null, mode: 'show' })
}

/* ------------------------------ Timers ------------------------------ */

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const sameName = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase()
const ANY_TIMER_TOKEN = /\{timer:[^}]+\}/gi

/** Another timer already uses this name. Text shows timers by name, so names must be unique. */
export function timerNameTaken(p: Project, name: string, exceptId?: Id): boolean {
  return Object.values(p.timers).some((t) => t.id !== exceptId && sameName(t.name, name))
}

/** A new, unsaved timer with a free name. Nothing is added to the project until `addTimer`. */
export function draftTimer(kind: TimerDef['kind'] = 'countdown'): TimerDef {
  const p = requireProject()
  const base = kind === 'clock' ? 'Clock' : kind === 'countup' ? 'Stopwatch' : 'Countdown'
  let name = base
  for (let i = 2; timerNameTaken(p, name); i++) name = `${base} ${i}`
  return createTimer(name, kind)
}

export function addTimer(t: TimerDef): void {
  applyChange('New timer', (d) => {
    d.timers[t.id] = t
    d.timerOrder.push(t.id)
  })
}

export function updateTimer(id: Id, patch: Partial<Omit<TimerDef, 'id'>>): void {
  applyChange('Edit timer', (d) => {
    const t = d.timers[id]
    if (!t) return
    const oldName = t.name
    Object.assign(t, patch)
    // This timer's own screens always show it, whatever their text said before.
    for (const o of Object.values(d.overlays)) {
      if (o.timerId !== id) continue
      for (const e of o.slide.elements) if (e.type === 'text') e.text = e.text.replace(ANY_TIMER_TOKEN, `{timer:${t.name}}`)
    }
    if (patch.name === undefined || patch.name === oldName) return
    // Keep other text showing this timer pointing at it.
    const token = new RegExp(`\\{timer:${escapeRe(oldName)}\\}`, 'gi')
    const slides = [...Object.values(d.overlays).map((o) => o.slide), ...Object.values(d.presentations).flatMap((p) => p.slides)]
    for (const s of slides) for (const e of s.elements) if (e.type === 'text') e.text = e.text.replace(token, `{timer:${t.name}}`)
    for (const o of Object.values(d.overlays)) if (o.name === `${oldName} Overlay`) o.name = `${t.name} Overlay`
  })
}

export async function deleteTimer(id: Id): Promise<void> {
  const p = requireProject()
  const t = p.timers[id]
  if (!t) return
  if (!(await dialogs.confirm({ title: 'Delete timer', message: `Delete "${t.name}" and its timer screen? Other text using {timer:${t.name}} will stop updating.`, confirmLabel: 'Delete', danger: true })))
    return
  const screens = Object.values(p.overlays)
    .filter((o) => o.timerId === id)
    .map((o) => o.id)
  live.set((s) => ({ overlays: s.overlays.filter((x) => !screens.includes(x)) }))
  applyChange('Delete timer', (d) => {
    delete d.timers[id]
    d.timerOrder = d.timerOrder.filter((x) => x !== id)
    for (const oid of screens) delete d.overlays[oid]
    d.overlayOrder = d.overlayOrder.filter((x) => !screens.includes(x))
  })
  const target = ui.get().editTarget
  if (target?.kind === 'overlay' && screens.includes(target.overlayId)) ui.set({ editTarget: null, mode: 'show' })
}

const showsTimer = (o: Overlay, name: string): boolean => {
  const token = `{timer:${name}}`.toLowerCase()
  return o.slide.elements.some((e) => e.type === 'text' && e.text.toLowerCase().includes(token))
}

/**
 * The overlays showing a timer, its full-screen timer screen first: its own screens (linked by
 * id), plus older or hand-made overlays that show it by name and belong to no other timer.
 */
export function timerOverlays(p: Project, timer: TimerDef): Id[] {
  const ids = p.overlayOrder.filter((oid) => {
    const o = p.overlays[oid]
    return !!o && (o.timerId === timer.id || (!o.timerId && showsTimer(o, timer.name)))
  })
  return [...ids.filter((oid) => p.overlays[oid]?.fullScreen), ...ids.filter((oid) => !p.overlays[oid]?.fullScreen)]
}

/**
 * The timer's screen, created on first use. An existing screen is linked to the timer by id and
 * made to show this timer, so editing or showing a timer never makes a second screen or shows
 * another timer, even after its text was edited in the slide editor.
 */
function timerScreen(id: Id): Id | null {
  const p = requireProject()
  const t = p.timers[id]
  if (!t) return null
  const oid = timerOverlays(p, t).find((x) => p.overlays[x]?.fullScreen)
  if (!oid) return newOverlay('countdown', t)
  const o = p.overlays[oid] as Overlay
  const linked = o.timerId === id && showsTimer(o, t.name)
  if (!linked) {
    const fresh = createOverlay(p.settings.canvas, 'countdown', undefined, t.name).slide.elements[0]
    applyChange('Link timer screen', (d) => {
      const s = d.overlays[oid]
      if (!s) return
      s.timerId = id
      let found = false
      for (const e of s.slide.elements) {
        if (e.type !== 'text' || !/\{timer:[^}]+\}/i.test(e.text)) continue
        e.text = e.text.replace(ANY_TIMER_TOKEN, `{timer:${t.name}}`)
        found = true
      }
      // The timer text was deleted in the editor: put it back.
      if (!found && fresh) s.slide.elements.push(fresh)
    })
  }
  return oid
}

/** Shows or hides a timer on the main output. It replaces the slide rather than sitting on top of it. */
export function showTimerOverlay(id: Id): void {
  const p = requireProject()
  const t = p.timers[id]
  if (!t) return
  const on = timerOverlays(p, t).filter((oid) => live.get().overlays.includes(oid))
  if (on.length) {
    live.set((s) => ({ overlays: s.overlays.filter((x) => !on.includes(x)) }))
    return
  }
  const oid = timerScreen(id)
  if (oid) toggleOverlay(oid)
}

/** Opens the timer's screen in the slide editor (fonts, colours, background, extra text…). */
export function editTimerDesign(id: Id): void {
  const oid = timerScreen(id)
  if (oid) openOverlayEditor(oid)
}
