import type { ReactElement, ReactNode } from 'react'
import './ui.css'

export function PanelHeader({
  title,
  icon,
  children,
  onToggle,
  collapsed
}: {
  title: ReactNode
  icon?: ReactNode
  children?: ReactNode
  onToggle?: () => void
  collapsed?: boolean
}): ReactElement {
  return (
    <div className={`panel-header${onToggle ? ' toggleable' : ''}`} onDoubleClick={onToggle}>
      {icon && <span className="panel-header-icon">{icon}</span>}
      <span className="panel-title" data-collapsed={collapsed ? '' : undefined}>
        {title}
      </span>
      <div className="panel-actions" onDoubleClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

export function IconButton({
  icon,
  title,
  onClick,
  active,
  disabled,
  className
}: {
  icon: ReactNode
  title: string
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void
  active?: boolean
  disabled?: boolean
  className?: string
}): ReactElement {
  return (
    <button
      type="button"
      className={`icon-btn${active ? ' active' : ''}${className ? ` ${className}` : ''}`}
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
    </button>
  )
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }): ReactElement {
  return (
    <div className="empty-state">
      {icon}
      <h3>{title}</h3>
      {children}
    </div>
  )
}
