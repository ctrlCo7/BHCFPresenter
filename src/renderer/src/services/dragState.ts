/**
 * The payload of the in-app drag in progress. HTML5 drag-and-drop hides dataTransfer contents
 * during dragover, so drop targets read this to decide whether (and where) a drop is allowed.
 */
import type { Id, TreeScope } from '@shared/model/types'

export type DragPayload =
  | { type: 'node'; scope: TreeScope; id: Id }
  | { type: 'entry'; playlistId: Id; entryId: Id }
  | { type: 'media'; ids: Id[] }
  | { type: 'slides'; presentationId: Id; ids: Id[] }

let current: DragPayload | null = null

export const DRAG_MIME = 'application/x-bhcf'

export function beginDrag(e: React.DragEvent, payload: DragPayload, label?: string): void {
  current = payload
  e.dataTransfer.effectAllowed = 'copyMove'
  e.dataTransfer.setData(DRAG_MIME, payload.type)
  if (label) e.dataTransfer.setData('text/plain', label)
}

export function endDrag(): void {
  current = null
}

export function currentDrag(): DragPayload | null {
  return current
}

/** True when the OS is dragging files into the window. */
export function isFileDrag(e: React.DragEvent): boolean {
  return !current && Array.from(e.dataTransfer.types).includes('Files')
}

export type DropPosition = 'before' | 'after' | 'inside'

/** Splits a row into before / inside / after zones based on the pointer's vertical position. */
export function dropPositionFor(e: React.DragEvent, allowInside: boolean): DropPosition {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const y = (e.clientY - r.top) / r.height
  if (allowInside) return y < 0.28 ? 'before' : y > 0.72 ? 'after' : 'inside'
  return y < 0.5 ? 'before' : 'after'
}
