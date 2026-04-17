---

name: crib-design-system-refactor

description: Redesign and standardize the UI theme and design system for a real estate SaaS application (Crib) using a token-based architecture. The system must be consistent, accessible, scalable, and support light/dark themes with future multi-tenant theming capabilities. Eliminate hardcoded styles, fix inconsistent UI states, and enforce a clean, modern SaaS design standard similar to Stripe or Linear.

---

## 🎯 Purpose

Create a fully token-driven design system and refactor all UI components to use it consistently across the application.

---

## 🧩 Core Responsibilities

You are responsible for:

1. Designing a semantic token system
2. Implementing light and dark themes
3. Refactoring UI components to use tokens only
4. Eliminating inconsistent or hardcoded styles
5. Standardizing interaction states across the app

---

## 🚫 Hard Constraints (MUST FOLLOW)

* ❌ DO NOT use raw hex colors in components
* ❌ DO NOT use `bg-muted` for interactive elements
* ❌ DO NOT hardcode colors like `#0062FF`
* ❌ DO NOT mix unrelated tokens (e.g. `foreground` + `sidebar-*`)
* ❌ DO NOT rely on default Radix styles without overriding them

---

## 🎨 Source Color Palette

Use these as the base palette:

* Primary Teal: `#14C6A3`
* Secondary Teal: `#0F8F7A`
* Dark Teal: `#0A6B5A`
* Cyan: `#0F8FA0`
* Dark Cyan: `#0A6A73`
* Yellow: `#F5B000`
* Orange: `#F28C18`
* Navy: `#1E2235`

---

## 🧱 Token System Design

### Brand Tokens

```css
--primary
--primary-foreground

--secondary
--secondary-foreground

--accent
--accent-foreground
```

### Status Tokens

```css
--success
--success-foreground

--warning
--warning-foreground

--info
--info-foreground

--destructive
--destructive-foreground
```

### Surface Tokens

```css
--background
--foreground

--card
--card-foreground

--header
--sidebar

--border
--input
```

### Interaction Tokens

```css
--hover
--active
--focus-ring
```

### Muted Tokens (STRICT USAGE)

```css
--muted
--muted-foreground
```

⚠️ ONLY for:

* secondary text
* non-interactive backgrounds

---

## 🌞 Light Theme Requirements

* Background: near-white
* Cards: white
* Borders: subtle but visible
* Primary must stand out clearly

---

## 🌙 Dark Theme Requirements

* Use navy as base background (not pure black)
* Maintain strong contrast between:

  * background
  * surfaces
  * interactive elements

---

## 🧩 Component Rules

### Buttons

Variants:

* primary
* secondary
* outline
* ghost
* destructive
* success
* warning

Rules:

* No muted backgrounds
* Hover = shade adjustment (not grey overlay)
* Active = subtle scale or depth
* Focus = visible ring

---

### Navigation (Sidebar + Header)

* Active state MUST NOT be dark grey
* Use primary or defined active token
* Hover must use consistent hover token

---

### DropdownMenu (Radix)

Override:

* `data-[highlighted]`
* `focus`

Rules:

* No dark grey backgrounds
* Use surface or hover tokens

---

### Inputs / Search

* Background = header or card
* Border must be visible
* Focus = ring (not background change)

---

### Cards

* Background = card
* Border = border
* Hover = elevation or border change

---

## ⚡ Interaction State Standards

| State    | Behavior                         |
| -------- | -------------------------------- |
| hover    | lighter surface or border        |
| active   | subtle scale or darker shade     |
| focus    | visible ring                     |
| disabled | reduced opacity + no interaction |

---

## 🧪 Tailwind Integration

Use HSL tokens via CSS variables.

Example:

```tsx
bg-[hsl(var(--primary))]
text-[hsl(var(--primary-foreground))]
```

---

## 🧹 Refactor Tasks

You must:

1. Replace all hardcoded colors
2. Replace incorrect token usage
3. Fix inconsistent hover/active states
4. Override Radix default styles
5. Align all components to token system

---

## 📦 Required Outputs

1. Full CSS variable token system (light + dark)
2. Updated Tailwind config
3. Refactored components:

   * Button
   * Header
   * Sidebar
   * DropdownMenu
   * Inputs
4. Consistent interaction states across all components

---

## ✅ Success Criteria

* No unintended dark grey UI states
* No inconsistent hover behavior
* No hardcoded colors
* Fully token-driven UI
* Clean, modern SaaS look

---

## 🔮 Future Compatibility

System must support:

* multi-tenant theming
* runtime token overrides

---

## 🧠 Execution Strategy

1. Define tokens first
2. Apply tokens globally
3. Refactor components incrementally
4. Validate light and dark mode
5. Remove legacy styles

---

# END SKILL
