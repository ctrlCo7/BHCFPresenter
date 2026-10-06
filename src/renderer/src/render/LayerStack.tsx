/**
 * Animated layer switching. When `itemKey` changes, the old layer animates out and the new
 * one animates in using the Web Animations API on transform / opacity / clip-path only, so
 * transitions run on the compositor (GPU) and stay smooth while videos play.
 */
import { useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'
import type { TransitionDirection, TransitionSpec } from '@shared/model/types'

type Phase = 'enter' | 'exit'

interface Layer {
  /** Stable React identity for the layer's whole life (enter → exit), so content never remounts */
  uid: number
  key: string
  node: ReactNode
  phase: Phase
  spec: TransitionSpec
  /** Increments to re-run the enter animation only on real changes */
  born: number
}

const offset = (dir: TransitionDirection, sign: 1 | -1): string => {
  switch (dir) {
    case 'left':
      return `translateX(${100 * sign}%)`
    case 'right':
      return `translateX(${-100 * sign}%)`
    case 'up':
      return `translateY(${100 * sign}%)`
    case 'down':
      return `translateY(${-100 * sign}%)`
  }
}

const wipeFrom = (dir: TransitionDirection): string => {
  switch (dir) {
    case 'left':
      return 'inset(0 0 0 100%)'
    case 'right':
      return 'inset(0 100% 0 0)'
    case 'up':
      return 'inset(100% 0 0 0)'
    case 'down':
      return 'inset(0 0 100% 0)'
  }
}

function keyframes(spec: TransitionSpec, phase: Phase): Keyframe[] {
  const d = spec.direction
  switch (spec.type) {
    case 'cut':
      return phase === 'enter' ? [{ opacity: 1 }, { opacity: 1 }] : [{ opacity: 0 }, { opacity: 0 }]
    case 'fade':
      // Through the background: out in the first half, in during the second.
      return phase === 'enter'
        ? [{ opacity: 0 }, { opacity: 0, offset: 0.5 }, { opacity: 1 }]
        : [{ opacity: 1 }, { opacity: 0, offset: 0.5 }, { opacity: 0 }]
    case 'dissolve':
      return phase === 'enter' ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }]
    case 'slide':
      return phase === 'enter' ? [{ transform: offset(d, 1) }, { transform: 'translate(0,0)' }] : [{ opacity: 1 }, { opacity: 1 }]
    case 'push':
      return phase === 'enter' ? [{ transform: offset(d, 1) }, { transform: 'translate(0,0)' }] : [{ transform: 'translate(0,0)' }, { transform: offset(d, -1) }]
    case 'zoom':
      return phase === 'enter'
        ? [{ opacity: 0, transform: 'scale(1.18)' }, { opacity: 1, transform: 'scale(1)' }]
        : [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.92)' }]
    case 'wipe':
      return phase === 'enter' ? [{ clipPath: wipeFrom(d) }, { clipPath: 'inset(0 0 0 0)' }] : [{ opacity: 1 }, { opacity: 1 }]
  }
}

function AnimatedLayer({ layer, onExited }: { layer: Layer; onExited: (uid: number) => void }): ReactElement {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const duration = layer.spec.type === 'cut' ? 0 : Math.max(0, layer.spec.durationMs)
    if (duration === 0) {
      if (layer.phase === 'exit') onExited(layer.uid)
      return
    }
    const anim = el.animate(keyframes(layer.spec, layer.phase), { duration, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'both' })
    if (layer.phase === 'exit') anim.onfinish = () => onExited(layer.uid)
    return () => anim.cancel()
    // Re-run only when the phase changes or a new layer is born.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer.phase, layer.born])
  return (
    <div ref={ref} className="layer">
      {layer.node}
    </div>
  )
}

let born = 0

/**
 * Renders `node` under `itemKey`. Changing the key transitions to the new content with `spec`;
 * changing only `node` updates the current layer in place (e.g. live edits, timer ticks).
 */
export function LayerStack({ itemKey, node, spec }: { itemKey: string | null; node: ReactNode; spec: TransitionSpec }): ReactElement {
  const [layers, setLayers] = useState<Layer[]>(() => (itemKey ? [{ uid: ++born, key: itemKey, node, phase: 'enter', spec: { ...spec, type: 'cut' }, born }] : []))
  const prevKey = useRef(itemKey)

  useLayoutEffect(() => {
    if (prevKey.current === itemKey) {
      // Same content key: refresh the visible layer's node.
      setLayers((ls) => ls.map((l) => (l.key === itemKey && l.phase === 'enter' ? { ...l, node } : l)))
      return
    }
    prevKey.current = itemKey
    setLayers((ls) => {
      const exiting = ls.filter((l) => l.key !== itemKey).map((l) => (l.phase === 'exit' ? l : { ...l, phase: 'exit' as const, spec, born: ++born }))
      return itemKey ? [...exiting, { uid: ++born, key: itemKey, node, phase: 'enter', spec, born }] : exiting
    })
  }, [itemKey, node, spec])

  const onExited = (uid: number): void => setLayers((ls) => ls.filter((l) => l.uid !== uid))

  return (
    <>
      {layers.map((l) => (
        <AnimatedLayer key={l.uid} layer={l} onExited={onExited} />
      ))}
    </>
  )
}
