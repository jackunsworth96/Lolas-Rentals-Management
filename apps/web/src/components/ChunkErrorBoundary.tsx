import { Component, type ErrorInfo, type ReactNode } from 'react';

const CHUNK_RELOAD_KEY = 'chunk_reload_attempted';

function isChunkLoadError(message: string): boolean {
  return (
    message.includes('dynamically imported module') ||
    message.includes('Loading chunk') ||
    message.includes('Loading CSS chunk') ||
    message.includes('Failed to fetch dynamically imported module')
  );
}

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Catches lazy-route / chunk load failures and reloads once per session
 * (stale caches after deploy). Other errors show a generic fallback.
 */
export class ChunkErrorBoundary extends Component<Props, State> {
  private clearFlagTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidMount() {
    // After a successful shell + lazy load, allow one auto-reload on the next stale chunk.
    this.clearFlagTimer = window.setTimeout(() => {
      try {
        sessionStorage.removeItem(CHUNK_RELOAD_KEY);
      } catch {
        /* ignore */
      }
      this.clearFlagTimer = undefined;
    }, 4000);
  }

  componentWillUnmount() {
    if (this.clearFlagTimer !== undefined) {
      window.clearTimeout(this.clearFlagTimer);
    }
  }

  componentDidUpdate(_prevProps: Props, prevState: State) {
    if (prevState.hasError && !this.state.hasError) {
      try {
        sessionStorage.removeItem(CHUNK_RELOAD_KEY);
      } catch {
        /* ignore */
      }
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const msg = error?.message ?? String(error);
    if (isChunkLoadError(msg)) {
      try {
        if (!sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
          sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
          window.location.reload();
          return;
        }
      } catch {
        /* fall through */
      }
    }
    console.error('ChunkErrorBoundary:', error, errorInfo);
  }

  render() {
    if (!this.state.hasError || !this.state.error) {
      return this.props.children;
    }

    const msg = this.state.error.message ?? '';

    if (isChunkLoadError(msg)) {
      let alreadyRetried = false;
      try {
        alreadyRetried = !!sessionStorage.getItem(CHUNK_RELOAD_KEY);
      } catch {
        alreadyRetried = false;
      }
      if (!alreadyRetried) {
        return (
          <div className="flex h-screen items-center justify-center bg-gray-50">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-teal-brand border-t-transparent" />
          </div>
        );
      }
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-50 p-6 text-center">
          <h2 className="text-lg font-semibold text-charcoal-brand">Could not load this page</h2>
          <p className="max-w-md text-sm text-charcoal-brand/70">
            A reload was already tried. Please refresh the page or clear your cache, then try again.
          </p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: null })}
            className="rounded-lg bg-teal-brand px-4 py-2 text-sm font-medium text-white hover:bg-teal-brand/90"
          >
            Try again
          </button>
        </div>
      );
    }

    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6">
        <h2 className="text-lg font-semibold text-red-800">Something went wrong</h2>
        <p className="mt-2 text-sm text-red-700">{this.state.error.message}</p>
        <button
          type="button"
          onClick={() => this.setState({ hasError: false, error: null })}
          className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700"
        >
          Try again
        </button>
      </div>
    );
  }
}
