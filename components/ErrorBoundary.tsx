'use client';

import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCcw, RotateCcw } from 'lucide-react';

// React error boundaries can only be implemented as class components — the
// `componentDidCatch` lifecycle has no hooks equivalent, even with React 19.
// Hence the class. The boundary catches *render-time* errors (and effects'
// commit phase) inside its descendants; it does NOT catch async errors
// (uncaught promise rejections) or event-handler errors. Those need their
// own try/catch + setState pattern.

interface Props {
  children: ReactNode;
  /**
   * Optional override for the fallback UI. Receives the caught error and a
   * `reset` callback that clears the boundary's error state (re-mounting
   * children). Most call sites should leave this unset and use the default.
   */
  fallback?: (args: { error: Error; reset: () => void }) => ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface the failure in the console with full component-stack context.
    // Replace this with a structured logger / Sentry call when one exists.
    console.error('[ErrorBoundary] caught render error', {
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
    });
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) {
      return this.props.fallback({ error, reset: this.reset });
    }

    // Default fallback: contained inside the layout's content slot, so the
    // navbar above stays usable. Two recovery actions:
    //   • Try again — clears the boundary state and re-mounts children.
    //     Useful for transient failures (a stale render, a momentary fetch
    //     hiccup that crashed a derived state).
    //   • Reload — full page refresh. Last-resort for failures that re-throw
    //     immediately on re-render (corrupt state, broken localStorage).
    return (
      <div className='h-full overflow-y-auto px-6 py-12'>
        <div className='max-w-xl mx-auto surface-card border border-app rounded-lg p-6'>
          <div className='flex items-start gap-3 mb-4'>
            <AlertTriangle
              size={20}
              className='flex-shrink-0 mt-0.5 text-warning'
            />
            <div className='flex-1 min-w-0'>
              <h2 className='text-base font-semibold text-app mb-1'>
                Something went wrong
              </h2>
              <p className='text-sm text-app-muted'>
                Paperazzi hit an unexpected error rendering this page. Your
                pinned papers and saved filters are unaffected.
              </p>
            </div>
          </div>

          {process.env.NODE_ENV !== 'production' && (
            <details className='mb-4'>
              <summary className='cursor-pointer text-xs text-app-soft hover:text-app select-none'>
                Error details (development only)
              </summary>
              <pre className='surface-subtle rounded p-2 mt-2 text-[11px] overflow-x-auto whitespace-pre-wrap'>
                {error.message}
                {error.stack ? '\n\n' + error.stack : ''}
              </pre>
            </details>
          )}

          <div className='flex flex-wrap gap-2'>
            <button
              type='button'
              onClick={this.reset}
              className='inline-flex items-center gap-1.5 surface-subtle border border-app rounded px-3 py-1.5 text-sm text-app hover:bg-[var(--surface-muted)] transition'
            >
              <RotateCcw size={14} />
              Try again
            </button>
            <button
              type='button'
              onClick={() => window.location.reload()}
              className='inline-flex items-center gap-1.5 surface-subtle border border-app rounded px-3 py-1.5 text-sm text-app hover:bg-[var(--surface-muted)] transition'
            >
              <RefreshCcw size={14} />
              Reload page
            </button>
          </div>
        </div>
      </div>
    );
  }
}
