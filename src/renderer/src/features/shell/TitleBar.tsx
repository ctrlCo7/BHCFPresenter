import type { ReactElement } from 'react'
import { useProjectStore } from '../../store/projectStore'
import { LogoMark } from './LogoMark'
import { MenuBar } from './MenuBar'

/** Window title bar: logo, menus and the project name (the controls live in the toolbar below). */
export function TitleBar({ platform, isDev }: { platform: string; isDev: boolean }): ReactElement {
  const projectName = useProjectStore((s) => s.project?.name ?? null)

  return (
    <header className={`titlebar platform-${platform}`}>
      <div className="titlebar-left">
        <span className="titlebar-logo">
          <LogoMark size={20} badge />
        </span>
        <MenuBar isDev={isDev} />
      </div>
      <div className="titlebar-title">{projectName ? `${projectName} — BHCF Presenter` : 'BHCF Presenter'}</div>
    </header>
  )
}
