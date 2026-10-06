import type { Id, Project, TreeScope } from '@shared/model/types'
import { folderPath } from './tree'

export interface SearchHit {
  id: Id
  scope: TreeScope
  kind: 'folder' | 'presentation' | 'playlist'
  name: string
  path: string[]
  /** Matching slide text for content hits */
  snippet: string | null
  /** Index of the slide that matched, when the hit came from slide text */
  slideIndex: number | null
  score: number
}

/** Case- and accent-insensitive normalisation. */
export function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

function snippetAround(text: string, foldedText: string, foldedQuery: string): string {
  const flat = text.replace(/\s+/g, ' ')
  const flatFolded = foldedText.replace(/\s+/g, ' ')
  const at = flatFolded.indexOf(foldedQuery)
  const start = Math.max(0, at - 30)
  const end = Math.min(flat.length, at + foldedQuery.length + 50)
  return (start > 0 ? '…' : '') + flat.slice(start, end) + (end < flat.length ? '…' : '')
}

/**
 * Searches names (folders, presentations, playlists) and slide text. Every whitespace-separated
 * term must match. Name matches rank above content matches; prefix matches rank highest.
 */
export function searchProject(project: Project, query: string, limit = 200): SearchHit[] {
  const terms = fold(query).split(/\s+/).filter(Boolean)
  if (terms.length === 0) return []
  const hits: SearchHit[] = []
  const nameScore = (name: string): number => {
    const f = fold(name)
    if (!terms.every((t) => f.includes(t))) return 0
    return f.startsWith(terms[0] as string) ? 100 : 60
  }

  for (const folder of Object.values(project.folders)) {
    const score = nameScore(folder.name)
    if (score) hits.push({ id: folder.id, scope: folder.scope, kind: 'folder', name: folder.name, path: folderPath(project, folder.scope, folder.id), snippet: null, slideIndex: null, score: score - 5 })
  }
  for (const pl of Object.values(project.playlists)) {
    const score = nameScore(pl.name)
    if (score) hits.push({ id: pl.id, scope: 'playlists', kind: 'playlist', name: pl.name, path: folderPath(project, 'playlists', pl.id), snippet: null, slideIndex: null, score })
  }
  for (const pres of Object.values(project.presentations)) {
    const score = nameScore(pres.name)
    const path = folderPath(project, 'library', pres.id)
    if (score) {
      hits.push({ id: pres.id, scope: 'library', kind: 'presentation', name: pres.name, path, snippet: null, slideIndex: null, score })
      continue
    }
    // Content search: first slide whose text contains every term.
    for (let i = 0; i < pres.slides.length; i++) {
      const text = (pres.slides[i]?.elements ?? []).map((e) => (e.type === 'text' ? e.text : '')).join('\n')
      const folded = fold(text)
      if (terms.every((t) => folded.includes(t))) {
        hits.push({ id: pres.id, scope: 'library', kind: 'presentation', name: pres.name, path, snippet: snippetAround(text, folded, terms[0] as string), slideIndex: i, score: 30 })
        break
      }
    }
  }
  return hits.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, limit)
}
