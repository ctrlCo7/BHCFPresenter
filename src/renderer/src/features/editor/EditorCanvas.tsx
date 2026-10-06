/**
 * Interactive slide canvas. Gestures (move / resize / rotate / marquee) update a local draft
 * so the slide re-renders smoothly without touching the project; the result is committed as a
 * single undoable change on pointer-up.
 */
import { useLayoutEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import type { Background, CanvasSize, Id, MediaAsset, Rect, Slide, SlideElement, TextElement } from '@shared/model/types'
import { boundsOf } from '../../engine/elementOps'
import { SlideContent } from '../../render/SlideRenderer'
import { currentDrag } from '../../services/dragState'
import { setFocusZone } from '../../services/focusZones'
import { ui, useUiStore } from '../../store/uiStore'
import { useProjectStore } from '../../store/projectStore'
import { addMediaElement, editElements, nudgeSelected } from './editorActions'

type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

type DraftMap = Map<Id, { frame?: Rect; rotation?: number }>

type Gesture =
  | { kind: 'move'; startX: number; startY: number; origins: Map<Id, Rect>; moved: boolean; clickedId: Id; plainClick: boolean }
  | { kind: 'resize'; id: Id; handle: Handle; startX: number; startY: number; origin: Rect }
  | { kind: 'rotate'; id: Id; cx: number; cy: number; origin: number; startAngle: number }
  | { kind: 'marquee'; x0: number; y0: number; base: Id[] }

interface Guides {
  x: number[]
  y: number[]
}

const SNAP_PX = 6

function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

function normalizeRect(x0: number, y0: number, x1: number, y1: number): Rect {
  return { x: Math.min(x0, x1), y: Math.min(y0, y1), width: Math.abs(x1 - x0), height: Math.abs(y1 - y0) }
}

export function EditorCanvas({
  slide,
  background,
  canvas,
  media,
  transparent
}: {
  slide: Slide
  background: Background | null
  canvas: CanvasSize
  media: Record<Id, MediaAsset>
  /** Overlay editing: show a checkerboard where nothing is drawn */
  transparent: boolean
}): ReactElement {
  const selectedIds = useUiStore((s) => s.selectedElementIds)
  const selected = useMemo(() => new Set(selectedIds), [selectedIds])
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ width: 800, height: 450 })
  const [draft, setDraft] = useState<DraftMap | null>(null)
  const [guides, setGuides] = useState<Guides>({ x: [], y: [] })
  const [marquee, setMarquee] = useState<Rect | null>(null)
  const [editingId, setEditingId] = useState<Id | null>(null)
  const gesture = useRef<Gesture | null>(null)
  // Mirrors the draft synchronously: pointer-up can arrive before React re-renders the last move.
  const draftRef = useRef<DraftMap | null>(null)
  const updateDraft = (next: DraftMap | null): void => {
    draftRef.current = next
    setDraft(next)
  }

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => e && setBox({ width: e.contentRect.width, height: e.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const scale = Math.max(0.05, Math.min((box.width - 48) / canvas.width, (box.height - 48) / canvas.height))
  const stageW = Math.round(canvas.width * scale)
  const stageH = Math.round(canvas.height * scale)

  const display: Slide = useMemo(() => {
    if (!draft) return slide
    return { ...slide, elements: slide.elements.map((e) => (draft.has(e.id) ? ({ ...e, ...draft.get(e.id) } as SlideElement) : e)) }
  }, [slide, draft])

  const toCanvas = (clientX: number, clientY: number): { x: number; y: number } => {
    const r = stageRef.current?.getBoundingClientRect()
    return r ? { x: (clientX - r.left) / scale, y: (clientY - r.top) / scale } : { x: 0, y: 0 }
  }

  /* ------------------------------ Gestures ------------------------------ */

  const onMove = (e: PointerEvent): void => {
    const g = gesture.current
    if (!g) return
    if (g.kind === 'move') {
      let dx = (e.clientX - g.startX) / scale
      let dy = (e.clientY - g.startY) / scale
      if (!g.moved && Math.hypot(dx, dy) * scale < 3) return
      g.moved = true
      const gx: number[] = []
      const gy: number[] = []
      if (!e.altKey && g.origins.size > 0) {
        // Snap the moving selection's edges/centre to the canvas and to other elements.
        const others = slide.elements.filter((x) => !g.origins.has(x.id) && !x.hidden)
        const xs = [0, canvas.width / 2, canvas.width, ...others.flatMap((o) => [o.frame.x, o.frame.x + o.frame.width / 2, o.frame.x + o.frame.width])]
        const ys = [0, canvas.height / 2, canvas.height, ...others.flatMap((o) => [o.frame.y, o.frame.y + o.frame.height / 2, o.frame.y + o.frame.height])]
        const b = boundsOf([...g.origins.values()])
        const threshold = SNAP_PX / scale
        const snap = (edges: number[], cands: number[]): { d: number; at: number } | null => {
          let best: { d: number; at: number } | null = null
          for (const edge of edges) for (const c of cands) {
            const d = c - edge
            if (Math.abs(d) <= threshold && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, at: c }
          }
          return best
        }
        const sx = snap([b.x + dx, b.x + dx + b.width / 2, b.x + dx + b.width], xs)
        const sy = snap([b.y + dy, b.y + dy + b.height / 2, b.y + dy + b.height], ys)
        if (sx) {
          dx += sx.d
          gx.push(sx.at)
        }
        if (sy) {
          dy += sy.d
          gy.push(sy.at)
        }
      }
      const next: DraftMap = new Map()
      for (const [id, f] of g.origins) next.set(id, { frame: { ...f, x: Math.round(f.x + dx), y: Math.round(f.y + dy) } })
      updateDraft(next)
      setGuides({ x: gx, y: gy })
    } else if (g.kind === 'resize') {
      const dx = (e.clientX - g.startX) / scale
      const dy = (e.clientY - g.startY) / scale
      const o = g.origin
      let { x, y, width: w, height: h } = o
      if (g.handle.includes('e')) w = o.width + dx
      if (g.handle.includes('w')) w = o.width - dx
      if (g.handle.includes('s')) h = o.height + dy
      if (g.handle.includes('n')) h = o.height - dy
      if (e.shiftKey && g.handle.length === 2) {
        const aspect = o.width / o.height
        if (Math.abs(w / o.width) > Math.abs(h / o.height)) h = w / aspect
        else w = h * aspect
      }
      w = Math.max(8, w)
      h = Math.max(8, h)
      if (g.handle.includes('w')) x = o.x + o.width - w
      if (g.handle.includes('n')) y = o.y + o.height - h
      updateDraft(new Map([[g.id, { frame: { x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h) } }]]))
    } else if (g.kind === 'rotate') {
      const angle = (Math.atan2(e.clientY - g.cy, e.clientX - g.cx) * 180) / Math.PI
      let rot = g.origin + (angle - g.startAngle)
      if (e.shiftKey) rot = Math.round(rot / 15) * 15
      rot = ((((rot + 180) % 360) + 360) % 360) - 180
      updateDraft(new Map([[g.id, { rotation: Math.round(rot * 10) / 10 }]]))
    } else {
      const p = toCanvas(e.clientX, e.clientY)
      const rect = normalizeRect(g.x0, g.y0, p.x, p.y)
      setMarquee(rect)
      const hit = slide.elements.filter((x) => !x.hidden && intersects(rect, x.frame)).map((x) => x.id)
      ui.set({ selectedElementIds: [...new Set([...g.base, ...hit])] })
    }
  }

  const onUp = (): void => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    const g = gesture.current
    gesture.current = null
    setGuides({ x: [], y: [] })
    setMarquee(null)
    const d = draftRef.current
    updateDraft(null)
    if (!g) return
    if (g.kind === 'move' && !g.moved) {
      if (g.plainClick) ui.set({ selectedElementIds: [g.clickedId] })
      return
    }
    if (g.kind === 'marquee' || !d || d.size === 0) return
    const label = g.kind === 'move' ? 'Move' : g.kind === 'resize' ? 'Resize' : 'Rotate'
    editElements(
      label,
      (el) => {
        const patch = d.get(el.id)
        if (!patch) return
        if (patch.frame) el.frame = patch.frame
        if (patch.rotation !== undefined) el.rotation = patch.rotation
      },
      undefined,
      [...d.keys()]
    )
  }


  const begin = (g: Gesture): void => {
    gesture.current = g
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const onElementDown = (e: React.PointerEvent, el: SlideElement): void => {
    if (e.button !== 0) return
    e.stopPropagation()
    containerRef.current?.focus({ preventScroll: true })
    setFocusZone('editor')
    if (editingId && editingId !== el.id) setEditingId(null)
    let ids = selectedIds
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      ids = selected.has(el.id) ? selectedIds.filter((x) => x !== el.id) : [...selectedIds, el.id]
      ui.set({ selectedElementIds: ids })
      return
    }
    const wasSelected = selected.has(el.id)
    if (!wasSelected) {
      ids = [el.id]
      ui.set({ selectedElementIds: ids })
    }
    const origins = new Map<Id, Rect>()
    for (const x of slide.elements) if (ids.includes(x.id) && !x.locked) origins.set(x.id, { ...x.frame })
    begin({ kind: 'move', startX: e.clientX, startY: e.clientY, origins, moved: false, clickedId: el.id, plainClick: wasSelected && ids.length > 1 })
  }

  const onHandleDown = (e: React.PointerEvent, el: SlideElement, handle: Handle): void => {
    e.stopPropagation()
    if (e.button !== 0) return
    begin({ kind: 'resize', id: el.id, handle, startX: e.clientX, startY: e.clientY, origin: { ...el.frame } })
  }

  const onRotateDown = (e: React.PointerEvent, el: SlideElement): void => {
    e.stopPropagation()
    if (e.button !== 0) return
    const r = stageRef.current?.getBoundingClientRect()
    if (!r) return
    const cx = r.left + (el.frame.x + el.frame.width / 2) * scale
    const cy = r.top + (el.frame.y + el.frame.height / 2) * scale
    begin({ kind: 'rotate', id: el.id, cx, cy, origin: el.rotation, startAngle: (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI })
  }

  const onBackgroundDown = (e: React.PointerEvent): void => {
    if (e.button !== 0) return
    containerRef.current?.focus({ preventScroll: true })
    setFocusZone('editor')
    setEditingId(null)
    const additive = e.shiftKey || e.ctrlKey || e.metaKey
    if (!additive) ui.set({ selectedElementIds: [] })
    const p = toCanvas(e.clientX, e.clientY)
    begin({ kind: 'marquee', x0: p.x, y0: p.y, base: additive ? selectedIds : [] })
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (editingId || e.target !== e.currentTarget) return
    const step = e.shiftKey ? 10 : 1
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
    const m = moves[e.key]
    if (m && selectedIds.length) {
      e.preventDefault()
      nudgeSelected(m[0], m[1])
    } else if (e.key === 'Escape' && selectedIds.length) {
      e.preventDefault()
      ui.set({ selectedElementIds: [] })
    } else if (e.key === 'Enter') {
      const el = slide.elements.find((x) => x.id === selectedIds[0])
      if (el?.type === 'text') {
        e.preventDefault()
        setEditingId(el.id)
      }
    }
  }

  const single = selectedIds.length === 1 ? display.elements.find((x) => x.id === selectedIds[0]) : undefined
  const editing = editingId ? (display.elements.find((x) => x.id === editingId) as TextElement | undefined) : undefined
  const hiddenIds = useMemo(() => (editingId ? new Set([editingId]) : undefined), [editingId])

  return (
    <div
      ref={containerRef}
      className="editor-canvas"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={onBackgroundDown}
      onDragOver={(e) => {
        const d = currentDrag()
        if (d?.type === 'media') {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
        }
      }}
      onDrop={(e) => {
        const d = currentDrag()
        if (d?.type !== 'media') return
        e.preventDefault()
        const project = useProjectStore.getState().project
        for (const id of d.ids) {
          const asset = project?.media[id]
          if (asset) addMediaElement(asset)
        }
      }}
    >
      <div ref={stageRef} className={`editor-stage${transparent ? ' transparent' : ''}`} style={{ width: stageW, height: stageH }}>
        <div className="sr-stage" style={{ width: canvas.width, height: canvas.height, transform: `scale(${scale})` }}>
          <SlideContent slide={display} background={background} media={media} mode="editor" hiddenIds={hiddenIds} />
        </div>

        <div className="editor-overlay">
          {display.elements.map((el) =>
            el.hidden ? null : (
              <div
                key={el.id}
                className={`el-box${selected.has(el.id) ? ' selected' : ''}${el.locked ? ' locked' : ''}`}
                style={{
                  left: el.frame.x * scale,
                  top: el.frame.y * scale,
                  width: el.frame.width * scale,
                  height: el.frame.height * scale,
                  transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined
                }}
                onPointerDown={(e) => onElementDown(e, el)}
                onDoubleClick={() => el.type === 'text' && !el.locked && setEditingId(el.id)}
                title={el.name}
              >
                {single?.id === el.id && !el.locked && editingId !== el.id && (
                  <>
                    {HANDLES.map((h) => (
                      <span key={h} className={`el-handle h-${h}`} onPointerDown={(e) => onHandleDown(e, el, h)} />
                    ))}
                    <span className="el-rotate" title="Rotate (Shift snaps to 15°)" onPointerDown={(e) => onRotateDown(e, el)} />
                  </>
                )}
                {editing?.id === el.id && <InlineTextEditor el={editing} scale={scale} onDone={() => setEditingId(null)} />}
              </div>
            )
          )}
          {guides.x.map((x) => (
            <div key={`gx${x}`} className="guide guide-v" style={{ left: x * scale }} />
          ))}
          {guides.y.map((y) => (
            <div key={`gy${y}`} className="guide guide-h" style={{ top: y * scale }} />
          ))}
          {marquee && <div className="marquee" style={{ left: marquee.x * scale, top: marquee.y * scale, width: marquee.width * scale, height: marquee.height * scale }} />}
        </div>
      </div>
      <div className="editor-hint">
        {Math.round(scale * 100)}% · drag to move · Shift resizes proportionally · Alt disables snapping · double-click text to type
      </div>
    </div>
  )
}

function InlineTextEditor({ el, scale, onDone }: { el: TextElement; scale: number; onDone: () => void }): ReactElement {
  const [value, setValue] = useState(el.text)
  const done = useRef(false)
  const finish = (commit: boolean): void => {
    if (done.current) return
    done.current = true
    if (commit && value !== el.text) editElements('Edit text', (x) => x.type === 'text' && (x.text = value), undefined, [el.id])
    onDone()
  }
  return (
    <textarea
      className="inline-text"
      autoFocus
      value={value}
      onFocus={(e) => e.currentTarget.select()}
      onPointerDown={(e) => e.stopPropagation()}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Escape') finish(false)
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) finish(true)
      }}
      style={{
        padding: el.padding * scale,
        fontFamily: el.style.fontFamily,
        fontSize: Math.max(10, el.style.fontSize * scale),
        fontWeight: el.style.fontWeight,
        fontStyle: el.style.italic ? 'italic' : 'normal',
        textAlign: el.style.align,
        lineHeight: el.style.lineHeight,
        color: el.style.color
      }}
    />
  )
}
