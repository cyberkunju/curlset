import React from 'react';

export interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Optional short label describing the wrapped area, e.g. "Annotation Workbench". */
  scope?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
  componentStack: string | null;
}

/**
 * App-level render-error containment.
 *
 * A contract drift between the web client and the API must never blank the whole
 * application. This boundary catches render/lifecycle errors in its subtree,
 * shows a sober recovery screen, and keeps the shell usable.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Keep the stack for the on-screen details panel and the browser console.
    this.setState({ componentStack: info.componentStack ?? null });
    // eslint-disable-next-line no-console
    console.error('Unhandled UI render error', error, info);
  }

  private reset = (): void => {
    this.setState({ error: null, componentStack: null });
  };

  private goToProjects = (): void => {
    this.reset();
    window.location.hash = 'projects';
  };

  render(): React.ReactNode {
    const { error, componentStack } = this.state;
    if (!error) {
      return this.props.children;
    }

    const scopeLabel = this.props.scope ? ` (${this.props.scope})` : '';

    return (
      <div
        role="alert"
        style={{
          minHeight: '60vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem 1.25rem',
          background: 'var(--bg-canvas)',
          color: 'var(--text-primary)',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: '680px',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-hairline)',
            borderRadius: 'var(--radius-md)',
            padding: '1.5rem',
          }}
        >
          <h1 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>
            This view could not be rendered{scopeLabel}
          </h1>
          <p style={{ margin: '0.5rem 0 1rem', fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            A UI error was caught before it could affect the rest of the application. No data was written.
            You can retry the view, reload the page, or return to the project list.
          </p>

          <div
            style={{
              padding: '0.65rem 0.85rem',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-hairline)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.78rem',
              color: 'var(--text-secondary)',
              wordBreak: 'break-word',
              marginBottom: '1rem',
            }}
          >
            {error.name}: {error.message || 'Unknown error'}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            <button type="button" className="btn btn-primary" onClick={this.reset} style={{ padding: '0.4rem 0.85rem' }}>
              Retry view
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={this.goToProjects}
              style={{ padding: '0.4rem 0.85rem' }}
            >
              Back to Projects
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => window.location.reload()}
              style={{ padding: '0.4rem 0.85rem' }}
            >
              Reload page
            </button>
          </div>

          {componentStack && (
            <details style={{ marginTop: '1rem' }}>
              <summary style={{ cursor: 'pointer', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Component stack (for bug reports)
              </summary>
              <pre
                style={{
                  marginTop: '0.5rem',
                  maxHeight: '200px',
                  overflow: 'auto',
                  padding: '0.6rem',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-canvas)',
                  border: '1px solid var(--border-hairline)',
                  fontSize: '0.7rem',
                  color: 'var(--text-muted)',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {componentStack}
              </pre>
            </details>
          )}
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
