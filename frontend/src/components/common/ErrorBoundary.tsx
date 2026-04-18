"use client";

import React from "react";
import { RefreshCw, Home } from "lucide-react";
import { logger } from "@/lib/logger";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  title?: string;
  description?: string;
  showRetry?: boolean;
  showHome?: boolean;
  onError?: (error: Error, info: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorId: string | null;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorId: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    const errorId = `err_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    return { hasError: true, error, errorId };
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (!this.state.hasError) return;
    if (prevProps.children === this.props.children) return;
    // Children changed — reset error state so the new children get a clean render
    const prevType = React.isValidElement(prevProps.children)
      ? prevProps.children.type
      : typeof prevProps.children;
    const nextType = React.isValidElement(this.props.children)
      ? this.props.children.type
      : typeof this.props.children;
    if (prevType !== nextType) {
      this.setState({ hasError: false, error: null, errorId: null });
    }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    const { errorId } = this.state;
    logger.error("React Error Boundary caught an error", error, {
      componentStack: info.componentStack,
      errorBoundary: true,
      errorId: errorId ?? undefined,
    });
    this.props.onError?.(error, info);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorId: null });
  };

  render() {
    const {
      children,
      fallback,
      title = "Something went wrong",
      description = "An unexpected error occurred. This has been logged and we'll look into it.",
      showRetry = true,
      showHome = true,
    } = this.props;
    const { hasError, errorId } = this.state;

    if (!hasError) return children;

    if (fallback) return fallback;

    return (
      <div className="flex min-h-[200px] items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="rounded-[6px] border bg-card text-card-foreground shadow-sm">
            <div className="flex flex-col space-y-1.5 p-6 text-center">
              <div className="flex justify-center">
                <svg
                  className="lucide lucide-triangle-alert h-12 w-12 text-destructive"
                  fill="none"
                  height="24"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  width="24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
                  <path d="M12 9v4" />
                  <path d="M12 17h.01" />
                </svg>
              </div>
              <h3 className="font-semibold leading-none tracking-tight mt-4">
                {title}
              </h3>
            </div>
            <div className="p-6 pt-0 space-y-4 text-center">
              <p className="text-sm text-muted-foreground">{description}</p>
              {errorId && (
                <p className="text-xs text-muted-foreground font-mono">
                  error id: {errorId}
                </p>
              )}
              <div className="flex gap-2 justify-center">
                {showRetry && (
                  <button
                    className="justify-center whitespace-nowrap font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow hover:bg-primary/90 active:scale-[0.98] h-8 rounded-[5px] px-3 text-xs flex items-center gap-2"
                    onClick={this.handleRetry}
                  >
                    <RefreshCw className="h-4 w-4" />
                    Try Again
                  </button>
                )}
                {showHome && (
                  <button
                    className="justify-center whitespace-nowrap font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-8 rounded-[5px] px-3 text-xs flex items-center gap-2"
                    onClick={() => (window.location.href = "/")}
                  >
                    <Home className="h-4 w-4" />
                    Go Home
                  </button>
                )}
              </div>
              {process.env.NODE_ENV === "development" && this.state.error && (
                <details className="text-left mt-4">
                  <summary className="text-xs cursor-pointer text-muted-foreground">
                    Error details (development only)
                  </summary>
                  <pre className="text-xs mt-2 p-2 bg-muted rounded overflow-auto">
                    {this.state.error.message}
                  </pre>
                </details>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }
}
