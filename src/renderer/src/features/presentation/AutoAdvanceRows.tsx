import { createElement, type ReactElement } from 'react'
import { clampSeconds } from '@shared/model/normalize'
import type { Id } from '@shared/model/types'
import { NumberField, Row, Toggle } from '../../components/ui/fields'
import { dialogs } from '../../store/overlayStore'
import { applyChange, useProjectStore } from '../../store/projectStore'

function editPres(id: Id, label: string, fn: (p: { autoAdvanceSec?: number; loop?: boolean }) => void, coalesce?: string): void {
  applyChange(
    label,
    (d) => {
      const p = d.presentations[id]
      if (p) fn(p)
    },
    { coalesce }
  )
}

/** A presentation's auto-advance and loop settings (inspector and the Show-mode dialog). */
export function AutoAdvanceRows({ presentationId }: { presentationId: Id }): ReactElement | null {
  const pres = useProjectStore((s) => s.project?.presentations[presentationId])
  if (!pres) return null
  const on = !!pres.autoAdvanceSec
  return (
    <>
      <Row label="Auto-advance">
        <Toggle
          checked={on}
          label="Go to the next slide by itself"
          onChange={(v) =>
            editPres(presentationId, 'Auto-advance', (p) => {
              if (v) p.autoAdvanceSec = 8
              else delete p.autoAdvanceSec
            })
          }
        />
      </Row>
      {on && (
        <Row label="Every">
          <NumberField
            value={pres.autoAdvanceSec ?? 8}
            min={1}
            max={3600}
            suffix="s"
            onChange={(sec) => editPres(presentationId, 'Auto-advance time', (p) => (p.autoAdvanceSec = clampSeconds(Math.max(1, sec))), 'auto-advance')}
          />
        </Row>
      )}
      <Row label="Loop">
        <Toggle
          checked={!!pres.loop}
          label="Start again after the last slide"
          onChange={(v) =>
            editPres(presentationId, 'Loop presentation', (p) => {
              if (v) p.loop = true
              else delete p.loop
            })
          }
        />
      </Row>
      <div className="muted inspector-tip">
        Use it for announcement loops before the service. A slide can set its own time (or stay until Next) in the slide editor. Pause it from the bar under the Program monitor;
        Clear, Black, media or a timer screen stop it.
      </div>
    </>
  )
}

/** Show-mode dialog for a presentation's auto-advance / loop settings. */
export async function editAutoAdvance(presentationId: Id): Promise<void> {
  const name = useProjectStore.getState().project?.presentations[presentationId]?.name ?? ''
  await dialogs.custom<null>({
    title: `Auto-advance · ${name}`,
    width: 460,
    render: (close) =>
      createElement(
        'div',
        { className: 'modal-body' },
        createElement(AutoAdvanceRows, { presentationId }),
        createElement('div', { className: 'modal-footer' }, createElement('button', { className: 'btn primary', onClick: () => close(null) }, 'Done'))
      )
  })
}
