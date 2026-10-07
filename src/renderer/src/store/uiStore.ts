/**
 * Transient UI state: what is selected, open, expanded and how panels are sized.
 * Layout preferences persist in localStorage; selection is per session.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Id, MediaKind, TreeScope } from '@shared/model/types'

export type AppMode = 'show' | 'edit' | 'live'

/** What the slide editor is editing: a presentation slide or an overlay. */
export type EditTarget = { kind: 'slide'; presentationId: Id; slideId: Id } | { kind: 'overlay'; overlayId: Id }

export type BottomTab = 'media' | 'bible'

/** Tab under the Program monitor in Show mode. */
export type RightTab = 'preview' | 'overlays' | 'timers'

export interface TreeSelection {
  scope: TreeScope
  id: Id
}

export interface PlaylistEntrySelection {
  playlistId: Id
  entryId: Id
}

export interface Layout {
  leftWidth: number
  rightWidth: number
  bottomHeight: number
  bottomOpen: boolean
  /** Fraction of the sidebar height used by the top (library) section */
  playlistsFraction: number
}

export interface UiState {
  mode: AppMode
  treeSelection: TreeSelection | null
  entrySelection: PlaylistEntrySelection | null
  /** Presentation shown in the centre slide grid */
  activePresentationId: Id | null
  selectedSlideIds: Id[]
  slideAnchorId: Id | null
  expanded: Record<Id, boolean>
  renamingId: Id | null
  search: string
  thumbWidth: number
  mediaFilter: 'all' | MediaKind
  /** Media-tab playlist shown in the grid (null = all media) */
  mediaPlaylistId: Id | null
  selectedMediaIds: Id[]
  layout: Layout
  editTarget: EditTarget | null
  selectedElementIds: Id[]
  bottomTab: BottomTab
  rightTab: RightTab
  /** Bible panel: chosen translation */
  bibleId: string | null
}

const defaultLayout: Layout = {
  leftWidth: 280,
  rightWidth: 420,
  bottomHeight: 230,
  bottomOpen: true,
  playlistsFraction: 0.45
}

export const useUiStore = create<UiState>()(
  persist(
    (): UiState => ({
      mode: 'show',
      treeSelection: null,
      entrySelection: null,
      activePresentationId: null,
      selectedSlideIds: [],
      slideAnchorId: null,
      expanded: {},
      renamingId: null,
      search: '',
      thumbWidth: 220,
      mediaFilter: 'all',
      mediaPlaylistId: null,
      selectedMediaIds: [],
      layout: defaultLayout,
      editTarget: null,
      selectedElementIds: [],
      bottomTab: 'media',
      rightTab: 'preview',
      bibleId: null
    }),
    {
      name: 'bhcf-ui',
      version: 1,
      partialize: (s) => ({ layout: s.layout, thumbWidth: s.thumbWidth, bottomTab: s.bottomTab, rightTab: s.rightTab, bibleId: s.bibleId }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<UiState>
        return {
          ...current,
          thumbWidth: typeof p.thumbWidth === 'number' ? p.thumbWidth : current.thumbWidth,
          bottomTab: p.bottomTab === 'bible' ? 'bible' : 'media',
          // Overlays and timers used to be bottom tabs; they now sit under the Program monitor.
          rightTab: p.rightTab === 'overlays' || p.rightTab === 'timers' ? p.rightTab : (p.bottomTab as string) === 'overlays' || (p.bottomTab as string) === 'timers' ? (p.bottomTab as RightTab) : 'preview',
          bibleId: typeof p.bibleId === 'string' ? p.bibleId : null,
          layout: { ...defaultLayout, ...(p.layout ?? {}) }
        }
      }
    }
  )
)

export const ui = {
  set: useUiStore.setState,
  get: useUiStore.getState,

  setLayout(patch: Partial<Layout>): void {
    useUiStore.setState((s) => ({ layout: { ...s.layout, ...patch } }))
  },

  toggleExpanded(id: Id, value?: boolean): void {
    useUiStore.setState((s) => ({ expanded: { ...s.expanded, [id]: value ?? !s.expanded[id] } }))
  },

  /** Opens a presentation in the slide grid, optionally scrolled to a slide. */
  openPresentation(id: Id | null, entry: PlaylistEntrySelection | null = null): void {
    const s = useUiStore.getState()
    if (s.activePresentationId === id && s.entrySelection?.entryId === entry?.entryId) return
    useUiStore.setState({ activePresentationId: id, entrySelection: entry, selectedSlideIds: [], slideAnchorId: null })
  },

  selectSlides(ids: Id[], anchor: Id | null = ids[ids.length - 1] ?? null): void {
    useUiStore.setState({ selectedSlideIds: ids, slideAnchorId: anchor })
  },

  /** Resets selection state that refers to the previous project. */
  resetForProject(): void {
    useUiStore.setState({
      treeSelection: null,
      entrySelection: null,
      activePresentationId: null,
      selectedSlideIds: [],
      slideAnchorId: null,
      expanded: {},
      renamingId: null,
      search: '',
      selectedMediaIds: [],
      mediaPlaylistId: null,
      editTarget: null,
      selectedElementIds: [],
      mode: 'show'
    })
  },

  /** Opens the slide editor on a target. */
  edit(target: EditTarget): void {
    useUiStore.setState({ mode: 'edit', editTarget: target, selectedElementIds: [] })
  }
}
