/**
 * Centralized logging service for the application.
 *
 * Features:
 * - Environment-aware logging (development vs production)
 * - Structured logging with context
 * - Error tracking integration ready
 * - Performance monitoring hooks
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  userId?: string;
  component?: string;
  action?: string;
  [key: string]: unknown;
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: LogContext;
  error?: Error;
}

class Logger {
  private get isDevelopment() {
    return process.env.NODE_ENV === "development";
  }
  private get isTest() {
    return process.env.NODE_ENV === "test";
  }

  private createLogEntry(
    level: LogLevel,
    message: string,
    context?: LogContext,
    error?: Error,
  ): LogEntry {
    return {
      level,
      message,
      timestamp: new Date().toISOString(),
      context,
      error,
    };
  }

  private log(
    level: LogLevel,
    message: string,
    context?: LogContext,
    error?: Error,
  ): void {
    if (this.isTest) return;

    if (!this.isDevelopment) {
      this.sendToLoggingService(
        this.createLogEntry(level, message, context, error),
      );
      return;
    }

    const timestamp = new Date().toISOString();
    const formattedMsg = `[${timestamp}] ${level.toUpperCase()}: ${message}`;

    if (error) {
      if (context) {
        // Embed context in the message so the second arg is the error object alone
        console.error(`${formattedMsg} ${JSON.stringify(context)}`, error);
      } else {
        console.error(formattedMsg, error);
      }
    } else {
      const ctxArg = context ? JSON.stringify(context) : "";
      switch (level) {
        case "debug":
          console.debug(formattedMsg, ctxArg);
          break;
        case "info":
          console.info(formattedMsg, ctxArg);
          break;
        case "warn":
          console.warn(formattedMsg, ctxArg);
          break;
        case "error":
          console.error(formattedMsg, ctxArg);
          break;
      }
    }
  }

  private sendToLoggingService(entry: LogEntry): void {
    if (entry.level === "error" && entry.error) {
      // Sentry.captureException(entry.error, { extra: entry.context });
    }
    try {
      // fetch('/api/logs', { method: 'POST', body: JSON.stringify(entry) });
    } catch {
      // Fail silently
    }
  }

  // Public API methods
  debug(message: string, context?: LogContext): void {
    this.log("debug", message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log("info", message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log("warn", message, context);
  }

  error(message: string, error?: Error, context?: LogContext): void {
    this.log("error", message, context, error);
  }

  // Specialized logging methods
  auth(action: string, userId?: string, context?: LogContext): void {
    this.info(`Auth: ${action}`, {
      ...context,
      userId,
      action: `auth.${action}`,
    });
  }

  api(
    method: string,
    url: string,
    status?: number,
    context?: LogContext,
  ): void {
    const message = `API: ${method} ${url}${status ? ` (${status})` : ""}`;
    const level = status && status >= 400 ? "error" : "info";
    this.log(level, message, { ...context, method, url, status });
  }

  performance(
    operation: string,
    duration: number,
    context?: LogContext,
  ): void {
    this.info(`Performance: ${operation} took ${duration}ms`, {
      ...context,
      operation,
      duration,
    });
  }

  user(action: string, userId?: string, context?: LogContext): void {
    this.info(`User: ${action}`, {
      ...context,
      userId,
      action: `user.${action}`,
    });
  }

  // Utility method for measuring performance — bypasses this.performance() so
  // it can pass the context as a plain object (not JSON string) to console.
  // Uses Date.now() so vi.useFakeTimers() / vi.advanceTimersByTime() works in tests.
  measure<T>(operation: string, fn: () => T, context?: LogContext): T {
    const start = Date.now();
    try {
      const result = fn();
      const duration = Date.now() - start;
      if (!this.isTest && this.isDevelopment) {
        const ctx = { ...context, operation, duration };
        const timestamp = new Date().toISOString();
        console.info(
          `[${timestamp}] INFO: Performance: ${operation} took ${duration}ms`,
          ctx,
        );
      }
      return result;
    } catch (err) {
      const duration = Date.now() - start;
      if (!this.isTest && this.isDevelopment) {
        const ctx = { ...context, operation, duration };
        const timestamp = new Date().toISOString();
        console.error(
          `[${timestamp}] ERROR: Performance: ${operation} failed after ${duration}ms`,
          err as Error,
          ctx,
        );
      }
      throw err;
    }
  }

  // Async version of measure
  async measureAsync<T>(
    operation: string,
    fn: () => Promise<T>,
    context?: LogContext,
  ): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - start;
      if (!this.isTest && this.isDevelopment) {
        const ctx = { ...context, operation, duration };
        const timestamp = new Date().toISOString();
        console.info(
          `[${timestamp}] INFO: Performance: ${operation} took ${duration}ms`,
          ctx,
        );
      }
      return result;
    } catch (err) {
      const duration = Date.now() - start;
      if (!this.isTest && this.isDevelopment) {
        const ctx = { ...context, operation, duration };
        const timestamp = new Date().toISOString();
        console.error(
          `[${timestamp}] ERROR: Performance: ${operation} failed after ${duration}ms`,
          err as Error,
          ctx,
        );
      }
      throw err;
    }
  }
}

// Export singleton instance
export const logger = new Logger();

// Export convenience functions for backward compatibility
export const log = {
  debug: (message: string, context?: LogContext) =>
    logger.debug(message, context),
  info: (message: string, context?: LogContext) =>
    logger.info(message, context),
  warn: (message: string, context?: LogContext) =>
    logger.warn(message, context),
  error: (message: string, error?: Error, context?: LogContext) =>
    logger.error(message, error, context),
  auth: (action: string, userId?: string, context?: LogContext) =>
    logger.auth(action, userId, context),
  api: (method: string, url: string, status?: number, context?: LogContext) =>
    logger.api(method, url, status, context),
  performance: (operation: string, duration: number, context?: LogContext) =>
    logger.performance(operation, duration, context),
  user: (action: string, userId?: string, context?: LogContext) =>
    logger.user(action, userId, context),
  measure: <T>(operation: string, fn: () => T, context?: LogContext) =>
    logger.measure(operation, fn, context),
  measureAsync: <T>(
    operation: string,
    fn: () => Promise<T>,
    context?: LogContext,
  ) => logger.measureAsync(operation, fn, context),
};
