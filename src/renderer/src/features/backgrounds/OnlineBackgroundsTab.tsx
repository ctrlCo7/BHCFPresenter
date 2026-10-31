import { Check, Download, ExternalLink, KeyRound, Loader2, Play, Search } from 'lucide-react'
import { useEffect, useState, type ReactElement } from 'react'
import type { OnlineBackground, OnlineProvider } from '@shared/ipc'
import { Segmented } from '../../components/ui/fields'
import { playBackground } from '../../live/liveActions'
import { errorMessage, toast } from '../../store/overlayStore'
import { useProjectStore } from '../../store/projectStore'
import { addNewMedia } from '../media/mediaActions'

const PROVIDERS: { value: OnlineProvider; label: string }[] = [
  { value: 'pexels', label: 'Pexels' },
  { value: 'pixabay', label: 'Pixabay' }
]

const NAMES: Record<OnlineProvider, string> = { pexels: 'Pexels', pixabay: 'Pixabay' }

/** Searches that find good worship loops. */
const IDEAS = ['worship background', 'light rays', 'clouds sky', 'bokeh lights', 'particles', 'cross', 'sunrise', 'abstract loop', 'stars night', 'water waves', 'golden light', 'church']

const remember = (key: string, value: string): void => {
  try {
    localStorage.setItem(`bhcf-online-${key}`, value)
  } catch {
    /* storage unavailable */
  }
}
const recall = (key: string, fallback: string): string => {
  try {
    return localStorage.getItem(`bhcf-online-${key}`) ?? fallback
  } catch {
    return fallback
  }
}

function KeySetup({ provider, onSaved }: { provider: OnlineProvider; onSaved: (keys: Record<OnlineProvider, boolean>) => void }): ReactElement {
  const [key, setKey] = useState('')
  const save = (): void => {
    void window.bhcf.online
      .setKey(provider, key)
      .then((k) => {
        onSaved(k)
        toast.success(`${NAMES[provider]} key saved`, 'It is kept on this computer only.')
      })
      .catch((err: unknown) => toast.error('Could not save the key', errorMessage(err)))
  }
  return (
    <div className="online-key">
      <KeyRound size={22} />
      <div className="online-key-body">
        <b>Connect {NAMES[provider]} (free)</b>
        <ol>
          <li>
            <button className="link" onClick={() => void window.bhcf.online.openPage(provider)}>
              Open the {NAMES[provider]} API page <ExternalLink size={11} />
            </button>{' '}
            and sign up or log in (free).
          </li>
          <li>{provider === 'pexels' ? 'Request your API key, then copy it.' : 'Scroll to “Parameters” and copy your key (shown after you log in).'}</li>
          <li>Paste it here and click Save. You only do this once on each computer.</li>
        </ol>
        <div className="online-key-row">
          <input
            className="input"
            placeholder={`${NAMES[provider]} API key`}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter' && key.trim()) save()
            }}
          />
          <button className="btn primary" disabled={!key.trim()} onClick={save}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

function ResultCard({ r, state, onAdd }: { r: OnlineBackground; state: 'idle' | number | 'done'; onAdd: (play: boolean) => void }): ReactElement {
  const busy = typeof state === 'number'
  const length = r.durationSec ? `${Math.floor(r.durationSec / 60)}:${String(r.durationSec % 60).padStart(2, '0')}` : ''
  return (
    <div className="tpl-card">
      <div className="tpl-preview">
        {r.thumbnail && <img className="tpl-canvas online-thumb" src={r.thumbnail} alt="" draggable={false} />}
        {length && <span className="online-length">{length}</span>}
        {busy && (
          <div className="tpl-busy">
            <Loader2 size={16} className="spin" /> {state > 0 ? `${state}%` : 'Downloading…'}
          </div>
        )}
      </div>
      <div className="tpl-name">
        <span className="tpl-file-title" title={r.title}>
          {r.title}
        </span>
      </div>
      <div className="muted tpl-desc">
        {r.width && r.height ? `${r.width}×${r.height} · ` : ''}
        <button className="link" onClick={() => void window.bhcf.online.openPage(r.provider, r.id)} title={`Open on ${NAMES[r.provider]}`}>
          {r.author ? `by ${r.author}` : NAMES[r.provider]}
        </button>
      </div>
      <div className="tpl-actions">
        <button className="btn" disabled={busy} onClick={() => onAdd(false)} title="Download and add to Media › P&W Backgrounds">
          {state === 'done' ? <Check size={14} /> : <Download size={14} />} {state === 'done' ? 'Added' : 'Add'}
        </button>
        <button className="btn primary" disabled={busy} onClick={() => onAdd(true)} title="Download, add, and play it behind your lyrics now">
          <Play size={14} /> Add & play
        </button>
      </div>
    </div>
  )
}

/** Templates › Online: free worship background videos from Pexels and Pixabay. */
export function OnlineBackgroundsTab(): ReactElement {
  const hasProject = useProjectStore((s) => !!s.project)
  const [provider, setProvider] = useState<OnlineProvider>(() => (recall('provider', 'pexels') === 'pixabay' ? 'pixabay' : 'pexels'))
  const [keys, setKeys] = useState<Record<OnlineProvider, boolean> | null>(null)
  const [query, setQuery] = useState(() => recall('query', 'worship background'))
  const [results, setResults] = useState<OnlineBackground[] | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [searching, setSearching] = useState(false)
  const [states, setStates] = useState<Record<string, number | 'done'>>({})

  useEffect(() => {
    void window.bhcf.online.keys().then(setKeys)
    return window.bhcf.online.onProgress(({ id, percent }) => setStates((s) => (s[id] === 'done' ? s : { ...s, [id]: percent })))
  }, [])

  const search = (q = query, p = 1): void => {
    setSearching(true)
    remember('query', q)
    void window.bhcf.online
      .search(provider, q, p)
      .then((res) => {
        setResults((prev) => (p > 1 && prev ? [...prev, ...res.results] : res.results))
        setTotal(res.total)
        setPage(p)
      })
      .catch((err: unknown) => toast.error('Search failed', errorMessage(err)))
      .finally(() => setSearching(false))
  }

  // Search when a provider with a key is chosen.
  useEffect(() => {
    remember('provider', provider)
    setResults(null)
    if (keys?.[provider]) search(query, 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, keys?.[provider]])

  const add = async (r: OnlineBackground, play: boolean): Promise<void> => {
    if (!hasProject) {
      toast.info('Open a project first', 'Online backgrounds are added to the open project.')
      return
    }
    setStates((s) => ({ ...s, [r.id]: 0 }))
    try {
      const name = await window.bhcf.online.download(r.id)
      const asset = await window.bhcf.library.import(name, 'folder')
      await addNewMedia([{ ...asset, name: r.title }], `Add background ${r.title}`, { pwBackgrounds: true })
      setStates((s) => ({ ...s, [r.id]: 'done' }))
      if (play) playBackground(asset.id)
      toast.success(play ? 'Playing behind your lyrics' : 'Background added', `${r.title} is in Media › P&W Backgrounds and in My Backgrounds (Online folder).`)
    } catch (err) {
      setStates(({ [r.id]: _drop, ...rest }) => rest)
      toast.error('Could not add this background', errorMessage(err))
    }
  }

  return (
    <div className="tpl-body">
      <div className="tpl-toolbar">
        <Segmented value={provider} options={PROVIDERS} onChange={setProvider} />
        {keys?.[provider] && (
          <>
            <div className="online-search">
              <Search size={14} />
              <input
                className="input"
                placeholder="Search worship backgrounds…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === 'Enter') search()
                }}
              />
            </div>
            <button className="btn primary" disabled={searching} onClick={() => search()}>
              {searching ? <Loader2 size={14} className="spin" /> : <Search size={14} />} Search
            </button>
          </>
        )}
        <span className="tpl-spacer" />
        {keys?.[provider] && (
          <button className="link" onClick={() => void window.bhcf.online.setKey(provider, '').then(setKeys)} title={`Remove the saved ${NAMES[provider]} key from this computer`}>
            Change key
          </button>
        )}
      </div>
      {keys && !keys[provider] ? (
        <KeySetup provider={provider} onSaved={setKeys} />
      ) : (
        <>
          <div className="online-ideas">
            {IDEAS.map((q) => (
              <button
                key={q}
                className={`chip${q === query ? ' active' : ''}`}
                onClick={() => {
                  setQuery(q)
                  search(q, 1)
                }}
              >
                {q}
              </button>
            ))}
          </div>
          <p className="muted tpl-hint">
            Free videos from {NAMES[provider]}, free to use in church. “Add” downloads the video (HD) into your backgrounds folder and puts it in Media › P&W Backgrounds. Download before the service: it
            needs the internet.
          </p>
          {results && results.length === 0 && !searching && <p className="muted">No videos found. Try another word, like “light” or “clouds”.</p>}
          <div className="tpl-grid">
            {(results ?? []).map((r) => (
              <ResultCard key={r.id} r={r} state={states[r.id] ?? 'idle'} onAdd={(play) => void add(r, play)} />
            ))}
          </div>
          {results && results.length > 0 && results.length < total && (
            <div className="online-more">
              <button className="btn" disabled={searching} onClick={() => search(query, page + 1)}>
                {searching ? <Loader2 size={14} className="spin" /> : null} Show more
              </button>
            </div>
          )}
          {results && results.length > 0 && (
            <p className="muted online-credit">
              Videos provided by{' '}
              <button className="link" onClick={() => void window.bhcf.online.openPage(provider)}>
                {NAMES[provider]}
              </button>
              .
            </p>
          )}
        </>
      )}
    </div>
  )
}
