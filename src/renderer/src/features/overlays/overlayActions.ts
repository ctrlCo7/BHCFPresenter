import { createOverlay, createTimer, newId, type OverlayTemplate } from '@shared/model/factory'
import type { Id, Project, TimerDef } from '@shared/model/types'
import { toggleOverlay } from '../../live/liveActions'
import { live } from '../../live/liveStore'
import { dialogs, toast } from '../../store/overlayStore'
import { applyChange, requireProject } from '../../store/projectStore'
import { ui } from '../../store/uiStore'
import { openOverlayEditor } from '../editor/editorActions'

export function newOverlay(template: OverlayTemplate, timerName?: string): Id | null {
  const p = requireProject()
  let logo
  if (template === 'logo') {
    logo = (p.settings.logoMediaId ? p.media[p.settings.logoMediaId] : undefined) ?? Object.values(p.media).find((m) => m.kind === 'image')
    if (!logo) {
      toast.info('Import an image first', 'The logo overlay uses your logo image (Settings → Project) or the first image in the media bin.')
      return null
    }
  }
  const overlay = createOverlay(p.settings.canvas, template, logo, timerName)
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

export function newTimer(kind: TimerDef['kind'] = 'countdown'): Id {
  const p = requireProject()
  const base = kind === 'clock' ? 'Clock' : kind === 'countup' ? 'Stopwatch' : 'Countdown'
  let name = base
  for (let i = 2; Object.values(p.timers).some((t) => t.name.toLowerCase() === name.toLowerCase()); i++) name = `${base} ${i}`
  const t = createTimer(name, kind)
  applyChange('New timer', (d) => {
    d.timers[t.id] = t
    d.timerOrder.push(t.id)
  })
  return t.id
}

export function updateTimer(id: Id, patch: Partial<Omit<TimerDef, 'id'>>): void {
  applyChange('Edit timer', (d) => {
    const t = d.timers[id]
    if (!t) return
    const oldName = t.name
    Object.assign(t, patch)
    if (patch.name === undefined || patch.name === oldName) return
    // Keep text showing this timer pointing at it.
    const token = new RegExp(`\\{timer:${oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}`, 'gi')
    const slides = [...Object.values(d.overlays).map((o) => o.slide), ...Object.values(d.presentations).flatMap((p) => p.slides)]
    for (const s of slides) for (const e of s.elements) if (e.type === 'text') e.text = e.text.replace(token, `{timer:${t.name}}`)
    for (const o of Object.values(d.overlays)) if (o.name === `${oldName} Overlay`) o.name = `${t.name} Overlay`
  })
}

export async function deleteTimer(id: Id): Promise<void> {
  const t = requireProject().timers[id]
  if (!t) return
  if (!(await dialogs.confirm({ title: 'Delete timer', message: `Delete "${t.name}"? Text using {timer:${t.name}} will stop updating.`, confirmLabel: 'Delete', danger: true }))) return
  applyChange('Delete timer', (d) => {
    delete d.timers[id]
    d.timerOrder = d.timerOrder.filter((x) => x !== id)
  })
}

/** The overlays showing a timer, its full-screen timer screen first. */
export function timerOverlays(p: Project, timerName: string): Id[] {
  const token = `{timer:${timerName}}`.toLowerCase()
  const ids = p.overlayOrder.filter((oid) => p.overlays[oid]?.slide.elements.some((e) => e.type === 'text' && e.text.toLowerCase().includes(token)))
  return [...ids.filter((oid) => p.overlays[oid]?.fullScreen), ...ids.filter((oid) => !p.overlays[oid]?.fullScreen)]
}

/** The timer's screen (created on first use). */
function timerScreen(id: Id): Id | null {
  const p = requireProject()
  const t = p.timers[id]
  if (!t) return null
  return timerOverlays(p, t.name)[0] ?? newOverlay('countdown', t.name)
}

/** Shows or hides a timer on the main output. It replaces the slide rather than sitting on top of it. */
export function showTimerOverlay(id: Id): void {
  const p = requireProject()
  const t = p.timers[id]
  if (!t) return
  const on = timerOverlays(p, t.name).filter((oid) => live.get().overlays.includes(oid))
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
