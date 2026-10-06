import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Panel-level boundary: a small inline message with a retry button */
  compact?: boolean
}

interface State {
  error: Error | null
}

/**
 * Contains rendering bugs. Panels use compact boundaries so one failing panel never takes
 * down the live operator view; project data is autosaved independently of the UI.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('UI error:', error, info.componentStack)
    window.bhcf?.app.log('error', `UI error: ${error.message}\n${info.componentStack ?? ''}`)
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children
    if (this.props.compact) {
      return (
        <div className="crash compact">
          <b>This panel hit a problem.</b>
          <span className="muted">{this.state.error.message}</span>
          <button className="btn" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
        </div>
      )
    }
    return (
      <div className="crash">
        <h2>Something went wrong in the interface</h2>
        <p>Your project is saved automatically. Reload the window to continue where you left off.</p>
        <pre>{this.state.error.message}</pre>
        <button className="btn primary" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    )
  }
}
