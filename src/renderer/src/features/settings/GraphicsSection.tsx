import { useEffect, useState, type ReactElement } from 'react'
import type { GraphicsInfo } from '@shared/ipc'
import { Row, Section, Toggle } from '../../components/ui/fields'
import { dialogs, errorMessage, toast } from '../../store/overlayStore'

async function changeSafeMode(on: boolean): Promise<void> {
  const ok = await dialogs.confirm({
    title: on ? 'Turn on safe graphics?' : 'Turn off safe graphics?',
    message: on
      ? 'BHCF Presenter restarts without hardware acceleration. Use it when the app closes or freezes as the outputs open. Video may be less smooth. Your project is saved first.'
      : 'BHCF Presenter restarts with hardware acceleration (smoother video). Your project is saved first.',
    confirmLabel: 'Restart now',
    focusCancel: true
  })
  if (!ok) return
  try {
    await window.bhcf.app.setSafeGraphics(on, true)
  } catch (err) {
    toast.error('Could not change graphics mode', errorMessage(err))
  }
}

/** Settings → Outputs: safe graphics mode. */
export function GraphicsSection(): ReactElement {
  const [info, setInfo] = useState<GraphicsInfo | null>(null)
  useEffect(() => {
    void window.bhcf.app.graphics().then(setInfo)
  }, [])
  return (
    <Section title="Graphics">
      <Row label="Safe graphics">
        <Toggle checked={!!info?.safeMode} label="Turn off hardware acceleration" onChange={(on) => void changeSafeMode(on)} />
      </Row>
      <p className="muted">
        If the app closes or freezes when you press Outputs, turn this on. It avoids crashes from the graphics driver, but heavy video may play less smoothly.
        {info?.lastGpuCrash ? ` The graphics process last crashed on ${new Date(info.lastGpuCrash).toLocaleString()}.` : ''}
      </p>
    </Section>
  )
}

/** At start: after a graphics crash, offer safe graphics once. */
export async function askSafeGraphicsAfterCrash(): Promise<void> {
  const info = await window.bhcf.app.graphics().catch(() => null)
  if (!info?.askSafeMode) return
  const yes = await dialogs.confirm({
    title: 'The display crashed last time',
    message:
      'The graphics part of BHCF Presenter crashed (this can close the app when the outputs open, usually because of the graphics driver). Turn on safe graphics? The app restarts without hardware acceleration; video may be less smooth. You can change this in Settings → Outputs.',
    confirmLabel: 'Turn on and restart',
    cancelLabel: 'Not now',
    focusCancel: true
  })
  if (yes) await window.bhcf.app.setSafeGraphics(true, true)
  else await window.bhcf.app.dismissSafeGraphics()
}
