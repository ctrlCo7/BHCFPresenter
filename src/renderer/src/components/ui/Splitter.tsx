import { useRef, type ReactElement, type PointerEvent as ReactPointerEvent } from 'react'
import './ui.css'

interface SplitterProps {
  /** 'vertical' = a vertical bar that resizes horizontally */
  orientation: 'vertical' | 'horizontal'
  /** Called with the total pointer delta since drag start (px) */
  onDrag: (delta: number) => void
  onDragStart?: () => void
  onDoubleClick?: () => void
  title?: string
}

/** A thin draggable divider between panels, using pointer capture for smooth dragging. */
export function Splitter({ orientation, onDrag, onDragStart, onDoubleClick, title }: SplitterProps): ReactElement {
  const start = useRef<number | null>(null)

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    start.current = orientation === 'vertical' ? e.clientX : e.clientY
    onDragStart?.()
    document.body.classList.add(orientation === 'vertical' ? 'resizing-col' : 'resizing-row')
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (start.current === null) return
    onDrag((orientation === 'vertical' ? e.clientX : e.clientY) - start.current)
  }
  const end = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (start.current === null) return
    start.current = null
    e.currentTarget.releasePointerCapture(e.pointerId)
    document.body.classList.remove('resizing-col', 'resizing-row')
  }

  return (
    <div
      className={`splitter splitter-${orientation}`}
      role="separator"
      aria-orientation={orientation}
      title={title}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={onDoubleClick}
    />
  )
}
