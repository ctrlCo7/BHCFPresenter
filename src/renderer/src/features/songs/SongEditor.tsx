import { ArrowLeft, ArrowRight, ClipboardPaste, Plus, RotateCcw, X } from 'lucide-react'
import { useMemo, useState, type ReactElement } from 'react'
import { AUTO_LINES, chunkSection, lyricsText, parseSongText, sectionColor } from '@shared/model/songs'
import { LYRIC_THEMES } from '@shared/model/themes'
import type { Background, Id, MediaAsset, SongData, SongSection } from '@shared/model/types'
import { Row, Select } from '../../components/ui/fields'
import './songs.css'

export interface SongEditorResult {
  song: SongData
  linesPerSlide: number
  /** null = project default, { type: 'none' } = transparent */
  background: Background | null
  /** Lyric theme to apply; null = keep the song's current look */
  themeId: string | null
}

const PLACEHOLDER = `Paste the whole song here — headings, chords and CCLI lines are handled automatically.

Way Maker

Verse 1
You are here, moving in our midst
I worship You, I worship You

Chorus
Way maker, miracle worker
Promise keeper, light in the darkness

Repeat Chorus`

type BgChoice = 'transparent' | 'default' | string

function initialBgChoice(bg: Background | null): BgChoice {
  // Lyrics default to transparent so a live background video shows behind them.
  if (!bg) return 'transparent'
  if (bg.type === 'none') return 'transparent'
  if (bg.type === 'image' || bg.type === 'video') return bg.mediaId
  return 'default'
}

export function SongEditor({
  initial,
  initialBackground,
  initialTheme,
  linesPerSlide,
  media,
  onClose
}: {
  initial: SongData
  initialBackground: Background | null
  /** Theme id stored on the song; null when it was styled by hand */
  initialTheme: string | null
  linesPerSlide: number
  media: MediaAsset[]
  onClose: (r: SongEditorResult | null) => void
}): ReactElement {
  const [title, setTitle] = useState(initial.title)
  const [artist, setArtist] = useState(initial.artist)
  const [copyright, setCopyright] = useState(initial.copyright)
  const [ccli, setCcli] = useState(initial.ccli)
  const [text, setText] = useState(() => (initial.sections.length ? lyricsText(initial.sections) : ''))
  const [sections, setSections] = useState<SongSection[]>(initial.sections)
  const [autoOrder, setAutoOrder] = useState<Id[]>(initial.arrangement)
  // Once the operator rearranges by hand, re-parsing no longer overrides their order.
  const [manualOrder, setManualOrder] = useState<Id[] | null>(initial.arrangement.length ? initial.arrangement : null)
  const [lines, setLines] = useState(String(linesPerSlide))
  const [theme, setTheme] = useState<string>(initialTheme ?? (initial.sections.length ? 'keep' : 'classic'))
  const [bg, setBg] = useState<BgChoice>(initialBgChoice(initialBackground))

  const onText = (value: string): void => {
    setText(value)
    const parsed = parseSongText(value, sections)
    setSections(parsed.sections)
    setAutoOrder(parsed.arrangement)
    const ids = new Set(parsed.sections.map((s) => s.id))
    setManualOrder((m) => (m ? m.filter((id) => ids.has(id)) : m))
    // Fill empty metadata from what the paste contained.
    if (parsed.title && !title.trim()) setTitle(parsed.title)
    if (parsed.ccli && !ccli.trim()) setCcli(parsed.ccli)
    if (parsed.copyright && !copyright.trim()) setCopyright(parsed.copyright)
  }

  const pasteFromClipboard = async (): Promise<void> => {
    try {
      const clip = await navigator.clipboard.readText()
      if (clip.trim()) onText(clip)
    } catch {
      /* clipboard permission denied: the user can still paste with Ctrl+V */
    }
  }

  const order = manualOrder && manualOrder.length ? manualOrder : autoOrder.length ? autoOrder : sections.map((s) => s.id)
  const byId = useMemo(() => new Map(sections.map((s) => [s.id, s])), [sections])
  const preview = useMemo(
    () =>
      order.flatMap((id) => {
        const s = byId.get(id)
        if (!s) return []
        const chunks = chunkSection(s.text, Number(lines))
        return chunks.map((c, i) => ({ key: `${id}-${i}`, label: chunks.length > 1 ? `${s.name} (${i + 1}/${chunks.length})` : s.name, color: sectionColor(s.name), text: c }))
      }),
    [order, byId, lines]
  )

  const setOrder = (next: Id[]): void => setManualOrder(next)
  const move = (i: number, dir: -1 | 1): void => {
    const a = [...order]
    const j = i + dir
    if (j < 0 || j >= a.length) return
    ;[a[i], a[j]] = [a[j] as Id, a[i] as Id]
    setOrder(a)
  }

  const images = media.filter((m) => m.kind === 'image' || m.kind === 'video')
  const background: Background | null =
    bg === 'transparent'
      ? { type: 'none' }
      : bg === 'default'
        ? null
        : (() => {
            const a = media.find((m) => m.id === bg)
            if (!a) return null
            return a.kind === 'video' ? { type: 'video', mediaId: a.id, fit: 'cover', loop: true, muted: true } : { type: 'image', mediaId: a.id, fit: 'cover' }
          })()

  return (
    <div className="modal-body song-editor">
      <div className="song-meta">
        <Row label="Title">
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus placeholder="Detected from the first line when you paste" />
        </Row>
        <Row label="Artist">
          <input className="input" value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="Author / artist" />
        </Row>
        <Row label="Copyright">
          <input className="input" value={copyright} onChange={(e) => setCopyright(e.target.value)} placeholder="© 2020 Publisher" />
        </Row>
        <Row label="CCLI #">
          <input className="input" value={ccli} onChange={(e) => setCcli(e.target.value)} placeholder="Song number" />
        </Row>
      </div>
      <div className="song-columns">
        <div className="song-lyrics">
          <div className="song-lyrics-head">
            <label className="field-label">Lyrics — just paste. Slides are created and updated automatically.</label>
            <button className="btn" onClick={() => void pasteFromClipboard()} title="Replace with clipboard text">
              <ClipboardPaste size={14} /> Paste
            </button>
          </div>
          <textarea className="input" value={text} onChange={(e) => onText(e.target.value)} placeholder={PLACEHOLDER} spellCheck onKeyDown={(e) => e.stopPropagation()} />
        </div>
        <div className="song-side">
          <div className="field-label">Sections — click to add another time</div>
          <div className="song-sections">
            {sections.length === 0 && <span className="muted">Appear when you paste lyrics.</span>}
            {sections.map((s) => (
              <button key={s.id} className="song-chip" style={{ ['--chip' as string]: sectionColor(s.name) }} onClick={() => setOrder([...order, s.id])} title="Add to the order">
                <Plus size={11} /> {s.name}
              </button>
            ))}
          </div>
          <div className="field-label song-arr-title">
            Order {manualOrder ? <span className="muted">(arranged by hand)</span> : <span className="muted">(from the lyrics)</span>}
            {manualOrder && (
              <button className="link" onClick={() => setManualOrder(null)}>
                <RotateCcw size={11} /> use lyrics order
              </button>
            )}
          </div>
          <div className="song-arrangement">
            {order.map((id, i) => {
              const s = byId.get(id)
              if (!s) return null
              return (
                <div key={`${id}-${i}`} className="song-arr-item" style={{ ['--chip' as string]: sectionColor(s.name) }}>
                  <span className="song-arr-name">{s.name}</span>
                  <button className="icon-btn" title="Earlier" onClick={() => move(i, -1)}>
                    <ArrowLeft size={12} />
                  </button>
                  <button className="icon-btn" title="Later" onClick={() => move(i, 1)}>
                    <ArrowRight size={12} />
                  </button>
                  <button className="icon-btn" title="Remove" onClick={() => setOrder(order.filter((_, j) => j !== i))}>
                    <X size={12} />
                  </button>
                </div>
              )
            })}
          </div>
          <Row label="Lines / slide">
            <Select
              value={lines}
              options={[{ value: String(AUTO_LINES), label: 'Auto' }, ...['1', '2', '3', '4', '5', '6', '8'].map((v) => ({ value: v, label: v }))]}
              onChange={setLines}
              width={90}
            />
          </Row>
          <Row label="Theme">
            <Select
              value={theme}
              options={[...(initial.sections.length ? [{ value: 'keep', label: 'Keep current look' }] : []), ...LYRIC_THEMES.map((t) => ({ value: t.id, label: t.name }))]}
              onChange={setTheme}
            />
          </Row>
          <Row label="Background">
            <Select
              value={bg}
              options={[
                { value: 'transparent', label: 'Transparent (show live video background)' },
                { value: 'default', label: 'Project default' },
                ...images.map((m) => ({ value: m.id, label: `${m.kind === 'video' ? 'Video' : 'Image'}: ${m.name}` }))
              ]}
              onChange={setBg}
            />
          </Row>
          <div className="field-label">
            Preview — {preview.length} slide{preview.length === 1 ? '' : 's'}
          </div>
          <div className="song-preview">
            {preview.map((p, i) => (
              <div key={p.key} className="song-preview-slide" style={{ ['--chip' as string]: p.color }}>
                <span className="song-preview-label">
                  {i + 1} · {p.label}
                </span>
                <span className="song-preview-text">{p.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="modal-footer">
        <button className="btn" onClick={() => onClose(null)}>
          Cancel
        </button>
        <button
          className="btn primary"
          disabled={!title.trim() || sections.length === 0}
          title={!title.trim() ? 'Enter a title' : undefined}
          onClick={() =>
            onClose({
              song: { title: title.trim(), artist: artist.trim(), copyright: copyright.trim(), ccli: ccli.trim(), sections, arrangement: order },
              linesPerSlide: Number(lines),
              background,
              themeId: theme === 'keep' || theme === initialTheme ? (initial.sections.length ? null : theme) : theme
            })
          }
        >
          Save Song ({preview.length} slides)
        </button>
      </div>
    </div>
  )
}
