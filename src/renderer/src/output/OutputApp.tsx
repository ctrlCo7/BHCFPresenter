/** An output window: renders the live program (audience) or the stage display, full window. */
import { useEffect, useState, type ReactElement } from 'react'
import { emptyLiveState, type LiveState, type OutputConfig } from '@shared/live'
import { ProgramRenderer } from '../render/ProgramRenderer'
import { StageView } from '../render/StageView'

function useWindowSize(): { width: number; height: number } {
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight })
  useEffect(() => {
    const onResize = (): void => setSize({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return size
}

export function OutputApp(): ReactElement | null {
  const [config, setConfig] = useState<OutputConfig | null>(null)
  const [live, setLive] = useState<LiveState>(() => emptyLiveState({ width: 1920, height: 1080 }))
  const [error, setError] = useState<string | null>(null)
  const size = useWindowSize()

  useEffect(() => {
    // IPC delivers in order, so the latest message is always the current state.
    const offLive = window.bhcfOutput.onLive(setLive)
    const offConfig = window.bhcfOutput.onConfig(setConfig)
    window.bhcfOutput
      .hello()
      .then(({ config: c, live: l }) => {
        setConfig(c)
        if (l) setLive(l)
      })
      .catch((err: unknown) => setError(String(err)))
    return () => {
      offLive()
      offConfig()
    }
  }, [])

  if (error) return <div style={{ color: '#888', font: '16px system-ui', padding: 20 }}>Output error: {error}</div>
  if (!config) return null
  if (config.role === 'stage') return <StageView live={live} layout={config.stage} />
  return <ProgramRenderer live={live} width={size.width} height={size.height} audio={live.audioTarget === config.id} />
}
