/**
 * Song section shortcuts: Ctrl+V takes the next Verse live, Ctrl+C the Chorus, Alt+2 Verse 2…
 * They act on the song open in the slide grid (or, failing that, the one on screen) and only
 * in Show and Live mode, where they take priority over copy / paste.
 */
import type { Presentation, Slide } from '@shared/model/types'
import type { Command } from '../services/commands'
import { toast } from '../store/overlayStore'
import { useProjectStore } from '../store/projectStore'
import { ui } from '../store/uiStore'
import { take } from './liveActions'
import { live } from './liveStore'

interface SectionKind {
  id: string
  name: string
  keys: string[]
  match: RegExp
}

/** Default keys follow the section's first letter where Ctrl+letter is free (or shadowed only by copy/paste). */
export const SECTION_KINDS: SectionKind[] = [
  { id: 'verse', name: 'Verse', keys: ['Mod+V'], match: /^verse\b/i },
  { id: 'chorus', name: 'Chorus', keys: ['Mod+C'], match: /^chorus\b/i },
  { id: 'preChorus', name: 'Pre-Chorus', keys: ['Mod+P'], match: /^pre-?\s?chorus\b/i },
  { id: 'postChorus', name: 'Post-Chorus', keys: ['Mod+Shift+C'], match: /^post-?\s?chorus\b/i },
  { id: 'bridge', name: 'Bridge', keys: ['Mod+B'], match: /^bridge\b/i },
  { id: 'refrain', name: 'Refrain', keys: ['Mod+R'], match: /^refrain\b/i },
  { id: 'tag', name: 'Tag', keys: ['Mod+G'], match: /^tag\b/i },
  { id: 'intro', name: 'Intro', keys: ['Mod+Shift+I'], match: /^intro\b/i },
  { id: 'outro', name: 'Outro', keys: ['Mod+Shift+O'], match: /^outro\b/i },
  { id: 'ending', name: 'Ending', keys: ['Mod+E'], match: /^(ending|end)\b/i },
  { id: 'interlude', name: 'Interlude', keys: ['Mod+L'], match: /^(interlude|instrumental)\b/i },
  { id: 'vamp', name: 'Vamp', keys: ['Mod+Shift+V'], match: /^vamp\b/i }
]

/** The song the shortcuts act on: the one open in the slide grid, else the one live. */
function targetPresentation(): Presentation | null {
  const p = useProjectStore.getState().project
  if (!p) return null
  const open = p.presentations[ui.get().activePresentationId ?? '']
  if (open && hasSections(open)) return open
  const onScreen = p.presentations[live.get().cursor?.presentationId ?? '']
  return onScreen && hasSections(onScreen) ? onScreen : null
}

function hasSections(pres: Presentation): boolean {
  return pres.kind === 'song' || pres.groups.length > 0
}

/** Section name of a slide: its group's name, else its label ("Verse 1 (2/3)" → "Verse 1"). */
function sectionName(pres: Presentation, slide: Slide): string {
  const group = slide.groupId ? pres.groups.find((g) => g.id === slide.groupId) : undefined
  return (group?.name ?? slide.label).replace(/\s*\(\d+\/\d+\)\s*$/, '').trim()
}

/** First slide of each run of a section, in order (a repeated chorus appears once per repeat). */
function sectionStarts(pres: Presentation): { index: number; slide: Slide; name: string }[] {
  const out: { index: number; slide: Slide; name: string }[] = []
  let previous = ''
  pres.slides.forEach((slide, index) => {
    const name = sectionName(pres, slide)
    if (slide.enabled && name && name !== previous) out.push({ index, slide, name })
    previous = name
  })
  return out
}

/**
 * Takes the next matching section live, after the slide on screen (wrapping to the first).
 * Pressing it again moves on to the next match: Verse 1 → Verse 2 → …
 */
export function goToSection(kind: SectionKind, number?: number): void {
  const pres = targetPresentation()
  if (!pres) return
  const matches = sectionStarts(pres).filter(({ name }) => {
    if (!kind.match.test(name)) return false
    if (number === undefined) return true
    const n = /(\d+)\s*$/.exec(name)?.[1]
    return n ? Number(n) === number : number === 1
  })
  const label = number === undefined ? kind.name : `${kind.name} ${number}`
  if (matches.length === 0) {
    toast.info(`No ${label} in "${pres.name}"`)
    return
  }
  const cursor = live.get().cursor
  const current = cursor?.presentationId === pres.id ? pres.slides.findIndex((s) => s.id === cursor.slideId) : -1
  const next = number === undefined ? (matches.find((m) => m.index > current) ?? matches[0]) : matches[0]
  if (next) take(pres.id, next.slide.id)
}

/** Commands for the shortcut dispatcher and Settings → Shortcuts. */
export function sectionCommands(): Command[] {
  const enabled = (): boolean => ui.get().mode !== 'edit' && targetPresentation() !== null
  return [
    ...SECTION_KINDS.map(
      (kind): Command => ({
        id: `song.${kind.id}`,
        label: kind.id === 'verse' ? 'Go to Next Verse' : `Go to ${kind.name}`,
        category: 'Song',
        defaultKeys: kind.keys,
        enabled,
        run: () => goToSection(kind)
      })
    ),
    ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(
      (n): Command => ({
        id: `song.verse${n}`,
        label: `Go to Verse ${n}`,
        category: 'Song',
        defaultKeys: [`Alt+${n}`],
        enabled,
        run: () => goToSection(SECTION_KINDS[0] as SectionKind, n)
      })
    )
  ]
}
