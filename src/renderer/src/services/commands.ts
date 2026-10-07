/**
 * Command registry.
 *
 * Every user action that can be triggered from a menu, a keyboard shortcut or (later) the
 * remote-control API is a named command. Menus, the shortcut dispatcher and the shortcuts
 * settings page all read from here, so an action is defined exactly once.
 */
export type CommandCategory = 'File' | 'Edit' | 'View' | 'Library' | 'Slides' | 'Media' | 'Live' | 'Song' | 'Help'

export interface Command {
  id: string
  label: string
  category: CommandCategory
  /** Default key combos, e.g. "Mod+S", "Space", "Shift+ArrowRight" */
  defaultKeys?: string[]
  /** Fire even while focus is in a text field (for Mod+ combos like save) */
  allowInInput?: boolean
  enabled?: () => boolean
  run: () => void | Promise<void>
}

const registry = new Map<string, Command>()
const OVERRIDES_KEY = 'bhcf-shortcut-overrides'
let overrides: Record<string, string[]> = loadOverrides()

function loadOverrides(): Record<string, string[]> {
  try {
    const raw = JSON.parse(localStorage.getItem(OVERRIDES_KEY) ?? '{}') as unknown
    if (raw && typeof raw === 'object') return raw as Record<string, string[]>
  } catch {
    /* ignore corrupt overrides */
  }
  return {}
}

export function registerCommands(commands: Command[]): void {
  for (const c of commands) registry.set(c.id, c)
}

export function getCommand(id: string): Command | undefined {
  return registry.get(id)
}

export function allCommands(): Command[] {
  return [...registry.values()]
}

export function isEnabled(id: string): boolean {
  const c = registry.get(id)
  return !!c && (c.enabled?.() ?? true)
}

export function runCommand(id: string): void {
  const c = registry.get(id)
  if (!c || !(c.enabled?.() ?? true)) return
  try {
    const r = c.run()
    if (r instanceof Promise) r.catch((err: unknown) => console.error(`Command ${id} failed`, err))
  } catch (err) {
    console.error(`Command ${id} failed`, err)
  }
}

export function keysFor(id: string): string[] {
  return overrides[id] ?? registry.get(id)?.defaultKeys ?? []
}

/** Persists custom key bindings for a command (empty array = unbound, undefined = default). */
export function setKeysFor(id: string, keys: string[] | undefined): void {
  const next = { ...overrides }
  if (keys === undefined) delete next[id]
  else next[id] = keys
  overrides = next
  try {
    localStorage.setItem(OVERRIDES_KEY, JSON.stringify(next))
  } catch {
    /* storage full or unavailable: binding still applies for this session */
  }
}

/* ------------------------- Key normalisation ------------------------- */

export const isMac = navigator.userAgent.includes('Mac')

/** Converts a keyboard event to a combo string like "Mod+Shift+S", or null for bare modifiers. */
export function eventToCombo(e: KeyboardEvent): string | null {
  if (['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'CapsLock'].includes(e.key)) return null
  let key: string
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3)
  else if (/^Digit\d$/.test(e.code)) key = e.code.slice(5)
  else if (e.code === 'Space') key = 'Space'
  else if (e.code === 'Equal' || e.code === 'NumpadAdd') key = '='
  else if (e.code === 'Minus' || e.code === 'NumpadSubtract') key = '-'
  else key = e.key.length === 1 ? e.key.toUpperCase() : e.key
  const mods: string[] = []
  if (isMac ? e.metaKey : e.ctrlKey) mods.push('Mod')
  if (isMac && e.ctrlKey) mods.push('Ctrl')
  if (e.altKey) mods.push('Alt')
  if (e.shiftKey) mods.push('Shift')
  return [...mods, key].join('+')
}

const DISPLAY_NAMES: Record<string, string> = {
  Mod: isMac ? '⌘' : 'Ctrl',
  Alt: isMac ? '⌥' : 'Alt',
  Shift: isMac ? '⇧' : 'Shift',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Escape: 'Esc',
  Delete: 'Del'
}

export function formatCombo(combo: string): string {
  return combo
    .split('+')
    .map((part) => DISPLAY_NAMES[part] ?? part)
    .join(isMac ? '' : '+')
}

export function shortcutLabel(id: string): string | undefined {
  const k = keysFor(id)[0]
  return k ? formatCombo(k) : undefined
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true
  if (target instanceof HTMLInputElement) {
    return !['checkbox', 'radio', 'button', 'range', 'color'].includes(target.type)
  }
  return false
}

/** Global keydown dispatcher. Returns an uninstall function. */
export function installShortcutDispatcher(isBlocked: () => boolean): () => void {
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.defaultPrevented || e.isComposing || isBlocked()) return
    const combo = eventToCombo(e)
    if (!combo) return
    const editable = isEditableTarget(e.target)
    for (const c of registry.values()) {
      if (!keysFor(c.id).includes(combo)) continue
      if (editable && !c.allowInInput) continue
      if (!(c.enabled?.() ?? true)) continue
      e.preventDefault()
      runCommand(c.id)
      return
    }
  }
  window.addEventListener('keydown', onKeyDown)
  return () => window.removeEventListener('keydown', onKeyDown)
}
