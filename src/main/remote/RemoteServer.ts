/**
 * Local-network remote control (phone / tablet / another computer's browser).
 *
 *   GET  /                  mobile web remote (single page)
 *   GET  /api/state         latest RemoteSnapshot           (PIN required)
 *   GET  /api/events        Server-Sent Events: "state"      (PIN required)
 *   POST /api/command       { command, args }                (PIN required)
 *
 * The PIN is sent as the "x-bhcf-pin" header or ?pin= query. Commands are validated against
 * a whitelist here and again by the operator window before anything happens.
 */
import { timingSafeEqual } from 'node:crypto'
import http, { type IncomingMessage, type ServerResponse } from 'node:http'
import os from 'node:os'
import type { RemoteCommand, RemoteConfig, RemoteSnapshot, RemoteStatus } from '../../shared/ipc'
import { log } from '../util/log'
import { REMOTE_PAGE } from './remotePage'

export const REMOTE_COMMANDS = new Set([
  'live.next',
  'live.prev',
  'live.black',
  'live.clear',
  'live.clearAll',
  'live.logo',
  'live.trigger',
  'media.toggle',
  'media.stop',
  'timer.start',
  'timer.pause',
  'timer.reset'
])

const MAX_BODY = 8 * 1024

export class RemoteServer {
  private server: http.Server | null = null
  private config: RemoteConfig = { enabled: false, port: 5719, pin: '0000' }
  private snapshot: RemoteSnapshot | null = null
  private clients = new Set<ServerResponse>()
  private error: string | null = null

  constructor(
    private readonly onCommand: (cmd: RemoteCommand) => void,
    private readonly onStatusChange: (status: RemoteStatus) => void
  ) {}

  status(): RemoteStatus {
    const urls: string[] = []
    if (this.server?.listening) {
      for (const list of Object.values(os.networkInterfaces())) {
        for (const ni of list ?? []) if (ni.family === 'IPv4' && !ni.internal) urls.push(`http://${ni.address}:${this.config.port}/`)
      }
      urls.push(`http://localhost:${this.config.port}/`)
    }
    return { ...this.config, running: !!this.server?.listening, urls, error: this.error, clients: this.clients.size }
  }

  async apply(config: RemoteConfig): Promise<RemoteStatus> {
    const restart = config.port !== this.config.port || config.enabled !== this.config.enabled
    this.config = config
    if (restart || !config.enabled) await this.stop()
    if (config.enabled && !this.server) await this.start()
    this.onStatusChange(this.status())
    return this.status()
  }

  publish(snapshot: RemoteSnapshot): void {
    this.snapshot = snapshot
    const payload = `event: state\ndata: ${JSON.stringify(snapshot)}\n\n`
    for (const res of this.clients) res.write(payload)
  }

  private start(): Promise<void> {
    this.error = null
    const server = http.createServer((req, res) => {
      this.handle(req, res).catch((err: unknown) => {
        log('error', 'Remote request failed', err)
        if (!res.headersSent) this.json(res, 500, { error: 'Internal error' })
      })
    })
    return new Promise((resolve) => {
      server.once('error', (err: NodeJS.ErrnoException) => {
        this.error = err.code === 'EADDRINUSE' ? `Port ${this.config.port} is already in use.` : err.message
        log('warn', 'Remote server failed to start:', this.error)
        this.server = null
        resolve()
      })
      server.listen(this.config.port, '0.0.0.0', () => {
        this.server = server
        log('info', `Remote control listening on port ${this.config.port}`)
        resolve()
      })
    })
  }

  async stop(): Promise<void> {
    for (const res of this.clients) res.end()
    this.clients.clear()
    const s = this.server
    this.server = null
    if (s) await new Promise<void>((r) => s.close(() => r()))
  }

  private authorized(req: IncomingMessage, url: URL): boolean {
    const given = String(req.headers['x-bhcf-pin'] ?? url.searchParams.get('pin') ?? '')
    const a = Buffer.from(given.padEnd(16).slice(0, 16))
    const b = Buffer.from(this.config.pin.padEnd(16).slice(0, 16))
    return timingSafeEqual(a, b) && given === this.config.pin
  }

  private json(res: ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify(body))
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://remote.local')
    res.setHeader('X-Content-Type-Options', 'nosniff')

    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'",
        'Cache-Control': 'no-store'
      })
      res.end(REMOTE_PAGE)
      return
    }
    if (!url.pathname.startsWith('/api/')) return this.json(res, 404, { error: 'Not found' })
    if (!this.authorized(req, url)) return this.json(res, 401, { error: 'Wrong PIN' })

    if (req.method === 'GET' && url.pathname === '/api/state') return this.json(res, 200, this.snapshot)

    if (req.method === 'GET' && url.pathname === '/api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' })
      res.write(`retry: 2000\n\n`)
      if (this.snapshot) res.write(`event: state\ndata: ${JSON.stringify(this.snapshot)}\n\n`)
      this.clients.add(res)
      this.onStatusChange(this.status())
      const ping = setInterval(() => res.write(': ping\n\n'), 20_000)
      req.on('close', () => {
        clearInterval(ping)
        this.clients.delete(res)
        this.onStatusChange(this.status())
      })
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/command') {
      let size = 0
      const chunks: Buffer[] = []
      for await (const chunk of req) {
        size += (chunk as Buffer).length
        if (size > MAX_BODY) return this.json(res, 413, { error: 'Too large' })
        chunks.push(chunk as Buffer)
      }
      let body: RemoteCommand
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as RemoteCommand
      } catch {
        return this.json(res, 400, { error: 'Invalid JSON' })
      }
      if (!body || typeof body.command !== 'string' || !REMOTE_COMMANDS.has(body.command)) return this.json(res, 400, { error: 'Unknown command' })
      const args = body.args && typeof body.args === 'object' ? body.args : {}
      this.onCommand({ command: body.command, args })
      return this.json(res, 202, { ok: true })
    }
    return this.json(res, 404, { error: 'Not found' })
  }
}
