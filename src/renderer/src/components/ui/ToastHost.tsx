import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import type { ReactElement } from 'react'
import { dismissToast, useToastStore, type ToastKind } from '../../store/overlayStore'
import './ui.css'

const ICONS: Record<ToastKind, ReactElement> = {
  info: <Info size={16} />,
  success: <CheckCircle2 size={16} />,
  warning: <AlertTriangle size={16} />,
  error: <XCircle size={16} />
}

export function ToastHost(): ReactElement {
  const toasts = useToastStore((s) => s.toasts)
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
          <span className="toast-icon">{ICONS[t.kind]}</span>
          <div className="toast-text">
            <div className="toast-title">{t.title}</div>
            {t.detail && <div className="toast-detail">{t.detail}</div>}
          </div>
          <button className="icon-btn toast-close" onClick={() => dismissToast(t.id)} aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
