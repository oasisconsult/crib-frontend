# Crib Design System Documentation

## Overview

Crib is a professional real estate SaaS application with a clean, data-heavy, and decision-driven UI. This design system follows industry standards and WCAG accessibility guidelines, inspired by Stripe Dashboard, Linear, and Notion.

## Design Philosophy

**Clean > Fancy**  
**Readable > Stylish**  
**Fast > Decorative**

The design prioritizes functionality and clarity over decorative elements, ensuring users can efficiently manage properties, tenants, and payments.

## Core Design Tokens

### Typography

- **Font**: Inter (system font stack fallback)
- **Base Size**: 16px
- **Scale**: 1.25 (modular scale)
- **Font Smoothing**: Antialiased

#### Typography Hierarchy

| Role | Size | Weight | Usage |
|------|------|--------|-------|
| H1 | 36-40px | 600 | Page titles |
| H2 | 28px | 600 | Section headers |
| H3 | 20px | 500 | Card titles |
| Body | 16px | 400 | Main content |
| Table | 14px | 400 | Data tables |
| Caption | 12px | 400 | Helper text |

### Color System

#### Primary Colors (Trust)
- **Primary**: #2563EB (Blue 500)
- **Primary Light**: #DBEAFE (Blue 100)
- **Primary Dark**: #1D4ED8 (Blue 600)

#### Neutral Colors (UI)
- **Background**: #F9FAFB
- **Card**: #FFFFFF
- **Border**: #E5E7EB
- **Text Primary**: #111827
- **Text Secondary**: #6B7280
- **Text Tertiary**: #9CA3AF

#### Semantic Colors
- **Success**: #16A34A (Green 600)
- **Warning**: #F59E0B (Yellow 600)
- **Error**: #DC2626 (Red 600)
- **Info**: #2563EB (Blue 500)

### Spacing System

8-point grid system for consistent spacing:

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Tight spacing |
| sm | 8px | Small gaps |
| md | 16px | Standard spacing |
| lg | 24px | Section spacing |
| xl | 32px | Large spacing |
| 2xl | 48px | Page spacing |

### Border Radius

- **sm**: 6px (Buttons, inputs)
- **md**: 8px (Cards)
- **lg**: 12px (Large cards)
- **xl**: 16px (Special elements)

### Shadows

- **sm**: 0 1px 2px 0 rgb(0 0 0 / 0.05)
- **md**: 0 4px 6px -1px rgb(0 0 0 / 0.1)
- **lg**: 0 10px 15px -3px rgb(0 0 0 / 0.1)
- **xl**: 0 20px 25px -5px rgb(0 0 0 / 0.1)

## Responsive Breakpoints

| Breakpoint | Width | Device | Layout |
|------------|-------|--------|--------|
| sm | 640px | Mobile large | Single column |
| md | 768px | Tablet | 2-column grid |
| lg | 1024px | Small desktop | 3-4 column grid |
| xl | 1280px | Desktop | Full sidebar |
| 2xl | 1536px | Ultra-wide | Max-width container |

### Layout System by Device

#### Mobile (0-767px)
- Top bar with logo + menu
- Bottom navigation (4 items + "More")
- Single column layout
- Banking app UX patterns

#### Tablet (768-1023px)
- Collapsible sidebar
- 2-column grid layout
- Left: navigation, Right: content

#### Desktop (1024-1535px)
- Fixed sidebar (256px wide)
- Top header (64px tall)
- Content grid (3-4 columns)
- Dashboard cards: 3-4 per row

#### Ultra-wide (1536px+)
- Max-width container (1400px)
- Centered content
- Prevents UI stretching

## Core Components

### Cards

#### Dashboard Cards
- **Padding**: 16-24px
- **Border Radius**: 12px
- **Shadow**: Subtle (sm)
- **Hover**: Shadow elevation

#### Card Structure
```jsx
<Card className="re-card">
  <CardHeader className="re-card-header">
    <CardTitle className="re-h3">Title</CardTitle>
  </CardHeader>
  <CardContent className="re-card-content">
    Content
  </CardContent>
</Card>
```

### Buttons

#### Button Types
- **Primary**: Blue background, white text
- **Secondary**: Outline, gray text
- **Danger**: Red background, white text

#### Button Sizing
- **Default**: 44px min-height (WCAG)
- **Small**: 36px min-height
- **Large**: 52px min-height

#### Button Classes
```jsx
<button className="btn btn-primary">Primary</button>
<button className="btn btn-secondary">Secondary</button>
<button className="btn btn-danger">Danger</button>
```

### Forms

#### Input Fields
- **Height**: 44px (WCAG touch target)
- **Border**: 1px solid #E5E7EB
- **Focus**: Blue ring (2px)
- **Border Radius**: 8px

#### Form Layout
- **Mobile**: Single column
- **Desktop**: 2-column grid

### Tables

#### Table Specifications
- **Row Height**: 48px
- **Font**: 14px
- **Zebra Stripes**: Optional
- **Hover**: Background highlight

#### Table Structure
```jsx
<div className="re-table-container">
  <table className="re-table">
    <thead>
      <tr>
        <th>Column</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Data</td>
      </tr>
    </tbody>
  </table>
</div>
```

## Navigation System

### Sidebar (Desktop)
- **Width**: 256px (fixed)
- **Logo**: Top left
- **Sections**: Dashboard, Properties, Tenants, Payments, Reports, Settings
- **User**: Bottom section with avatar

### Mobile Navigation
- **Bottom Nav**: 4 main items + "More"
- **Icons + Labels**: Clear labeling
- **Slide-out Menu**: For additional items

## UX Patterns

### Empty States
- **Clear messaging**: "No X yet"
- **Action-oriented**: "Add X" button
- **Illustrations**: Simple icons

### Loading States
- **Skeleton Loaders**: Not spinners
- **Content-aware**: Match layout structure
- **Smooth transitions**: 150-250ms

### Notifications
- **Desktop**: Top-right toasts
- **Mobile**: Bottom sheets
- **Types**: Success, Error, Warning, Info

### Search
- **Global search**: Powerful and accessible
- **Real-time**: As-you-type results
- **Filters**: Contextual filtering

## Accessibility (WCAG)

### Focus Management
- **Visible Focus**: 2px outline, offset 2px
- **Keyboard Navigation**: Tab order logical
- **Skip Links**: "Skip to main content"

### Color Contrast
- **Text**: 4.5:1 minimum (AA)
- **Large Text**: 3:1 minimum
- **UI Elements**: 3:1 minimum

### Screen Readers
- **Semantic HTML**: Proper element usage
- **ARIA Labels**: Where needed
- **Alt Text**: Descriptive images

### Motion Preferences
- **Reduced Motion**: Respects user preferences
- **Animations**: Purposeful and brief
- **Transitions**: 150-350ms max

## Implementation

### CSS Classes

#### Typography
- `.re-h1`, `.re-h2`, `.re-h3` - Headings
- `.re-body` - Body text
- `.re-table` - Table text
- `.re-caption` - Caption text

#### Components
- `.re-card` - Base card
- `.re-dashboard-card` - Dashboard card
- `.re-btn` - Button base
- `.re-input` - Form input
- `.re-badge` - Status badge

#### Utilities
- `.re-sr-only` - Screen reader only
- `.re-focus-visible` - Focus styles
- `.re-container` - Max-width container

### Tailwind Configuration

The design system extends Tailwind with custom tokens:

```js
module.exports = {
  theme: {
    container: {
      center: true,
      screens: { '2xl': '1400px' }
    },
    extend: {
      fontFamily: { sans: ['Inter', 'sans-serif'] },
      fontSize: { /* Custom scale */ },
      colors: { /* Design tokens */ },
      spacing: { /* 8pt grid */ },
      borderRadius: { xl: '12px' }
    }
  }
}
```

## Usage Guidelines

### Do's
- Use consistent spacing (8pt grid)
- Follow typography hierarchy
- Maintain WCAG contrast ratios
- Test on all breakpoints
- Use semantic HTML

### Don'ts
- Over-decorate interfaces
- Ignore mobile experience
- Break spacing consistency
- Use arbitrary values
- Skip accessibility testing

## File Structure

```
src/
  styles/
    design-system.css    # Main design system
    globals.css          # Global styles + imports
  components/
    layout/
      Navigation.tsx     # Sidebar + mobile nav
    ui/
      UXPatterns.tsx     # Empty states, loading, etc.
  tailwind.config.js    # Tailwind configuration
```

## Testing

### Responsive Testing
- Mobile: 375px, 414px
- Tablet: 768px, 1024px
- Desktop: 1280px, 1440px
- Ultra-wide: 1536px+

### Accessibility Testing
- Keyboard navigation
- Screen reader compatibility
- Color contrast validation
- Focus management

### Performance Testing
- Core Web Vitals
- Bundle size optimization
- Image optimization
- Font loading strategies

## Maintenance

### Version Control
- Semantic versioning for components
- Breaking changes documentation
- Migration guides
- Changelog maintenance

### Component Updates
- Design token updates
- New component additions
- Deprecation notices
- Best practices evolution

This design system ensures consistency, accessibility, and maintainability across the Crib application while following modern SaaS design patterns and industry standards.
