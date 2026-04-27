import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}
interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: '#1a0010',
            color: '#ff6b6b',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 32,
            fontFamily: 'monospace',
            gap: 16,
            zIndex: 9999,
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 700 }}>React Error</div>
          <pre
            style={{ fontSize: 12, maxWidth: 600, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
          >
            {this.state.error.message}
            {'\n\n'}
            {this.state.error.stack}
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}
