import { BookOpen, FileText, Folder, FolderPlus, Library, ListMusic, ListPlus, Music, Plus, Search, X } from 'lucide-react'
import { useDeferredValue, useMemo, useRef, type ReactElement } from 'react'
import type { Project } from '@shared/model/types'
import { IconButton, PanelHeader } from '../../components/ui/Panel'
import { Splitter } from '../../components/ui/Splitter'
import { searchProject, type SearchHit } from '../../engine/search'
import { useProjectStore } from '../../store/projectStore'
import { ui, useUiStore } from '../../store/uiStore'
import { newFolder, newPlaylist, newPresentation } from './libraryActions'
import { newSong } from '../songs/songActions'
import { TreeSection } from './TreeSection'
import './library.css'

function SearchResults({ query }: { query: string }): ReactElement {
  const project = useProjectStore((s) => s.project) as Project
  const hits = useMemo(() => searchProject(project, query), [project, query])

  const open = (hit: SearchHit): void => {
    ui.set({ treeSelection: { scope: hit.scope, id: hit.id }, entrySelection: null })
    if (hit.kind === 'presentation') {
      ui.openPresentation(hit.id)
      const slide = hit.slideIndex !== null ? project.presentations[hit.id]?.slides[hit.slideIndex] : undefined
      if (slide) ui.selectSlides([slide.id])
    } else {
      ui.toggleExpanded(hit.id, true)
    }
  }

  if (hits.length === 0) return <div className="tree-empty">No matches for “{query}”.</div>
  return (
    <div className="search-results">
      {hits.map((hit) => {
        const pres = hit.kind === 'presentation' ? project.presentations[hit.id] : undefined
        const icon =
          hit.kind === 'folder' ? <Folder size={14} /> : hit.kind === 'playlist' ? <ListMusic size={14} /> : pres?.kind === 'song' ? <Music size={14} /> : pres?.kind === 'scripture' ? <BookOpen size={14} /> : <FileText size={14} />
        return (
          <button key={`${hit.kind}:${hit.id}`} className="search-hit" onClick={() => open(hit)}>
            <span className="tree-icon">{icon}</span>
            <span className="search-hit-text">
              <span className="search-hit-name">{hit.name}</span>
              {hit.snippet ? <span className="search-hit-snippet">{hit.snippet}</span> : hit.path.length > 0 && <span className="search-hit-snippet">{hit.path.join(' / ')}</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export function LibrarySidebar(): ReactElement {
  const search = useUiStore((s) => s.search)
  const deferredSearch = useDeferredValue(search)
  const fraction = useUiStore((s) => s.layout.playlistsFraction)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragStart = useRef(fraction)
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <aside className="sidebar">
      <div className="sidebar-search">
        <Search size={14} className="sidebar-search-icon" />
        <input
          ref={inputRef}
          id="library-search"
          className="input"
          placeholder="Search library and lyrics…"
          value={search}
          onChange={(e) => ui.set({ search: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              ui.set({ search: '' })
              inputRef.current?.blur()
            }
          }}
        />
        {search && <IconButton icon={<X size={13} />} title="Clear search" className="sidebar-search-clear" onClick={() => ui.set({ search: '' })} />}
      </div>

      {deferredSearch.trim() ? (
        <div className="sidebar-section" style={{ flex: 1 }}>
          <PanelHeader title="Search Results" icon={<Search size={13} />} />
          <SearchResults query={deferredSearch.trim()} />
        </div>
      ) : (
        <div className="sidebar-sections" ref={containerRef}>
          <div className="sidebar-section" style={{ flex: `0 0 ${(fraction * 100).toFixed(2)}%` }}>
            <PanelHeader title="Playlists" icon={<ListMusic size={13} />}>
              <IconButton icon={<FolderPlus size={14} />} title="New playlist folder" onClick={() => newFolder('playlists')} />
              <IconButton icon={<ListPlus size={14} />} title="New playlist" onClick={newPlaylist} />
            </PanelHeader>
            <TreeSection scope="playlists" />
          </div>
          <Splitter
            orientation="horizontal"
            onDragStart={() => {
              dragStart.current = fraction
            }}
            onDrag={(dy) => {
              const h = containerRef.current?.clientHeight ?? 1
              ui.setLayout({ playlistsFraction: Math.min(0.85, Math.max(0.12, dragStart.current + dy / h)) })
            }}
          />
          <div className="sidebar-section" style={{ flex: 1 }}>
            <PanelHeader title="Library" icon={<Library size={13} />}>
              <IconButton icon={<FolderPlus size={14} />} title="New library folder" onClick={() => newFolder('library')} />
              <IconButton icon={<Music size={14} />} title="New song" onClick={() => void newSong()} />
              <IconButton icon={<Plus size={14} />} title="New presentation" onClick={newPresentation} />
            </PanelHeader>
            <TreeSection scope="library" />
          </div>
        </div>
      )}
    </aside>
  )
}
