/**
 * Procedural motion backgrounds. Every preset is drawn from a loop phase p ∈ [0, 1): all
 * motion uses whole-number cycles per loop, so frame p = 1 equals frame p = 0 and the
 * recorded video loops seamlessly.
 */

export interface Palette {
  id: string
  name: string
  /** dark base, mid base, accent, highlight */
  colors: [string, string, string, string]
}

export const PALETTES: Palette[] = [
  { id: 'green', name: 'Green', colors: ['#03140a', '#0f3d22', '#22c55e', '#bbf7d0'] },
  { id: 'blue', name: 'Blue', colors: ['#020617', '#0c2a5b', '#3b82f6', '#bfdbfe'] },
  { id: 'gold', name: 'Gold', colors: ['#140b02', '#4a2d07', '#f59e0b', '#fde68a'] },
  { id: 'purple', name: 'Purple', colors: ['#0b0416', '#2e1065', '#a855f7', '#e9d5ff'] }
]

export interface MotionPreset {
  id: string
  name: string
  draw: (ctx: CanvasRenderingContext2D, p: number, w: number, h: number, pal: Palette) => void
}

const TAU = Math.PI * 2

function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hexA(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}

function baseGradient(ctx: CanvasRenderingContext2D, w: number, h: number, pal: Palette): void {
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, pal.colors[1])
  g.addColorStop(1, pal.colors[0])
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
}

function softDot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha: number): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, hexA(color, alpha))
  g.addColorStop(0.55, hexA(color, alpha * 0.45))
  g.addColorStop(1, hexA(color, 0))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(x, y, r, 0, TAU)
  ctx.fill()
}

/** Precomputed random parameters per preset (stable across frames). */
const bokehDots = (() => {
  const r = rng(7)
  return Array.from({ length: 36 }, () => ({
    x: r(),
    y: r(),
    rad: 0.03 + r() * 0.09,
    ax: 0.04 + r() * 0.08,
    ay: 0.03 + r() * 0.07,
    fx: 1 + Math.floor(r() * 2),
    fy: 1 + Math.floor(r() * 2),
    ph: r() * TAU,
    a: 0.12 + r() * 0.3,
    hi: r() > 0.6
  }))
})()

const stars = (() => {
  const r = rng(11)
  return Array.from({ length: 220 }, () => ({ x: r(), y: r(), s: 0.6 + r() * 2.2, k: 1 + Math.floor(r() * 3), ph: r() * TAU, layer: r() > 0.7 ? 2 : 1 }))
})()

const particles = (() => {
  const r = rng(23)
  return Array.from({ length: 140 }, () => ({ x: r(), y: r(), s: 1 + r() * 3.5, speed: 1 + Math.floor(r() * 2), sway: r() * 0.02, ph: r() * TAU, a: 0.25 + r() * 0.6 }))
})()

export const PRESETS: MotionPreset[] = [
  {
    id: 'bokeh',
    name: 'Soft Bokeh',
    draw(ctx, p, w, h, pal) {
      baseGradient(ctx, w, h, pal)
      ctx.globalCompositeOperation = 'lighter'
      const m = Math.min(w, h)
      for (const d of bokehDots) {
        const x = (d.x + d.ax * Math.sin(TAU * d.fx * p + d.ph)) * w
        const y = (d.y + d.ay * Math.cos(TAU * d.fy * p + d.ph)) * h
        softDot(ctx, x, y, d.rad * m * 1.6, d.hi ? pal.colors[3] : pal.colors[2], d.a * (0.75 + 0.25 * Math.sin(TAU * p + d.ph)))
      }
      ctx.globalCompositeOperation = 'source-over'
    }
  },
  {
    id: 'aurora',
    name: 'Aurora',
    draw(ctx, p, w, h, pal) {
      ctx.fillStyle = pal.colors[0]
      ctx.fillRect(0, 0, w, h)
      ctx.globalCompositeOperation = 'lighter'
      for (let band = 0; band < 4; band++) {
        const color = band % 2 ? pal.colors[3] : pal.colors[2]
        ctx.beginPath()
        ctx.moveTo(0, h)
        for (let i = 0; i <= 48; i++) {
          const x = (i / 48) * w
          const u = i / 48
          const y = h * (0.35 + band * 0.08) + h * 0.08 * Math.sin(TAU * (u * (1 + band * 0.5) + p * (band % 2 ? 1 : -1))) + h * 0.04 * Math.sin(TAU * (u * 3 + 2 * p + band))
          ctx.lineTo(x, y)
        }
        ctx.lineTo(w, h)
        ctx.closePath()
        const g = ctx.createLinearGradient(0, h * 0.2, 0, h)
        g.addColorStop(0, hexA(color, 0))
        g.addColorStop(0.35, hexA(color, 0.18))
        g.addColorStop(1, hexA(color, 0))
        ctx.fillStyle = g
        ctx.fill()
      }
      ctx.globalCompositeOperation = 'source-over'
    }
  },
  {
    id: 'rays',
    name: 'Light Rays',
    draw(ctx, p, w, h, pal) {
      baseGradient(ctx, w, h, pal)
      const cx = w / 2
      const cy = -h * 0.15
      const n = 14
      ctx.save()
      ctx.translate(cx, cy)
      // Rotating by one ray spacing per loop repeats exactly.
      ctx.rotate((TAU / n) * p)
      ctx.globalCompositeOperation = 'lighter'
      for (let i = 0; i < n; i++) {
        const a = (TAU / n) * i
        const len = Math.hypot(w, h) * 1.2
        const spread = 0.07 + 0.03 * Math.sin(TAU * (p * 2) + i)
        const g = ctx.createLinearGradient(0, 0, Math.cos(a) * len, Math.sin(a) * len)
        g.addColorStop(0, hexA(pal.colors[3], 0.28))
        g.addColorStop(1, hexA(pal.colors[2], 0))
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.lineTo(Math.cos(a - spread) * len, Math.sin(a - spread) * len)
        ctx.lineTo(Math.cos(a + spread) * len, Math.sin(a + spread) * len)
        ctx.closePath()
        ctx.fill()
      }
      ctx.restore()
      ctx.globalCompositeOperation = 'source-over'
      softDot(ctx, cx, 0, h * 0.55, pal.colors[3], 0.35)
    }
  },
  {
    id: 'stars',
    name: 'Starry Night',
    draw(ctx, p, w, h, pal) {
      const g = ctx.createRadialGradient(w / 2, h * 1.1, 0, w / 2, h * 1.1, h * 1.3)
      g.addColorStop(0, pal.colors[1])
      g.addColorStop(1, pal.colors[0])
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)
      for (const s of stars) {
        // Drift one full width per loop (far layer) or two (near layer), wrapping around.
        const x = (((s.x + p * s.layer * 0.25) % 1) + 1) % 1
        const tw = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(TAU * s.k * p + s.ph))
        ctx.fillStyle = hexA(pal.colors[3], tw)
        const size = s.s * (w / 1920)
        ctx.beginPath()
        ctx.arc(x * w, s.y * h, size, 0, TAU)
        ctx.fill()
      }
    }
  },
  {
    id: 'waves',
    name: 'Flowing Waves',
    draw(ctx, p, w, h, pal) {
      baseGradient(ctx, w, h, pal)
      for (let layer = 0; layer < 5; layer++) {
        ctx.beginPath()
        ctx.moveTo(0, h)
        const base = h * (0.45 + layer * 0.1)
        for (let i = 0; i <= 64; i++) {
          const u = i / 64
          const y = base + h * 0.05 * Math.sin(TAU * (u * (1.5 + layer * 0.3) + p * (layer % 2 ? 1 : -1) * (1 + (layer % 3)))) + h * 0.02 * Math.sin(TAU * (u * 4 + 2 * p))
          ctx.lineTo(u * w, y)
        }
        ctx.lineTo(w, h)
        ctx.closePath()
        ctx.fillStyle = hexA(layer % 2 ? pal.colors[2] : pal.colors[3], 0.07 + layer * 0.02)
        ctx.fill()
      }
    }
  },
  {
    id: 'particles',
    name: 'Rising Light',
    draw(ctx, p, w, h, pal) {
      baseGradient(ctx, w, h, pal)
      ctx.globalCompositeOperation = 'lighter'
      softDot(ctx, w / 2, h * 1.05, h * 0.9, pal.colors[2], 0.25)
      for (const d of particles) {
        // Each particle rises a whole number of screen heights per loop.
        const y = (((d.y - p * d.speed) % 1) + 1) % 1
        const x = d.x + d.sway * Math.sin(TAU * (2 * p) + d.ph)
        softDot(ctx, x * w, y * h, d.s * 4 * (w / 1920), pal.colors[3], d.a)
      }
      ctx.globalCompositeOperation = 'source-over'
    }
  },
  {
    id: 'gradient',
    name: 'Gradient Flow',
    draw(ctx, p, w, h, pal) {
      const a = TAU * p
      const cx = w / 2
      const cy = h / 2
      const r = Math.hypot(w, h) / 2
      const g = ctx.createLinearGradient(cx - Math.cos(a) * r, cy - Math.sin(a) * r, cx + Math.cos(a) * r, cy + Math.sin(a) * r)
      g.addColorStop(0, pal.colors[0])
      g.addColorStop(0.5 + 0.15 * Math.sin(TAU * 2 * p), pal.colors[1])
      g.addColorStop(1, pal.colors[2])
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = 'rgba(0,0,0,0.25)'
      ctx.fillRect(0, 0, w, h)
    }
  },
  {
    id: 'cross',
    name: 'Cross Glow',
    draw(ctx, p, w, h, pal) {
      baseGradient(ctx, w, h, pal)
      const cx = w / 2
      const cy = h * 0.46
      const s = h / 1080
      const pulse = 0.5 + 0.5 * Math.sin(TAU * p)
      ctx.globalCompositeOperation = 'lighter'
      softDot(ctx, cx, cy, h * (0.42 + 0.05 * pulse), pal.colors[2], 0.22 + 0.12 * pulse)
      ctx.globalCompositeOperation = 'source-over'
      ctx.save()
      ctx.shadowColor = hexA(pal.colors[3], 0.9)
      ctx.shadowBlur = 40 * s + 30 * s * pulse
      ctx.fillStyle = hexA(pal.colors[3], 0.18 + 0.1 * pulse)
      const bw = 34 * s
      ctx.fillRect(cx - bw / 2, cy - 260 * s, bw, 560 * s)
      ctx.fillRect(cx - 170 * s, cy - 130 * s, 340 * s, bw)
      ctx.restore()
    }
  }
]

export const LOOP_SECONDS = 12

/**
 * Records a preset to a seamless WebM loop (real time: takes LOOP_SECONDS).
 * Returns the encoded bytes.
 */
export async function recordMotionLoop(preset: MotionPreset, palette: Palette, onProgress: (fraction: number) => void, width = 1920, height = 1080): Promise<Uint8Array> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) throw new Error('Canvas is not available')
  const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m))
  if (!mime) throw new Error('This system cannot record WebM video')
  const stream = canvas.captureStream(30)
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 })
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data)
  const done = new Promise<void>((resolve) => (recorder.onstop = () => resolve()))
  const total = LOOP_SECONDS * 1000
  preset.draw(ctx, 0, width, height, palette)
  recorder.start(250)
  const t0 = performance.now()
  await new Promise<void>((resolve) => {
    const frame = (): void => {
      const elapsed = performance.now() - t0
      if (elapsed >= total) {
        resolve()
        return
      }
      preset.draw(ctx, elapsed / total, width, height, palette)
      onProgress(elapsed / total)
      // A timer (not requestAnimationFrame) keeps recording even if the window is minimised.
      window.setTimeout(frame, 1000 / 30)
    }
    frame()
  })
  recorder.stop()
  stream.getTracks().forEach((t) => t.stop())
  await done
  onProgress(1)
  return new Uint8Array(await new Blob(chunks, { type: 'video/webm' }).arrayBuffer())
}

/** Renders one frame of a preset as a PNG still. */
export async function renderStill(preset: MotionPreset, palette: Palette, phase = 0.25, width = 1920, height = 1080): Promise<Uint8Array> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) throw new Error('Canvas is not available')
  preset.draw(ctx, phase, width, height, palette)
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'))
  if (!blob) throw new Error('Could not encode the image')
  return new Uint8Array(await blob.arrayBuffer())
}
