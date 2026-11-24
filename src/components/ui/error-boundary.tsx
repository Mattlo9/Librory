import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * Top-level React ErrorBoundary preventing corrupted localStorage/render state from causing
 * an unrecoverable white screen in the Tauri WebView.
 */
export class AppErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  override state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // Error handled cleanly by fallback UI without leaking sensitive details.
  }

  private handleResetPreferences = () => {
    try {
      window.localStorage.removeItem('librory-ui-v1');
      window.localStorage.removeItem('librory-pomodoro-v1');
      window.localStorage.removeItem('librory-epub-prefs-v1');
      window.localStorage.removeItem('librory-epub-scroll-v1');
    } catch {
      // Ignore storage failures.
    }
    window.location.reload();
  };

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center text-foreground">
          <div className="max-w-md space-y-2">
            <h1 className="text-base font-semibold tracking-tight">
              Ocurrió un error inesperado en la interfaz
            </h1>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Tu biblioteca y base de datos local siguen intactas. Puedes recargar
              la aplicación o restablecer las preferencias locales de la interfaz.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Recargar
            </button>
            <button
              type="button"
              onClick={this.handleResetPreferences}
              className="rounded-md border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
            >
              Restablecer preferencias
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
