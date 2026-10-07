/**
 * Font dropdown: each font is previewed in its own face, grouped as bundled / system /
 * installed on this computer, with search. Typing a name that isn't listed offers it as-is.
 */
import { Check, ChevronDown } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { BUNDLED_FONTS, fontName, installedFontFamilies, stackFor, SYSTEM_FONTS, type FontChoice, type FontGroup } from '../../render/fonts'
import './fields.css'

const LIST_HEIGHT = 340

export function FontPicker({ value, onChange }: { value: string; onChange: (stack: string) => void }): ReactElement {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [installed, setInstalled] = useState<string[]>([])
  const [active, setActive] = useState(0)
  const [pos, setPos] = useState({ left: 0, top: 0, width: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) void installedFontFamilies().then(setInstalled)
  }, [open])

  const groups = useMemo((): FontGroup[] => {
    const q = query.trim().toLowerCase()
    const match = (f: FontChoice): boolean => !q || f.name.toLowerCase().includes(q)
    const listed = new Set([...BUNDLED_FONTS, ...SYSTEM_FONTS].map((f) => f.name.toLowerCase()))
    const out: FontGroup[] = [
      { label: 'Included with the app', fonts: BUNDLED_FONTS.filter(match) },
      { label: 'Common fonts', fonts: SYSTEM_FONTS.filter(match) },
      {
        label: 'Installed on this computer',
        fonts: installed.filter((f) => !listed.has(f.toLowerCase())).map((f) => ({ name: f, stack: stackFor(f) })).filter(match)
      }
    ]
    const typed = query.trim()
    if (typed && !out.some((g) => g.fonts.some((f) => f.name.toLowerCase() === typed.toLowerCase()))) {
      out.push({ label: 'Use typed name', fonts: [{ name: typed, stack: stackFor(typed) }] })
    }
    return out.filter((g) => g.fonts.length > 0)
  }, [query, installed])

  const flat = useMemo(() => groups.flatMap((g) => g.fonts), [groups])
  const currentName = fontName(value)

  const openPicker = (): void => {
    const r = buttonRef.current?.getBoundingClientRect()
    if (!r) return
    const width = Math.max(r.width, 240)
    const left = Math.min(r.left, window.innerWidth - width - 8)
    const below = window.innerHeight - r.bottom
    const top = below >= LIST_HEIGHT + 50 ? r.bottom + 2 : Math.max(8, r.top - LIST_HEIGHT - 50)
    setPos({ left, top, width })
    setQuery('')
    setOpen(true)
  }

  // Start on the current font (again once installed fonts arrive, which shifts nothing above it).
  useLayoutEffect(() => {
    if (!open || query) return
    const i = flat.findIndex((f) => f.stack === value || f.name === currentName)
    setActive(Math.max(0, i))
  }, [open, flat, query, value, currentName])

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      const t = e.target as Node
      if (!popRef.current?.contains(t) && !buttonRef.current?.contains(t)) setOpen(false)
    }
    const close = (): void => setOpen(false)
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('resize', close)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('blur', close)
    }
  }, [open])

  const choose = (f: FontChoice | undefined): void => {
    if (!f) return
    setOpen(false)
    if (f.stack !== value) onChange(f.stack)
    buttonRef.current?.focus()
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    e.stopPropagation()
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(flat.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(flat[active])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      buttonRef.current?.focus()
    }
  }

  let index = 0
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="input font-picker"
        style={{ fontFamily: value }}
        title={value}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openPicker())}
      >
        <span className="font-picker-name">{currentName}</span>
        <ChevronDown size={13} className="font-picker-chevron" />
      </button>
      {open && (
        <div ref={popRef} className="font-pop" style={{ left: pos.left, top: pos.top, width: pos.width }} onKeyDown={onKeyDown}>
          <input
            className="input font-pop-search"
            placeholder="Search fonts…"
            value={query}
            autoFocus
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
          />
          <div ref={listRef} className="font-pop-list" role="listbox" style={{ maxHeight: LIST_HEIGHT }}>
            {groups.map((g) => (
              <div key={g.label}>
                <div className="font-pop-group">{g.label}</div>
                {g.fonts.map((f) => {
                  const i = index++
                  const selected = f.stack === value
                  return (
                    <div
                      key={`${g.label}:${f.name}`}
                      data-index={i}
                      role="option"
                      aria-selected={selected}
                      className={`font-pop-item${i === active ? ' active' : ''}`}
                      style={{ fontFamily: f.stack }}
                      onMouseEnter={() => setActive(i)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => choose(f)}
                    >
                      <span className="font-pop-check">{selected && <Check size={12} />}</span>
                      {f.name}
                    </div>
                  )
                })}
              </div>
            ))}
            {flat.length === 0 && <div className="font-pop-empty">No fonts match</div>}
          </div>
        </div>
      )}
    </>
  )
}
