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

export type BottomTab = 'media' | 'bible' | 'overlays' | 'timers'

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
  /** Fraction of the sidebar height used by the playlists section */
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
  selectedMediaIds: Id[]
  layout: Layout
  editTarget: EditTarget | null
  selectedElementIds: Id[]
  bottomTab: BottomTab
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
      selectedMediaIds: [],
      layout: defaultLayout,
      editTarget: null,
      selectedElementIds: [],
      bottomTab: 'media',
      bibleId: null
    }),
    {
      name: 'bhcf-ui',
      version: 1,
      partialize: (s) => ({ layout: s.layout, thumbWidth: s.thumbWidth, bottomTab: s.bottomTab, bibleId: s.bibleId }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<UiState>
        return {
          ...current,
          thumbWidth: typeof p.thumbWidth === 'number' ? p.thumbWidth : current.thumbWidth,
          bottomTab: p.bottomTab === 'bible' || p.bottomTab === 'overlays' || p.bottomTab === 'timers' ? p.bottomTab : 'media',
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
