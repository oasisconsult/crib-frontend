/**
 * Centralized logging service for the application.
 * 
 * Features:
 * - Environment-aware logging (development vs production)
 * - Structured logging with context
 * - Error tracking integration ready
 * - Performance monitoring hooks
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

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
  private isDevelopment = process.env.NODE_ENV === 'development';
  private isTest = process.env.NODE_ENV === 'test';

  private formatMessage(entry: LogEntry): string {
    const { level, message, timestamp, context } = entry;
    const contextStr = context ? ` [${JSON.stringify(context)}]` : '';
    return `[${timestamp}] ${level.toUpperCase()}: ${message}${contextStr}`;
  }

  private createLogEntry(level: LogLevel, message: string, context?: LogContext, error?: Error): LogEntry {
    return {
      level,
      message,
      timestamp: new Date().toISOString(),
      context,
      error,
    };
  }

  private log(level: LogLevel, message: string, context?: LogContext, error?: Error): void {
    const entry = this.createLogEntry(level, message, context, error);
    
    if (this.isTest) return; // Don't log in tests

    if (this.isDevelopment) {
      // Development: console logging with colors
      const formattedMessage = this.formatMessage(entry);
      
      switch (level) {
        case 'debug':
          console.debug(formattedMessage, error || '');
          break;
        case 'info':
          console.info(formattedMessage, error || '');
          break;
        case 'warn':
          console.warn(formattedMessage, error || '');
          break;
        case 'error':
          console.error(formattedMessage, error || '');
          break;
      }
    } else {
      // Production: Send to logging service (e.g., Sentry, LogRocket, etc.)
      this.sendToLoggingService(entry);
    }
  }

  private sendToLoggingService(entry: LogEntry): void {
    // Integration point for error tracking services
    // Example: Sentry.captureException, LogRocket.captureException, etc.
    
    if (entry.level === 'error' && entry.error) {
      // Send error to monitoring service
      // Sentry.captureException(entry.error, { extra: entry.context });
    }
    
    // Send structured logs to logging service
    // This could be an API call to your logging endpoint
    try {
      // Example: fetch('/api/logs', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(entry)
      // });
    } catch {
      // Fail silently to avoid infinite loops
    }
  }

  // Public API methods
  debug(message: string, context?: LogContext): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log('warn', message, context);
  }

  error(message: string, error?: Error, context?: LogContext): void {
    this.log('error', message, context, error);
  }

  // Specialized logging methods
  auth(action: string, userId?: string, context?: LogContext): void {
    this.info(`Auth: ${action}`, { ...context, userId, action: `auth.${action}` });
  }

  api(method: string, url: string, status?: number, context?: LogContext): void {
    const message = `API: ${method} ${url}${status ? ` (${status})` : ''}`;
    const level = status && status >= 400 ? 'error' : 'info';
    this.log(level, message, { ...context, method, url, status });
  }

  performance(operation: string, duration: number, context?: LogContext): void {
    this.info(`Performance: ${operation} took ${duration}ms`, { ...context, operation, duration });
  }

  user(action: string, userId?: string, context?: LogContext): void {
    this.info(`User: ${action}`, { ...context, userId, action: `user.${action}` });
  }

  // Utility method for measuring performance
  measure<T>(operation: string, fn: () => T, context?: LogContext): T {
    const start = performance.now();
    try {
      const result = fn();
      const duration = performance.now() - start;
      this.performance(operation, duration, context);
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      this.error(`Performance: ${operation} failed after ${duration}ms`, error as Error, { ...context, operation, duration });
      throw error;
    }
  }

  // Async version of measure
  async measureAsync<T>(operation: string, fn: () => Promise<T>, context?: LogContext): Promise<T> {
    const start = performance.now();
    try {
      const result = await fn();
      const duration = performance.now() - start;
      this.performance(operation, duration, context);
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      this.error(`Performance: ${operation} failed after ${duration}ms`, error as Error, { ...context, operation, duration });
      throw error;
    }
  }
}

// Export singleton instance
export const logger = new Logger();

// Export convenience functions for backward compatibility
export const log = {
  debug: (message: string, context?: LogContext) => logger.debug(message, context),
  info: (message: string, context?: LogContext) => logger.info(message, context),
  warn: (message: string, context?: LogContext) => logger.warn(message, context),
  error: (message: string, error?: Error, context?: LogContext) => logger.error(message, error, context),
  auth: (action: string, userId?: string, context?: LogContext) => logger.auth(action, userId, context),
  api: (method: string, url: string, status?: number, context?: LogContext) => logger.api(method, url, status, context),
  performance: (operation: string, duration: number, context?: LogContext) => logger.performance(operation, duration, context),
  user: (action: string, userId?: string, context?: LogContext) => logger.user(action, userId, context),
  measure: <T>(operation: string, fn: () => T, context?: LogContext) => logger.measure(operation, fn, context),
  measureAsync: <T>(operation: string, fn: () => Promise<T>, context?: LogContext) => logger.measureAsync(operation, fn, context),
};
