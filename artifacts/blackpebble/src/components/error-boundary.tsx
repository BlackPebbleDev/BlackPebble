import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  /** Headline shown in the error state. */
  title?: string;
  /** Supporting copy shown under the headline. */
  description?: string;
  /** Label for the retry button. */
  retryLabel?: string;
  /**
   * Full-screen variant for the app-root boundary. When false (default), the
   * boundary renders an inline card that keeps the surrounding layout alive.
   */
  fullScreen?: boolean;
  /**
   * Fired before the boundary clears its error and re-renders its children.
   * Use it to reset any external state (e.g. an in-progress scan) so retrying
   * starts from a clean slate instead of immediately re-throwing.
   */
  onReset?: () => void;
}

interface State {
  error: Error | null;
}

/**
 * Catches render-time exceptions in its subtree and shows a premium error
 * state with a retry action, instead of letting the crash unmount the whole
 * React tree (which would leave an empty #root - a plain black screen).
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface the crash in the console for debugging without taking down the UI.
    console.error(
      "ErrorBoundary caught a render error:",
      error,
      info.componentStack,
    );
  }

  private handleRetry = (): void => {
    try {
      this.props.onReset?.();
    } finally {
      this.setState({ error: null });
    }
  };

  render(): ReactNode {
    if (!this.state.error) return this.props.children;

    const {
      title = "Something went wrong",
      description = "An unexpected error interrupted this view. Your funds and data are safe - nothing was changed.",
      retryLabel = "Try again",
      fullScreen = false,
    } = this.props;

    const card = (
      <div
        className="rounded-xl bg-card shadow-card p-8 text-center space-y-4 max-w-md mx-auto w-full"
        data-testid="error-boundary"
        role="alert"
      >
        <div className="w-12 h-12 rounded-full bg-destructive/12 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-6 h-6 text-danger" />
        </div>
        <div className="space-y-1.5">
          <div className="text-lg font-semibold">{title}</div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {description}
          </p>
        </div>
        <div className="flex justify-center">
          <Button
            onClick={this.handleRetry}
            className="rounded-2xl"
            data-testid="button-error-retry"
          >
            <RefreshCw className="w-4 h-4" />
            {retryLabel}
          </Button>
        </div>
      </div>
    );

    if (fullScreen) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background px-4 py-10">
          {card}
        </div>
      );
    }

    return <div className="px-4 py-6">{card}</div>;
  }
}
