import { createElement, useEffect, useState, type ReactElement } from 'react'
import type { AppInfo } from '@shared/ipc'
import { allCommands, formatCombo, keysFor, type CommandCategory } from '../../services/commands'
import { dialogs } from '../../store/overlayStore'
import { LogoMark } from './LogoMark'

const ORDER: CommandCategory[] = ['Live', 'Media', 'File', 'Edit', 'Library', 'Slides', 'View', 'Help']

function ShortcutList(): ReactElement {
  const commands = allCommands().filter((c) => keysFor(c.id).length > 0)
  return (
    <div className="modal-body shortcut-list">
      {ORDER.map((cat) => {
        const list = commands.filter((c) => c.category === cat)
        if (list.length === 0) return null
        return (
          <section key={cat}>
            <h4>{cat}</h4>
            {list.map((c) => (
              <div key={c.id} className="shortcut-row">
                <span>{c.label}</span>
                <span className="shortcut-keys">
                  {keysFor(c.id).map((k) => (
                    <span key={k} className="kbd">
                      {formatCombo(k)}
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </section>
        )
      })}
      <p className="muted">Change any shortcut in Settings → Shortcuts.</p>
    </div>
  )
}

export function showShortcuts(): void {
  void dialogs.custom({ title: 'Keyboard Shortcuts', width: 520, render: () => createElement(ShortcutList) })
}

function About(): ReactElement {
  return (
    <div className="modal-body about">
      <LogoMark size={44} />
      <h2>BHCF Presenter</h2>
      <p className="muted">Live presentation and media software for churches, conferences and events.</p>
      <AboutVersion />
    </div>
  )
}

function AboutVersion(): ReactElement {
  const info = useAppInfo()
  return <p className="muted">{info ? `Version ${info.version} · Electron ${info.electronVersion}` : ' '}</p>
}

function useAppInfo(): AppInfo | null {
  const [info, setInfo] = useState<AppInfo | null>(null)
  useEffect(() => {
    void window.bhcf.app.info().then(setInfo)
  }, [])
  return info
}

export function showAbout(): void {
  void dialogs.custom({ title: 'About', width: 380, render: () => createElement(About) })
}
