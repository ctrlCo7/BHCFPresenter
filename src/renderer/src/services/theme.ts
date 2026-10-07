/**
 * App colour theme. The preference lives in the machine config (main process), which sets
 * Electron's theme source; the stylesheet then follows prefers-color-scheme.
 */
import { useEffect, useState } from 'react'
import { create } from 'zustand'
import type { ThemePreference } from '@shared/ipc'
import { errorMessage, toast } from '../store/overlayStore'

const query = (): MediaQueryList => window.matchMedia('(prefers-color-scheme: dark)')

const useThemeStore = create<{ preference: ThemePreference }>(() => ({ preference: 'system' }))

/** Loads the saved preference (call once at startup). */
export async function loadTheme(): Promise<void> {
  try {
    useThemeStore.setState({ preference: await window.bhcf.app.getTheme() })
  } catch {
    // Keep the default.
  }
}

export async function setTheme(preference: ThemePreference): Promise<void> {
  const previous = useThemeStore.getState().preference
  useThemeStore.setState({ preference })
  try {
    await window.bhcf.app.setTheme(preference)
  } catch (err) {
    useThemeStore.setState({ preference: previous })
    toast.error('Could not change the theme', errorMessage(err))
  }
}

export function isDark(): boolean {
  return query().matches
}

/** Switches between light and dark (leaving "match system"). */
export function toggleDarkMode(): void {
  void setTheme(isDark() ? 'light' : 'dark')
}

export function useThemePreference(): ThemePreference {
  return useThemeStore((s) => s.preference)
}

/** Whether the dark theme is showing, updated live. */
export function useIsDark(): boolean {
  const [dark, setDark] = useState(isDark)
  useEffect(() => {
    const mq = query()
    const onChange = (): void => setDark(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return dark
}
