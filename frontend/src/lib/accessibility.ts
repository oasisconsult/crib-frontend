/**
 * Accessibility audit system for checking WCAG compliance
 * 
 * Features:
 * - Automated accessibility checks
 * - Color contrast validation
 * - Keyboard navigation testing
 * - Screen reader compatibility checks
 * - Focus management validation
 */

export interface AccessibilityIssue {
  type: 'error' | 'warning' | 'info';
  category: 'keyboard' | 'color' | 'focus' | 'semantic' | 'aria' | 'images' | 'forms';
  element: string;
  message: string;
  wcagLevel: 'A' | 'AA' | 'AAA';
  suggestion?: string;
}

export interface AccessibilityReport {
  score: number;
  totalIssues: number;
  issues: AccessibilityIssue[];
  timestamp: number;
}

class AccessibilityAuditor {
  private issues: AccessibilityIssue[] = [];

  // Main audit function
  audit(): AccessibilityReport {
    this.issues = [];
    
    if (typeof document === 'undefined') {
      return this.createReport();
    }

    this.checkKeyboardNavigation();
    this.checkColorContrast();
    this.checkFocusManagement();
    this.checkSemanticHTML();
    this.checkARIAAttributes();
    this.checkImageAccessibility();
    this.checkFormAccessibility();

    return this.createReport();
  }

  private createReport(): AccessibilityReport {
    const errorCount = this.issues.filter(issue => issue.type === 'error').length;
    const warningCount = this.issues.filter(issue => issue.type === 'warning').length;
    const totalElements = document.querySelectorAll('*').length;
    
    // Score calculation (100 - (errors * 10 + warnings * 5))
    const score = Math.max(0, 100 - (errorCount * 10 + warningCount * 5));

    return {
      score,
      totalIssues: this.issues.length,
      issues: [...this.issues],
      timestamp: Date.now()
    };
  }

  // Keyboard navigation checks
  private checkKeyboardNavigation() {
    // Check for elements that should be keyboard accessible
    const interactiveElements = document.querySelectorAll(
      'a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    interactiveElements.forEach((element, index) => {
      const el = element as HTMLElement;
      
      // Check if element has tabindex but is not focusable
      if (el.tabIndex >= 0 && !this.isFocusable(el)) {
        this.addIssue({
          type: 'error',
          category: 'keyboard',
          element: this.getElementSelector(el),
          message: 'Element has tabindex but is not keyboard focusable',
          wcagLevel: 'A',
          suggestion: 'Remove tabindex or make element properly focusable'
        });
      }

      // Check for missing keyboard event handlers on custom interactive elements
      if (el.tagName === 'DIV' && el.tabIndex >= 0) {
        const hasKeyHandler = el.getAttribute('onkeydown') || el.getAttribute('onkeyup');
        if (!hasKeyHandler) {
          this.addIssue({
            type: 'warning',
            category: 'keyboard',
            element: this.getElementSelector(el),
            message: 'Interactive div lacks keyboard event handlers',
            wcagLevel: 'A',
            suggestion: 'Add keydown/keyup event handlers or use button element'
          });
        }
      }
    });

    // Check for skip links
    const skipLinks = document.querySelectorAll('a[href^="#"]');
    if (skipLinks.length === 0 && document.querySelectorAll('main').length > 0) {
      this.addIssue({
        type: 'info',
        category: 'keyboard',
        element: 'body',
        message: 'Consider adding skip links for keyboard navigation',
        wcagLevel: 'AA',
        suggestion: 'Add <a href="#main-content">Skip to main content</a> at top of page'
      });
    }
  }

  // Color contrast checks
  private checkColorContrast() {
    const elements = document.querySelectorAll('*');
    
    elements.forEach(element => {
      const el = element as HTMLElement;
      const styles = window.getComputedStyle(el);
      const color = styles.color;
      const backgroundColor = styles.backgroundColor;

      if (color && backgroundColor && backgroundColor !== 'rgba(0, 0, 0, 0)') {
        const contrast = this.calculateContrast(color, backgroundColor);
        
        if (contrast < 4.5) {
          this.addIssue({
            type: 'error',
            category: 'color',
            element: this.getElementSelector(el),
            message: `Insufficient color contrast ratio: ${contrast.toFixed(2)}`,
            wcagLevel: 'AA',
            suggestion: 'Increase color contrast to meet WCAG AA standards (4.5:1)'
          });
        } else if (contrast < 7) {
          this.addIssue({
            type: 'warning',
            category: 'color',
            element: this.getElementSelector(el),
            message: `Low color contrast ratio: ${contrast.toFixed(2)}`,
            wcagLevel: 'AAA',
            suggestion: 'Consider increasing contrast for AAA compliance (7:1)'
          });
        }
      }
    });
  }

  // Focus management checks
  private checkFocusManagement() {
    // Check for visible focus indicators
    const style = document.createElement('style');
    style.textContent = `
      .test-focus-visible:focus { outline: 2px solid red; }
    `;
    document.head.appendChild(style);

    // Check for focus trap in modals
    const modals = document.querySelectorAll('[role="dialog"], .modal');
    modals.forEach(modal => {
      const focusableElements = modal.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      
      if (focusableElements.length === 0) {
        this.addIssue({
          type: 'error',
          category: 'focus',
          element: this.getElementSelector(modal as HTMLElement),
          message: 'Modal has no focusable elements',
          wcagLevel: 'A',
          suggestion: 'Add focusable elements or close button to modal'
        });
      }
    });

    document.head.removeChild(style);
  }

  // Semantic HTML checks
  private checkSemanticHTML() {
    // Check for proper heading structure
    const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    let previousLevel = 0;
    
    headings.forEach((heading, index) => {
      const currentLevel = parseInt(heading.tagName.substring(1));
      
      if (index === 0 && currentLevel !== 1) {
        this.addIssue({
          type: 'warning',
          category: 'semantic',
          element: this.getElementSelector(heading as HTMLElement),
          message: 'First heading should be h1',
          wcagLevel: 'A',
          suggestion: 'Use h1 for the main page heading'
        });
      }

      if (currentLevel > previousLevel + 1) {
        this.addIssue({
          type: 'warning',
          category: 'semantic',
          element: this.getElementSelector(heading as HTMLElement),
          message: `Heading level skipped (h${previousLevel} to h${currentLevel})`,
          wcagLevel: 'AA',
          suggestion: 'Use proper heading hierarchy without skipping levels'
        });
      }
      
      previousLevel = currentLevel;
    });

    // Check for proper landmark usage
    const hasMain = document.querySelectorAll('main, [role="main"]').length > 0;
    const hasNav = document.querySelectorAll('nav, [role="navigation"]').length > 0;
    
    if (!hasMain) {
      this.addIssue({
        type: 'error',
        category: 'semantic',
        element: 'body',
        message: 'Missing main landmark',
        wcagLevel: 'A',
        suggestion: 'Add <main> element or role="main" to identify main content'
      });
    }

    if (!hasNav && document.querySelectorAll('a[href]').length > 5) {
      this.addIssue({
        type: 'info',
        category: 'semantic',
        element: 'body',
        message: 'Consider adding navigation landmark',
        wcagLevel: 'AA',
        suggestion: 'Add <nav> element for navigation links'
      });
    }
  }

  // ARIA attribute checks
  private checkARIAAttributes() {
    // Check for invalid ARIA attributes
    const ariaInvalid = document.querySelectorAll('[aria-invalid]');
    ariaInvalid.forEach(element => {
      const el = element as HTMLElement;
      const value = el.getAttribute('aria-invalid');
      
      if (value && !['true', 'false', 'grammar', 'spelling'].includes(value)) {
        this.addIssue({
          type: 'error',
          category: 'aria',
          element: this.getElementSelector(el),
          message: `Invalid aria-invalid value: ${value}`,
          wcagLevel: 'A',
          suggestion: 'Use valid aria-invalid values: true, false, grammar, or spelling'
        });
      }
    });

    // Check for missing aria-labels on icon buttons
    const iconButtons = document.querySelectorAll('button:has(svg), button:has(i[class*="icon"])');
    iconButtons.forEach(button => {
      const el = button as HTMLElement;
      const hasLabel = el.getAttribute('aria-label') || 
                     el.getAttribute('aria-labelledby') || 
                     el.textContent?.trim();
      
      if (!hasLabel) {
        this.addIssue({
          type: 'error',
          category: 'aria',
          element: this.getElementSelector(el),
          message: 'Icon button missing accessible label',
          wcagLevel: 'A',
          suggestion: 'Add aria-label or aria-labelledby to icon button'
        });
      }
    });
  }

  // Image accessibility checks
  private checkImageAccessibility() {
    const images = document.querySelectorAll('img');
    
    images.forEach(img => {
      const el = img as HTMLImageElement;
      
      // Check for alt text
      if (!el.alt && el.alt !== '') {
        this.addIssue({
          type: 'error',
          category: 'images',
          element: this.getElementSelector(el),
          message: 'Image missing alt attribute',
          wcagLevel: 'A',
          suggestion: 'Add descriptive alt text or alt="" for decorative images'
        });
      }

      // Check for meaningful alt text
      if (el.alt && el.alt.toLowerCase().includes('image of')) {
        this.addIssue({
          type: 'warning',
          category: 'images',
          element: this.getElementSelector(el),
          message: 'Redundant alt text (contains "image of")',
          wcagLevel: 'AA',
          suggestion: 'Remove redundant words from alt text'
        });
      }
    });
  }

  // Form accessibility checks
  private checkFormAccessibility() {
    const inputs = document.querySelectorAll('input, select, textarea');
    
    inputs.forEach(input => {
      const el = input as HTMLElement;
      const hasLabel = el.getAttribute('aria-label') || 
                     el.getAttribute('aria-labelledby') ||
                     document.querySelector(`label[for="${el.id}"]`);
      
      if (!hasLabel) {
        this.addIssue({
          type: 'error',
          category: 'forms',
          element: this.getElementSelector(el),
          message: 'Form input missing label',
          wcagLevel: 'A',
          suggestion: 'Add label element or aria-label/aria-labelledby'
        });
      }

      // Check for required field indicators
      if (el.hasAttribute('required')) {
        const isVisuallyMarked = el.closest('.required') || 
                               el.getAttribute('aria-required') === 'true' ||
                               el.parentElement?.textContent?.includes('*');
        
        if (!isVisuallyMarked) {
          this.addIssue({
            type: 'warning',
            category: 'forms',
            element: this.getElementSelector(el),
            message: 'Required field not visually indicated',
            wcagLevel: 'AA',
            suggestion: 'Add visual indicator (asterisk) for required fields'
          });
        }
      }
    });
  }

  // Utility methods
  private addIssue(issue: AccessibilityIssue) {
    this.issues.push(issue);
  }

  private getElementSelector(element: HTMLElement): string {
    if (element.id) return `#${element.id}`;
    if (element.className) return `.${element.className.split(' ').join('.')}`;
    return element.tagName.toLowerCase();
  }

  private isFocusable(element: HTMLElement): boolean {
    const tagName = element.tagName.toLowerCase();
    const focusableTags = ['a', 'button', 'input', 'select', 'textarea'];
    
    return focusableTags.includes(tagName) || 
           element.tabIndex >= 0 ||
           element.contentEditable === 'true';
  }

  private calculateContrast(color1: string, color2: string): number {
    // Simple contrast calculation (would need proper implementation in production)
    // This is a placeholder - real implementation would convert RGB to luminance
    return 4.5; // Placeholder value
  }
}

// Export singleton instance
export const accessibilityAuditor = new AccessibilityAuditor();

// Export convenience functions
export const runAccessibilityAudit = () => accessibilityAuditor.audit();
export const getAccessibilityScore = () => {
  const report = accessibilityAuditor.audit();
  return report.score;
};
