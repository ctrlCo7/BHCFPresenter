/** App updates from GitHub Releases (shared by main and renderer). */

/** Where releases are published (package.json build.publish points at the same repo). */
export const UPDATE_REPO = 'ctrlCo7/BHCFPresenter'
export const RELEASES_URL = `https://github.com/${UPDATE_REPO}/releases`

export type UpdateStatus =
  /** Development build, or a platform without updates */
  | { state: 'unsupported'; reason: string }
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'none'; checkedAt: number }
  /** Newer version found; waits for "Update now". `downloadUrl`: macOS, where unsigned apps cannot self-update */
  | { state: 'available'; version: string; notes?: string; downloadUrl?: string }
  | { state: 'downloading'; version: string; percent: number }
  /** Downloaded; restarting installs it */
  | { state: 'ready'; version: string }
  | { state: 'error'; message: string }

/** One release's notes, for "What's new" after an update. */
export interface ReleaseNote {
  version: string
  notes: string
}

/** Compares "1.2.10" with "v1.2.9" numerically; pre-release suffixes are ignored. */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string): number[] => v.replace(/^v/i, '').split(/[.-]/).slice(0, 3).map((x) => Number.parseInt(x, 10) || 0)
  const pa = parts(a)
  const pb = parts(b)
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d) return Math.sign(d)
  }
  return 0
}

/** Release notes as plain text (GitHub gives HTML to the updater, Markdown to the API). */
export function notesText(notes: unknown): string | undefined {
  let raw = Array.isArray(notes) ? notes.map((n: { note?: string | null }) => n.note ?? '').join('\n') : typeof notes === 'string' ? notes : ''
  // Markdown (macOS reads the release body as written): a single line break inside a bullet or
  // paragraph only wraps the text, so join it. HTML (Windows) has already been joined by GitHub.
  if (!/<[a-z][^>]*>/i.test(raw)) raw = raw.replace(/\r\n?/g, '\n').replace(/([^\n])\n(?![ \t]*(?:\n|[-*]\s|$))[ \t]*/g, '$1 ')
  const text = raw
    .replace(/<\/(p|li|h\d)>|<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/[ \t]+$/gm, '')
    // One bullet per line, without the blank lines HTML leaves between them.
    .replace(/\n\s*\n(?=• )/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return text ? text.slice(0, 4000) : undefined
}

/**
 * "What's new" after an update: the GitHub releases after `since` up to `current`, newest first
 * (only `current` when `since` is unknown, e.g. a fresh install).
 */
export function notesSince(releases: { tag_name?: string; body?: string | null; draft?: boolean }[], current: string, since: string | null): ReleaseNote[] {
  return releases
    .filter((r) => !r.draft && r.tag_name)
    .map((r) => ({ version: (r.tag_name as string).replace(/^v/i, ''), notes: notesText(r.body) ?? '' }))
    .filter((r) => compareVersions(r.version, current) <= 0 && (since ? compareVersions(r.version, since) > 0 : compareVersions(r.version, current) === 0))
    .sort((a, b) => compareVersions(b.version, a.version))
}
