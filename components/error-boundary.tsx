'use client'

import { Component, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-6">
            <p className="font-semibold text-destructive mb-1">Something went wrong</p>
            <p className="text-sm text-muted-foreground">{this.state.error?.message ?? 'An unexpected error occurred.'}</p>
            <button
              onClick={() => this.setState({ hasError: false })}
              className="mt-3 rounded-lg border border-border bg-card px-3 py-1.5 text-sm hover:bg-muted"
            >
              Try again
            </button>
          </div>
        )
      )
    }
    return this.props.children
  }
}
