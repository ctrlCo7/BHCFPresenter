/**
 * Promise-based dialogs, toast notifications and context menus. Components call
 * `dialogs.prompt(...)` / `toast.error(...)` / `contextMenu.open(...)` from anywhere;
 * hosts mounted once in the shell render them.
 */
import type { ReactNode } from 'react'
import { create } from 'zustand'

/* ------------------------------ Dialogs ------------------------------ */

export interface PromptOptions {
  title: string
  label?: string
  defaultValue?: string
  placeholder?: string
  confirmLabel?: string
  multiline?: boolean
  /** Return an error message to block confirmation */
  validate?: (value: string) => string | null
}

export interface ConfirmOptions {
  title: string
  message: ReactNode
  confirmLabel?: string
  danger?: boolean
}

export interface CustomDialogOptions<T> {
  title: string
  width?: number
  render: (close: (value: T | null) => void) => ReactNode
}

type DialogRequest =
  | { id: number; type: 'prompt'; options: PromptOptions; resolve: (v: string | null) => void }
  | { id: number; type: 'confirm'; options: ConfirmOptions; resolve: (v: boolean) => void }
  | { id: number; type: 'custom'; options: CustomDialogOptions<unknown>; resolve: (v: unknown) => void }

export const useDialogStore = create<{ stack: DialogRequest[] }>(() => ({ stack: [] }))

let nextDialogId = 1
function pushDialog(req: DialogRequest): void {
  useDialogStore.setState((s) => ({ stack: [...s.stack, req] }))
}
export function closeDialog(id: number): void {
  useDialogStore.setState((s) => ({ stack: s.stack.filter((d) => d.id !== id) }))
}

export const dialogs = {
  prompt(options: PromptOptions): Promise<string | null> {
    return new Promise((resolve) => pushDialog({ id: nextDialogId++, type: 'prompt', options, resolve }))
  },
  confirm(options: ConfirmOptions): Promise<boolean> {
    return new Promise((resolve) => pushDialog({ id: nextDialogId++, type: 'confirm', options, resolve }))
  },
  custom<T>(options: CustomDialogOptions<T>): Promise<T | null> {
    return new Promise((resolve) =>
      pushDialog({
        id: nextDialogId++,
        type: 'custom',
        options: options as CustomDialogOptions<unknown>,
        resolve: resolve as (v: unknown) => void
      })
    )
  }
}

/* ------------------------------ Toasts ------------------------------- */

export type ToastKind = 'info' | 'success' | 'warning' | 'error'

export interface Toast {
  id: number
  kind: ToastKind
  title: string
  detail?: string
}

export const useToastStore = create<{ toasts: Toast[] }>(() => ({ toasts: [] }))

let nextToastId = 1
function pushToast(kind: ToastKind, title: string, detail?: string, ttlMs?: number): number {
  const id = nextToastId++
  useToastStore.setState((s) => ({ toasts: [...s.toasts.slice(-4), { id, kind, title, detail }] }))
  const ttl = ttlMs ?? (kind === 'error' ? 9000 : kind === 'warning' ? 7000 : 3500)
  window.setTimeout(() => dismissToast(id), ttl)
  return id
}
export function dismissToast(id: number): void {
  useToastStore.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}

export const toast = {
  info: (title: string, detail?: string) => pushToast('info', title, detail),
  success: (title: string, detail?: string) => pushToast('success', title, detail),
  warning: (title: string, detail?: string) => pushToast('warning', title, detail),
  error: (title: string, detail?: string) => pushToast('error', title, detail)
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/* --------------------------- Context menus --------------------------- */

export type MenuItem =
  | {
      type?: 'item'
      label: string
      icon?: ReactNode
      shortcut?: string
      disabled?: boolean
      danger?: boolean
      checked?: boolean
      onSelect: () => void
    }
  | { type: 'separator' }
  /** `onSelect`, when given, runs on click; hovering still opens the submenu. */
  | { type: 'submenu'; label: string; icon?: ReactNode; items: MenuItem[]; onSelect?: () => void }

export interface MenuRequest {
  x: number
  y: number
  items: MenuItem[]
  /** Minimum width, e.g. to match a menu-bar button */
  minWidth?: number
  onClose?: () => void
}

export const useMenuStore = create<{ menu: MenuRequest | null }>(() => ({ menu: null }))

export const contextMenu = {
  open(req: MenuRequest): void {
    useMenuStore.getState().menu?.onClose?.()
    useMenuStore.setState({ menu: req })
  },
  /** Convenience for onContextMenu handlers. */
  fromEvent(e: { clientX: number; clientY: number; preventDefault(): void; stopPropagation(): void }, items: MenuItem[]): void {
    e.preventDefault()
    e.stopPropagation()
    contextMenu.open({ x: e.clientX, y: e.clientY, items })
  },
  close(): void {
    const current = useMenuStore.getState().menu
    if (!current) return
    useMenuStore.setState({ menu: null })
    current.onClose?.()
  }
}
