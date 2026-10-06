import { X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { closeDialog, useDialogStore, type ConfirmOptions, type PromptOptions } from '../../store/overlayStore'
import './ui.css'

function Modal({ title, width, onCancel, children }: { title: string; width?: number; onCancel: () => void; children: ReactNode }): ReactElement {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ width }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            onCancel()
          }
        }}
      >
        <div className="modal-header">
          <span>{title}</span>
          <button className="icon-btn" onClick={onCancel} aria-label="Close">
            <X size={15} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function PromptDialog({ options, onClose }: { options: PromptOptions; onClose: (v: string | null) => void }): ReactElement {
  const [value, setValue] = useState(options.defaultValue ?? '')
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.focus()
    if (!options.multiline) el.select()
  }, [options.multiline])

  const submit = (): void => {
    const err = options.validate?.(value) ?? null
    if (err) {
      setError(err)
      return
    }
    onClose(value)
  }

  return (
    <Modal title={options.title} width={options.multiline ? 560 : 400} onCancel={() => onClose(null)}>
      <form
        className="modal-body"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        {options.label && <label className="field-label">{options.label}</label>}
        {options.multiline ? (
          <textarea
            ref={inputRef}
            className="input"
            rows={12}
            value={value}
            placeholder={options.placeholder}
            onChange={(e) => {
              setValue(e.target.value)
              setError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault()
                submit()
              }
            }}
          />
        ) : (
          <input
            ref={inputRef}
            className="input"
            value={value}
            placeholder={options.placeholder}
            onChange={(e) => {
              setValue(e.target.value)
              setError(null)
            }}
          />
        )}
        {error && <div className="field-error">{error}</div>}
        <div className="modal-footer">
          {options.multiline && <span className="muted modal-hint">Ctrl+Enter to confirm</span>}
          <button type="button" className="btn" onClick={() => onClose(null)}>
            Cancel
          </button>
          <button type="submit" className="btn primary">
            {options.confirmLabel ?? 'OK'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function ConfirmDialog({ options, onClose }: { options: ConfirmOptions; onClose: (v: boolean) => void }): ReactElement {
  const confirmRef = useRef<HTMLButtonElement>(null)
  useEffect(() => confirmRef.current?.focus(), [])
  return (
    <Modal title={options.title} width={420} onCancel={() => onClose(false)}>
      <div className="modal-body">
        <div className="modal-message">{options.message}</div>
        <div className="modal-footer">
          <button className="btn" onClick={() => onClose(false)}>
            Cancel
          </button>
          <button ref={confirmRef} className={`btn ${options.danger ? 'danger' : 'primary'}`} onClick={() => onClose(true)}>
            {options.confirmLabel ?? 'OK'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

export function DialogHost(): ReactElement {
  const stack = useDialogStore((s) => s.stack)
  return (
    <>
      {stack.map((d) => {
        switch (d.type) {
          case 'prompt':
            return (
              <PromptDialog
                key={d.id}
                options={d.options}
                onClose={(v) => {
                  closeDialog(d.id)
                  d.resolve(v)
                }}
              />
            )
          case 'confirm':
            return (
              <ConfirmDialog
                key={d.id}
                options={d.options}
                onClose={(v) => {
                  closeDialog(d.id)
                  d.resolve(v)
                }}
              />
            )
          case 'custom': {
            const close = (v: unknown): void => {
              closeDialog(d.id)
              d.resolve(v)
            }
            return (
              <Modal key={d.id} title={d.options.title} width={d.options.width} onCancel={() => close(null)}>
                {d.options.render(close)}
              </Modal>
            )
          }
        }
      })}
    </>
  )
}
