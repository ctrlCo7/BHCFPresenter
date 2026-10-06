/**
 * The open project document, its undo/redo history and its save state.
 *
 * Every change goes through `applyChange`, which runs an Immer recipe against the current
 * project. Because unchanged branches keep their identity, components memoised on a
 * presentation or slide object only re-render when that object actually changed, and history
 * entries are cheap (they share structure with each other).
 */
import { produce } from 'immer'
import { create } from 'zustand'
import type { OpenedProject } from '@shared/ipc'
import type { Project } from '@shared/model/types'

const HISTORY_LIMIT = 200

interface HistoryEntry {
  project: Project
  label: string
}

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export interface ProjectState {
  project: Project | null
  /** Absolute path of the project folder */
  path: string | null
  /** Incremented on every change; autosave compares it with savedRevision */
  revision: number
  savedRevision: number
  saveStatus: SaveStatus
  lastSavedAt: string | null
  saveError: string | null
  past: HistoryEntry[]
  future: HistoryEntry[]
}

const empty: ProjectState = {
  project: null,
  path: null,
  revision: 0,
  savedRevision: 0,
  saveStatus: 'idle',
  lastSavedAt: null,
  saveError: null,
  past: [],
  future: []
}

export const useProjectStore = create<ProjectState>(() => empty)

export function loadProject(opened: OpenedProject): void {
  useProjectStore.setState({
    ...empty,
    project: opened.project,
    path: opened.path,
    // A recovered or repaired project differs from disk; mark it dirty so it is re-saved.
    revision: opened.repairs.length > 0 || opened.recoveredFrom ? 1 : 0,
    saveStatus: 'saved',
    lastSavedAt: opened.project.updatedAt
  })
}

export function unloadProject(): void {
  useProjectStore.setState(empty)
}

export interface ApplyOptions {
  /** false for background updates (e.g. probed media metadata) that should not be undoable */
  history?: boolean
  /**
   * Consecutive changes with the same key within COALESCE_MS merge into one undo step
   * (slider drags, typing in inspector fields).
   */
  coalesce?: string
}

const COALESCE_MS = 1200
let lastCoalesce: { key: string; at: number } | null = null

/**
 * Applies a change to the project. Returns false when nothing changed (no history entry,
 * no save). Errors thrown by the recipe abort the change and propagate.
 */
export function applyChange(label: string, recipe: (draft: Project) => void, options: ApplyOptions = {}): boolean {
  const state = useProjectStore.getState()
  if (!state.project) return false
  const next = produce(state.project, recipe)
  if (next === state.project) return false
  const record = options.history !== false
  const now = Date.now()
  const merge = record && !!options.coalesce && lastCoalesce?.key === options.coalesce && now - lastCoalesce.at < COALESCE_MS && state.past.length > 0
  lastCoalesce = options.coalesce ? { key: options.coalesce, at: now } : null
  useProjectStore.setState({
    project: next,
    revision: state.revision + 1,
    // When merging, the existing last entry already holds the state from before the gesture.
    past: record && !merge ? [...state.past, { project: state.project, label }].slice(-HISTORY_LIMIT) : state.past,
    future: record ? [] : state.future
  })
  return true
}

export function undo(): string | null {
  lastCoalesce = null
  const s = useProjectStore.getState()
  const prev = s.past[s.past.length - 1]
  if (!prev || !s.project) return null
  useProjectStore.setState({
    project: prev.project,
    revision: s.revision + 1,
    past: s.past.slice(0, -1),
    future: [{ project: s.project, label: prev.label }, ...s.future]
  })
  return prev.label
}

export function redo(): string | null {
  const s = useProjectStore.getState()
  const next = s.future[0]
  if (!next || !s.project) return null
  useProjectStore.setState({
    project: next.project,
    revision: s.revision + 1,
    past: [...s.past, { project: s.project, label: next.label }],
    future: s.future.slice(1)
  })
  return next.label
}

/** Non-null project accessor for code paths that only run while a project is open. */
export function requireProject(): Project {
  const p = useProjectStore.getState().project
  if (!p) throw new Error('No project is open.')
  return p
}
