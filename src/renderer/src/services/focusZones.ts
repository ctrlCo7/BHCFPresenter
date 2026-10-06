/**
 * Focus zones route generic edit commands (Delete, Duplicate, Rename, Select All, Copy, Paste)
 * to whichever panel the user last interacted with, so one shortcut does the right thing in
 * the library tree, the slide grid or the media bin.
 */
import { useEffect, useRef } from 'react'
import { create } from 'zustand'

export type FocusZone = 'library' | 'playlists' | 'slides' | 'media' | 'editor'

export interface ZoneHandlers {
  delete?: () => void
  duplicate?: () => void
  rename?: () => void
  selectAll?: () => void
  copy?: () => void
  paste?: () => void
}

export const useFocusZone = create<{ zone: FocusZone | null }>(() => ({ zone: null }))

const handlers = new Map<FocusZone, ZoneHandlers>()

export function setFocusZone(zone: FocusZone): void {
  if (useFocusZone.getState().zone !== zone) useFocusZone.setState({ zone })
}

export function zoneAction(action: keyof ZoneHandlers): (() => void) | null {
  const zone = useFocusZone.getState().zone
  return (zone && handlers.get(zone)?.[action]) || null
}

/** Registers handlers for a zone while the component is mounted (latest closures are used). */
export function useZoneHandlers(zone: FocusZone, h: ZoneHandlers): void {
  const ref = useRef(h)
  ref.current = h
  useEffect(() => {
    const proxy: ZoneHandlers = {}
    for (const key of ['delete', 'duplicate', 'rename', 'selectAll', 'copy', 'paste'] as const) {
      proxy[key] = () => ref.current[key]?.()
    }
    handlers.set(zone, proxy)
    return () => {
      if (handlers.get(zone) === proxy) handlers.delete(zone)
    }
  }, [zone])
}
