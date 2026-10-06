import { Eye, EyeOff, Film, Image as ImageIcon, Lock, Square, Type, Unlock } from 'lucide-react'
import { useState, type ReactElement } from 'react'
import type { Slide, SlideElement } from '@shared/model/types'
import { moveElementTo, patchElements } from '../../engine/elementOps'
import { ui, useUiStore } from '../../store/uiStore'
import { editSlide } from './editorActions'

const ICON: Record<SlideElement['type'], ReactElement> = {
  text: <Type size={13} />,
  shape: <Square size={13} />,
  image: <ImageIcon size={13} />,
  video: <Film size={13} />
}

/** Layer list, topmost first. Drag to restack; eye / lock toggles per layer. */
export function LayersPanel({ slide }: { slide: Slide }): ReactElement {
  const selectedIds = useUiStore((s) => s.selectedElementIds)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const layers = [...slide.elements].reverse()

  const select = (e: React.MouseEvent, id: string): void => {
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      ui.set({ selectedElementIds: selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id] })
    } else ui.set({ selectedElementIds: [id] })
  }

  return (
    <div className="layers">
      <div className="layers-title">Layers</div>
      {layers.length === 0 && <div className="muted layers-empty">No elements. Use the toolbar to add text, shapes or media.</div>}
      {layers.map((el, row) => {
        // Rows are reversed: row 0 is the top of the stack (last element).
        const stackIndex = slide.elements.length - 1 - row
        return (
          <div
            key={el.id}
            className={`layer-row${selectedIds.includes(el.id) ? ' selected' : ''}${dropIndex === row ? ' drop' : ''}`}
            draggable
            onDragStart={(e) => {
              setDragId(el.id)
              e.dataTransfer.effectAllowed = 'move'
              e.dataTransfer.setData('text/plain', el.name)
            }}
            onDragEnd={() => {
              setDragId(null)
              setDropIndex(null)
            }}
            onDragOver={(e) => {
              if (!dragId) return
              e.preventDefault()
              if (dropIndex !== row) setDropIndex(row)
            }}
            onDrop={(e) => {
              e.preventDefault()
              if (dragId && dragId !== el.id) editSlide('Restack layer', (s) => moveElementTo(s, dragId, stackIndex))
              setDragId(null)
              setDropIndex(null)
            }}
            onClick={(e) => select(e, el.id)}
          >
            <span className="layer-icon">{ICON[el.type]}</span>
            <span className="layer-name" style={{ opacity: el.hidden ? 0.5 : 1 }}>
              {el.type === 'text' && el.text.trim() ? el.text.split('\n')[0] : el.name}
            </span>
            <button
              className="icon-btn"
              title={el.hidden ? 'Show' : 'Hide'}
              onClick={(e) => {
                e.stopPropagation()
                editSlide(el.hidden ? 'Show element' : 'Hide element', (s) => patchElements(s, [el.id], (x) => (x.hidden = !x.hidden)))
              }}
            >
              {el.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
            <button
              className="icon-btn"
              title={el.locked ? 'Unlock' : 'Lock'}
              onClick={(e) => {
                e.stopPropagation()
                editSlide(el.locked ? 'Unlock element' : 'Lock element', (s) => patchElements(s, [el.id], (x) => (x.locked = !x.locked)))
              }}
            >
              {el.locked ? <Lock size={13} /> : <Unlock size={13} />}
            </button>
          </div>
        )
      })}
    </div>
  )
}
