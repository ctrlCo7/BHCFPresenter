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
  /** Newer version found. `downloadUrl`: download it yourself (macOS: unsigned apps cannot self-update) */
  | { state: 'available'; version: string; downloadUrl?: string }
  | { state: 'downloading'; version: string; percent: number }
  /** Downloaded; installs when the app closes (or now, on request) */
  | { state: 'ready'; version: string }
  | { state: 'error'; message: string }

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
