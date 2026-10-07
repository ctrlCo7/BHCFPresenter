import { BookOpen, ListPlus, Radio, Search, Upload } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { formatReference, parseReference, type BibleBook, type BibleInfo, type Verse } from '@shared/bible'
import { scripturePresentation } from '@shared/model/scripture'
import type { Id, Presentation, Project } from '@shared/model/types'
import { IconButton, PanelHeader } from '../../components/ui/Panel'
import { Select, Toggle } from '../../components/ui/fields'
import { addFolder, addPlaylistEntries, addPresentation } from '../../engine/projectOps'
import { take } from '../../live/liveActions'
import { contextMenu, errorMessage, toast } from '../../store/overlayStore'
import { applyChange, useProjectStore } from '../../store/projectStore'
import { ui, useUiStore } from '../../store/uiStore'
import { profilePlaylists, rootList } from '../../engine/tree'
import './bible.css'

const SCRIPTURE_FOLDER = 'Scripture'

/** Adds a scripture presentation to the library's "Scripture" folder (created on first use). */
function addScripture(pres: Presentation, playlistId?: Id): void {
  applyChange('Add scripture', (d) => {
    let folderId = rootList(d, 'library').find((id) => d.folders[id]?.name === SCRIPTURE_FOLDER)
    folderId ??= addFolder(d, 'library', SCRIPTURE_FOLDER).id
    addPresentation(d, pres, folderId)
    if (playlistId) addPlaylistEntries(d, playlistId, [{ kind: 'presentation', presentationId: pres.id }])
  })
}

export function BiblePanel(): ReactElement {
  const project = useProjectStore((s) => s.project) as Project
  const bibleId = useUiStore((s) => s.bibleId)
  const [bibles, setBibles] = useState<BibleInfo[]>([])
  const [books, setBooks] = useState<BibleBook[]>([])
  const [book, setBook] = useState(42) // John
  const [chapter, setChapter] = useState(3)
  const [verses, setVerses] = useState<Verse[]>([])
  const [selected, setSelected] = useState<number[]>([])
  const [anchor, setAnchor] = useState<number | null>(null)
  const [reference, setReference] = useState('')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Verse[] | null>(null)
  const [perSlide, setPerSlide] = useState('1')
  const [numbers, setNumbers] = useState(true)

  const bible = bibles.find((b) => b.id === bibleId) ?? bibles[0]

  useEffect(() => {
    void window.bhcf.bible
      .list()
      .then(setBibles)
      .catch((err: unknown) => toast.error('Bible unavailable', errorMessage(err)))
  }, [])

  useEffect(() => {
    if (!bible) return
    void window.bhcf.bible
      .books(bible.id)
      .then((b) => {
        setBooks(b)
        setBook((cur) => Math.min(cur, b.length - 1))
      })
      .catch((err: unknown) => toast.error('Could not load books', errorMessage(err)))
  }, [bible])

  useEffect(() => {
    if (!bible || books.length === 0) return
    const max = books[book]?.verseCounts.length ?? 1
    const ch = Math.min(Math.max(1, chapter), max)
    void window.bhcf.bible
      .chapter(bible.id, book, ch)
      .then(setVerses)
      .catch(() => setVerses([]))
  }, [bible, books, book, chapter])

  const bookInfo = books[book]
  // Verses some translations omit (empty text) are never put on slides.
  const chosen = useMemo(() => verses.filter((v) => selected.includes(v.verse) && v.text), [verses, selected])

  const goTo = (input: string): void => {
    const ref = parseReference(books, input)
    if (!ref) {
      toast.warning('Reference not recognised', 'Try e.g. "John 3:16", "Ps 23", "1 Cor 13:4-7".')
      return
    }
    setResults(null)
    setBook(ref.book)
    setChapter(ref.chapter)
    if (ref.verseStart !== null) {
      const end = ref.verseEnd ?? ref.verseStart
      setSelected(Array.from({ length: end - ref.verseStart + 1 }, (_, i) => (ref.verseStart as number) + i))
      setAnchor(ref.verseStart)
    } else setSelected([])
  }

  const runSearch = (): void => {
    if (!bible || !query.trim()) return setResults(null)
    void window.bhcf.bible.search(bible.id, query, 300).then(setResults)
  }

  const clickVerse = (e: React.MouseEvent, v: number): void => {
    if (e.shiftKey && anchor !== null) {
      const [a, b] = anchor < v ? [anchor, v] : [v, anchor]
      setSelected(Array.from({ length: b - a + 1 }, (_, i) => a + i))
    } else if (e.ctrlKey || e.metaKey) {
      setSelected((s) => (s.includes(v) ? s.filter((x) => x !== v) : [...s, v].sort((x, y) => x - y)))
      setAnchor(v)
    } else {
      setSelected([v])
      setAnchor(v)
    }
  }

  const build = (list: Verse[] = chosen): Presentation | null => {
    if (!bookInfo || list.length === 0 || !bible) return null
    return scripturePresentation(bookInfo.name, list, project.settings.canvas, {
      versesPerSlide: Number(perSlide),
      showVerseNumbers: numbers,
      translation: bible.abbreviation,
      baseStyle: project.settings.defaultTextStyle
    })
  }

  const goLive = (list: Verse[] = chosen): void => {
    const pres = build(list)
    if (!pres?.slides[0]) return
    addScripture(pres)
    ui.openPresentation(pres.id)
    take(pres.id, pres.slides[0].id, null)
  }

  const addToLibrary = (): void => {
    const pres = build()
    if (!pres) return
    addScripture(pres)
    ui.openPresentation(pres.id)
    toast.success('Added to library', pres.name)
  }

  const addToPlaylistMenu = (e: React.MouseEvent<HTMLElement>): void => {
    const r = e.currentTarget.getBoundingClientRect()
    const playlists = profilePlaylists(project)
    contextMenu.open({
      x: r.left,
      y: r.top - 8 - Math.min(6, Math.max(1, playlists.length)) * 26,
      items: playlists.length
        ? playlists.map((pl) => ({
            label: pl.name,
            onSelect: () => {
              const pres = build()
              if (pres) {
                addScripture(pres, pl.id)
                toast.success(`Added to ${pl.name}`, pres.name)
              }
            }
          }))
        : [{ label: 'No playlists yet', disabled: true, onSelect: () => undefined }]
    })
  }

  const importBible = (): void => {
    void window.bhcf.bible
      .import()
      .then((info) => {
        if (!info) return
        toast.success('Translation installed', info.name)
        void window.bhcf.bible.list().then(setBibles)
        ui.set({ bibleId: info.id })
      })
      .catch((err: unknown) => toast.error('Import failed', errorMessage(err)))
  }

  const selectionLabel = bookInfo && chosen.length ? formatReference(bookInfo.name, chapter, chosen.map((v) => v.verse)) : null

  return (
    <section className="bible-panel">
      <PanelHeader title="Bible" icon={<BookOpen size={13} />}>
        <Select
          value={bible?.id ?? ''}
          options={bibles.map((b) => ({ value: b.id, label: `${b.abbreviation} — ${b.name}` }))}
          onChange={(id) => ui.set({ bibleId: id })}
          width={200}
        />
        <IconButton icon={<Upload size={14} />} title="Import a translation (BHCF Bible JSON)" onClick={importBible} />
      </PanelHeader>
      <div className="bible-bar">
        <input
          className="input bible-ref"
          placeholder="Go to… e.g. John 3:16-18"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') goTo(reference)
          }}
        />
        <div className="bible-search">
          <Search size={13} />
          <input
            className="input"
            placeholder="Search words…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') runSearch()
              if (e.key === 'Escape') {
                setQuery('')
                setResults(null)
              }
            }}
          />
        </div>
        <Select value={String(book)} options={books.map((b) => ({ value: String(b.index), label: b.name }))} onChange={(v) => { setBook(Number(v)); setChapter(1); setSelected([]); setResults(null) }} width={150} />
        <Select
          value={String(chapter)}
          options={(bookInfo?.verseCounts ?? []).map((_, i) => ({ value: String(i + 1), label: `Chapter ${i + 1}` }))}
          onChange={(v) => { setChapter(Number(v)); setSelected([]); setResults(null) }}
          width={120}
        />
      </div>

      <div className="bible-body">
        {results ? (
          <div className="bible-results">
            <div className="muted bible-results-head">
              {results.length} result{results.length === 1 ? '' : 's'} for “{query}”{results.length >= 300 ? ' (first 300)' : ''} ·{' '}
              <button className="link" onClick={() => setResults(null)}>
                back to chapter
              </button>
            </div>
            {results.map((v) => (
              <button
                key={`${v.book}:${v.chapter}:${v.verse}`}
                className="bible-result"
                onClick={() => {
                  setResults(null)
                  setBook(v.book)
                  setChapter(v.chapter)
                  setSelected([v.verse])
                  setAnchor(v.verse)
                }}
              >
                <b>{formatReference(books[v.book]?.name ?? '', v.chapter, [v.verse])}</b> {v.text}
              </button>
            ))}
          </div>
        ) : (
          <div className="bible-verses" role="listbox" aria-multiselectable>
            {verses.map((v) => (
              <div
                key={v.verse}
                role="option"
                aria-selected={selected.includes(v.verse)}
                className={`verse${selected.includes(v.verse) ? ' selected' : ''}`}
                onClick={(e) => clickVerse(e, v.verse)}
                onDoubleClick={() => {
                  setSelected([v.verse])
                  goLive([v])
                }}
              >
                <span className="verse-num">{v.verse}</span>
                <span>{v.text || <i className="muted">Not included in this translation (see footnotes of other versions)</i>}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bible-footer">
        <span className="bible-selection">{selectionLabel ? `${selectionLabel} · ${chosen.length} verse${chosen.length === 1 ? '' : 's'}` : 'Click verses (Shift = range, Ctrl = add). Double-click to go live.'}</span>
        <label className="bible-opt">
          Verses / slide
          <Select
            value={perSlide}
            options={[
              { value: '1', label: '1' },
              { value: '2', label: '2' },
              { value: '3', label: '3' },
              { value: '4', label: '4' }
            ]}
            onChange={setPerSlide}
            width={52}
          />
        </label>
        <Toggle checked={numbers} label="Verse numbers" onChange={setNumbers} />
        <button className="btn" disabled={!chosen.length} onClick={addToPlaylistMenu}>
          <ListPlus size={14} /> Playlist
        </button>
        <button className="btn" disabled={!chosen.length} onClick={() => addToLibrary()}>
          Add to Library
        </button>
        <button className="btn primary" disabled={!chosen.length} onClick={() => goLive()}>
          <Radio size={14} /> Go Live
        </button>
      </div>
      {bible?.copyright && <div className="bible-copy muted">{bible.name} · {bible.copyright}</div>}
    </section>
  )
}
