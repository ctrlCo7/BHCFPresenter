import { Check, ChevronRight } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type ReactElement } from 'react'
import { contextMenu, useMenuStore, type MenuItem } from '../../store/overlayStore'
import './ui.css'

type Actionable = Exclude<MenuItem, { type: 'separator' }>

function isActionable(item: MenuItem): item is Actionable {
  return item.type !== 'separator' && !(item.type !== 'submenu' && item.disabled)
}

function MenuList({
  items,
  x,
  y,
  minWidth,
  onDone,
  autoFocus,
  onExitLeft
}: {
  items: MenuItem[]
  x: number
  y: number
  minWidth?: number
  onDone: () => void
  autoFocus: boolean
  onExitLeft?: () => void
}): ReactElement {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })
  const [active, setActive] = useState<number>(-1)
  const [openSub, setOpenSub] = useState<number | null>(null)
  const [subFocus, setSubFocus] = useState(false)

  // Keep the menu fully on screen.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const nx = x + r.width > window.innerWidth - 4 ? Math.max(4, window.innerWidth - r.width - 4) : x
    const ny = y + r.height > window.innerHeight - 4 ? Math.max(4, window.innerHeight - r.height - 4) : y
    setPos({ x: nx, y: ny })
  }, [x, y])

  useEffect(() => {
    if (autoFocus) ref.current?.focus()
  }, [autoFocus])

  const activate = (i: number, viaKeyboard: boolean): void => {
    const item = items[i]
    if (!item || !isActionable(item)) return
    if (item.type === 'submenu') {
      if (item.onSelect) {
        onDone()
        item.onSelect()
        return
      }
      setOpenSub(i)
      setSubFocus(viaKeyboard)
      return
    }
    onDone()
    item.onSelect()
  }

  const move = (dir: 1 | -1): void => {
    for (let step = 1; step <= items.length; step++) {
      const i = (active + dir * step + items.length * 2) % items.length
      const it = items[i]
      if (it && isActionable(it)) {
        setActive(i)
        return
      }
    }
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (openSub !== null && subFocus) return
    e.stopPropagation()
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        move(1)
        break
      case 'ArrowUp':
        e.preventDefault()
        move(-1)
        break
      case 'ArrowRight':
        if (items[active]?.type === 'submenu') {
          setOpenSub(active)
          setSubFocus(true)
        }
        break
      case 'ArrowLeft':
        if (onExitLeft) {
          e.preventDefault()
          onExitLeft()
        }
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        activate(active, true)
        break
      case 'Escape':
        e.preventDefault()
        contextMenu.close()
        break
    }
  }

  return (
    <div
      ref={ref}
      className="ctx-menu"
      role="menu"
      tabIndex={-1}
      style={{ left: pos.x, top: pos.y, minWidth }}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) => {
        if (item.type === 'separator') return <div key={i} className="ctx-sep" role="separator" />
        const disabled = item.type !== 'submenu' && item.disabled
        return (
          <div
            key={i}
            role="menuitem"
            aria-disabled={disabled}
            className={`ctx-item${i === active ? ' active' : ''}${disabled ? ' disabled' : ''}${item.type !== 'submenu' && item.danger ? ' danger' : ''}`}
            onMouseEnter={() => {
              setActive(i)
              setOpenSub(item.type === 'submenu' ? i : null)
              setSubFocus(false)
            }}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => activate(i, false)}
          >
            <span className="ctx-icon">{item.type !== 'submenu' && item.checked ? <Check size={14} /> : item.icon}</span>
            <span className="ctx-label">{item.label}</span>
            {item.type === 'submenu' ? (
              <ChevronRight size={14} className="ctx-shortcut" />
            ) : (
              item.shortcut && <span className="ctx-shortcut">{item.shortcut}</span>
            )}
            {item.type === 'submenu' && openSub === i && (
              <SubmenuAnchor
                items={item.items}
                onDone={onDone}
                autoFocus={subFocus}
                onExit={() => {
                  setOpenSub(null)
                  setSubFocus(false)
                  ref.current?.focus()
                }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

function SubmenuAnchor({ items, onDone, autoFocus, onExit }: { items: MenuItem[]; onDone: () => void; autoFocus: boolean; onExit: () => void }): ReactElement {
  const anchor = useRef<HTMLSpanElement>(null)
  const [rect, setRect] = useState<DOMRect | null>(null)
  useLayoutEffect(() => {
    setRect(anchor.current?.parentElement?.getBoundingClientRect() ?? null)
  }, [])
  return (
    <span ref={anchor} onClick={(e) => e.stopPropagation()}>
      {rect && <MenuList items={items} x={rect.right - 2} y={rect.top - 5} onDone={onDone} autoFocus={autoFocus} onExitLeft={onExit} />}
    </span>
  )
}

export function ContextMenuHost(): ReactElement | null {
  const menu = useMenuStore((s) => s.menu)

  useEffect(() => {
    if (!menu) return
    const onDown = (e: MouseEvent): void => {
      if (!(e.target as HTMLElement).closest('.ctx-menu')) contextMenu.close()
    }
    const close = (): void => contextMenu.close()
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('blur', close)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('blur', close)
      window.removeEventListener('resize', close)
    }
  }, [menu])

  if (!menu) return null
  return <MenuList key={`${menu.x}:${menu.y}`} items={menu.items} x={menu.x} y={menu.y} minWidth={menu.minWidth} onDone={() => contextMenu.close()} autoFocus />
}
