/**
 * Performance monitoring system for tracking application metrics
 * 
 * Features:
 * - Core Web Vitals monitoring
 * - Component render performance
 * - API response times
 * - Memory usage tracking
 * - User interaction metrics
 */

export interface PerformanceMetric {
  name: string;
  value: number;
  unit: string;
  timestamp: number;
  context?: Record<string, unknown>;
}

export interface CoreWebVitals {
  lcp?: number; // Largest Contentful Paint
  fid?: number; // First Input Delay
  cls?: number; // Cumulative Layout Shift
  fcp?: number; // First Contentful Paint
  ttfb?: number; // Time to First Byte
}

class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private observers: PerformanceObserver[] = [];
  private isSupported = typeof window !== 'undefined' && 'performance' in window;

  constructor() {
    if (this.isSupported) {
      this.initializeObservers();
    }
  }

  private initializeObservers() {
    try {
      // Core Web Vitals
      this.observeLCP();
      this.observeFID();
      this.observeCLS();
      this.observeFCP();
      this.observeTTFB();
    } catch (error) {
      console.warn('Performance monitoring initialization failed:', error);
    }
  }

  private observeLCP() {
    if (!('PerformanceObserver' in window)) return;

    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const lastEntry = entries[entries.length - 1];
      if (lastEntry) {
        this.recordMetric('LCP', lastEntry.startTime, 'ms', {
          element: (lastEntry as any).element?.tagName || 'unknown',
          url: (lastEntry as any).url || window.location.href
        });
      }
    });

    observer.observe({ entryTypes: ['largest-contentful-paint'] });
    this.observers.push(observer);
  }

  private observeFID() {
    if (!('PerformanceObserver' in window)) return;

    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      entries.forEach((entry) => {
        if (entry.name === 'first-input') {
          this.recordMetric('FID', (entry as any).processingStart - entry.startTime, 'ms', {
            inputType: (entry as any).name
          });
        }
      });
    });

    observer.observe({ entryTypes: ['first-input'] });
    this.observers.push(observer);
  }

  private observeCLS() {
    if (!('PerformanceObserver' in window)) return;

    let clsValue = 0;
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      entries.forEach((entry) => {
        if (!(entry as any).hadRecentInput) {
          clsValue += (entry as any).value;
          this.recordMetric('CLS', clsValue, 'score', {
            cumulative: true
          });
        }
      });
    });

    observer.observe({ entryTypes: ['layout-shift'] });
    this.observers.push(observer);
  }

  private observeFCP() {
    if (!('PerformanceObserver' in window)) return;

    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const fcpEntry = entries.find(entry => entry.name === 'first-contentful-paint');
      if (fcpEntry) {
        this.recordMetric('FCP', fcpEntry.startTime, 'ms');
      }
    });

    observer.observe({ entryTypes: ['paint'] });
    this.observers.push(observer);
  }

  private observeTTFB() {
    if (!('PerformanceObserver' in window)) return;

    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const navigationEntry = entries.find(entry => entry.entryType === 'navigation');
      if (navigationEntry) {
        const ttfb = (navigationEntry as any).responseStart - (navigationEntry as any).requestStart;
        this.recordMetric('TTFB', ttfb, 'ms');
      }
    });

    observer.observe({ entryTypes: ['navigation'] });
    this.observers.push(observer);
  }

  recordMetric(name: string, value: number, unit: string, context?: Record<string, unknown>) {
    const metric: PerformanceMetric = {
      name,
      value,
      unit,
      timestamp: Date.now(),
      context
    };

    this.metrics.push(metric);
    
    // Send to logging service
    if (typeof window !== 'undefined' && (window as any).logger) {
      (window as any).logger.performance(name, value, context);
    }

    // In production, send to analytics service
    if (process.env.NODE_ENV === 'production') {
      this.sendToAnalytics(metric);
    }
  }

  private sendToAnalytics(metric: PerformanceMetric) {
    // Integration point for analytics services
    // Example: Google Analytics, DataDog, New Relic, etc.
    try {
      // Example for Google Analytics 4
      if ((window as any).gtag) {
        (window as any).gtag('event', 'performance_metric', {
          metric_name: metric.name,
          metric_value: metric.value,
          metric_unit: metric.unit,
          custom_parameters: metric.context
        });
      }
    } catch (error) {
      // Fail silently to avoid performance issues
    }
  }

  // Component performance measurement
  measureComponent<T>(name: string, renderFn: () => T): T {
    const start = performance.now();
    const result = renderFn();
    const duration = performance.now() - start;
    
    this.recordMetric(`component_${name}`, duration, 'ms', {
      type: 'render'
    });
    
    return result;
  }

  // API performance measurement
  measureApiCall(url: string, method: string, apiCall: () => Promise<any>): Promise<any> {
    const start = performance.now();
    
    return apiCall().then(
      (result) => {
        const duration = performance.now() - start;
        this.recordMetric(`api_${method.toLowerCase()}`, duration, 'ms', {
          url,
          status: 'success'
        });
        return result;
      },
      (error) => {
        const duration = performance.now() - start;
        this.recordMetric(`api_${method.toLowerCase()}`, duration, 'ms', {
          url,
          status: 'error',
          error: error.message
        });
        throw error;
      }
    );
  }

  // Memory usage tracking
  getMemoryUsage() {
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      this.recordMetric('memory_used', memory.usedJSHeapSize, 'bytes', {
        total: memory.totalJSHeapSize,
        limit: memory.jsHeapSizeLimit
      });
      
      return {
        used: memory.usedJSHeapSize,
        total: memory.totalJSHeapSize,
        limit: memory.jsHeapSizeLimit
      };
    }
    return null;
  }

  // User interaction timing
  measureInteraction(name: string, interactionFn: () => void | Promise<void>) {
    const start = performance.now();
    
    const result = interactionFn();
    
    if (result instanceof Promise) {
      return result.then(() => {
        const duration = performance.now() - start;
        this.recordMetric(`interaction_${name}`, duration, 'ms');
      });
    } else {
      const duration = performance.now() - start;
      this.recordMetric(`interaction_${name}`, duration, 'ms');
    }
  }

  // Get current metrics
  getMetrics(): PerformanceMetric[] {
    return [...this.metrics];
  }

  // Get Core Web Vitals summary
  getCoreWebVitals(): CoreWebVitals {
    const vitals: CoreWebVitals = {};
    
    this.metrics.forEach(metric => {
      switch (metric.name) {
        case 'LCP':
          vitals.lcp = metric.value;
          break;
        case 'FID':
          vitals.fid = metric.value;
          break;
        case 'CLS':
          vitals.cls = metric.value;
          break;
        case 'FCP':
          vitals.fcp = metric.value;
          break;
        case 'TTFB':
          vitals.ttfb = metric.value;
          break;
      }
    });
    
    return vitals;
  }

  // Clear metrics
  clearMetrics() {
    this.metrics = [];
  }

  // Cleanup observers
  destroy() {
    this.observers.forEach(observer => observer.disconnect());
    this.observers = [];
  }
}

// Export singleton instance
export const performanceMonitor = new PerformanceMonitor();

// Export convenience functions
export const measureComponent = <T>(name: string, renderFn: () => T) => 
  performanceMonitor.measureComponent(name, renderFn);

export const measureApiCall = (url: string, method: string, apiCall: () => Promise<any>) =>
  performanceMonitor.measureApiCall(url, method, apiCall);

export const measureInteraction = (name: string, interactionFn: () => void | Promise<void>) =>
  performanceMonitor.measureInteraction(name, interactionFn);

export const getMemoryUsage = () => performanceMonitor.getMemoryUsage();

// React hook for performance monitoring
export function usePerformanceMonitor(componentName: string) {
  const measureRender = <T>(renderFn: () => T) => 
    performanceMonitor.measureComponent(componentName, renderFn);

  return {
    measureRender,
    recordMetric: performanceMonitor.recordMetric.bind(performanceMonitor),
    getMetrics: performanceMonitor.getMetrics.bind(performanceMonitor),
    getCoreWebVitals: performanceMonitor.getCoreWebVitals.bind(performanceMonitor)
  };
}
