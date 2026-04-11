import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { ErrorBoundary } from "../ErrorBoundary";

// Mock the logger
vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
  },
}));

describe("ErrorBoundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders children when there is no error", () => {
    const ThrowError = () => <div>No error</div>;

    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText("No error")).toBeInTheDocument();
  });

  it("catches and displays error information", () => {
    const ThrowError = () => {
      throw new Error("Test error");
    };

    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    expect(screen.getByText(/an unexpected error occurred/i)).toBeInTheDocument();
    expect(screen.getByText(/error id: err_/)).toBeInTheDocument();
  });

  it("displays custom title and description when provided", () => {
    const ThrowError = () => {
      throw new Error("Test error");
    };

    render(
      <ErrorBoundary 
        title="Custom Error Title"
        description="Custom error description"
      >
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText("Custom Error Title")).toBeInTheDocument();
    expect(screen.getByText("Custom error description")).toBeInTheDocument();
  });

  it("shows retry and home buttons by default", () => {
    const ThrowError = () => {
      throw new Error("Test error");
    };

    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /go home/i })).toBeInTheDocument();
  });

  it("hides retry button when showRetry is false", () => {
    const ThrowError = () => {
      throw new Error("Test error");
    };

    render(
      <ErrorBoundary showRetry={false}>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.queryByRole("button", { name: /try again/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /go home/i })).toBeInTheDocument();
  });

  it("hides home button when showHome is false", () => {
    const ThrowError = () => {
      throw new Error("Test error");
    };

    render(
      <ErrorBoundary showHome={false}>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /go home/i })).not.toBeInTheDocument();
  });

  it("renders custom fallback when provided", () => {
    const ThrowError = () => {
      throw new Error("Test error");
    };

    const CustomFallback = () => <div>Custom error fallback</div>;

    render(
      <ErrorBoundary fallback={<CustomFallback />}>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText("Custom error fallback")).toBeInTheDocument();
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
  });

  it("calls onError prop when error occurs", () => {
    const onError = vi.fn();
    const ThrowError = () => {
      throw new Error("Test error");
    };

    render(
      <ErrorBoundary onError={onError}>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(onError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        componentStack: expect.any(String),
      })
    );
  });

  it("logs error to logger service", () => {
    const { logger } = require("@/lib/logger");
    const ThrowError = () => {
      throw new Error("Test error");
    };

    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(logger.error).toHaveBeenCalledWith(
      "React Error Boundary caught an error",
      expect.any(Error),
      expect.objectContaining({
        componentStack: expect.any(String),
        errorBoundary: true,
        errorId: expect.stringMatching(/^err_\d+_[a-z0-9]+$/),
      })
    );
  });

  it("retry button resets error state", () => {
    const ThrowError = () => {
      throw new Error("Test error");
    };

    const { rerender } = render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    // Initially shows error
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();

    // Click retry
    const retryButton = screen.getByRole("button", { name: /try again/i });
    fireEvent.click(retryButton);

    // Rerender with non-throwing component
    rerender(
      <ErrorBoundary>
        <div>No error</div>
      </ErrorBoundary>
    );

    expect(screen.getByText("No error")).toBeInTheDocument();
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
  });

  it("shows error details in development mode", () => {
    vi.stubEnv("NODE_ENV", "development");

    const ThrowError = () => {
      throw new Error("Test error");
    };

    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText(/error details \(development only\)/i)).toBeInTheDocument();

    vi.unstubAllEnvs();
  });

  it("does not show error details in production mode", () => {
    vi.stubEnv("NODE_ENV", "production");

    const ThrowError = () => {
      throw new Error("Test error");
    };

    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.queryByText(/error details \(development only\)/i)).not.toBeInTheDocument();

    vi.unstubAllEnvs();
  });
});
