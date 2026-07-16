# FrequencyManager — Design System

> **Source of truth for UI/UX.**
> This document is the single source of truth for all design decisions.
> AI agents (Claude Code, Cursor, v0) should read this before generating
> any UI code. Every component, variable, and interaction pattern is documented
> here with exact tokens, states, and code examples.

---

## 1. Brand Identity

**FrequencyManager** is a build optimizer for gacha-RPGs. The visual language
should feel calm, technical, and premium — like a professional tool that gamers
trust with their account data.

**Tone**: Quiet confidence. Not flashy, not playful. Precise.
**Analogy**: Think Bloomberg Terminal meets Discord dark mode.

**Design Principles**:
1. **Calm and focused** — generous whitespace, no visual clutter
2. **Progressive disclosure** — show only what's needed; advanced settings collapse
3. **Instant feedback** — every action updates within 100ms; the UI never blocks
4. **Dark-first** — designed for long evening gaming sessions; light mode is available but secondary
5. **Data clarity** — large numbers, clear labels, no decorative gradients

**Target Platform**: Desktop-first (Electron frameless window), 1200px–1400px wide.
Mobile/tablet are explicitly out of scope.

**Accessibility**: WCAG 2.1 AA minimum. All interactive targets ≥ 44×44px.

---

## 2. Color Palette

### Primary Palette
- `--color-bg`: `#0f1115` — main page background (Midnight default)
- `--color-bg-alt`: `#1a1d23` — panel/card background (derived)
- `--color-fg`: `#e6e8eb` — primary text
- `--color-muted`: `#8b95a7` — secondary text, placeholders
- `--color-accent`: `#4ea1ff` — primary actions, focus rings, active states
- `--color-accent-hover`: `#3b82f6` — accent hover (derived)
- `--color-border`: `rgba(255,255,255,0.1)` — borders, dividers
- `--color-border-light`: `rgba(255,255,255,0.05)` — subtle borders

### Feedback Colors
- `--color-error`: `#ff6b6b` — errors, destructive actions
- `--color-ok`: `#4ade80` — success, confirmation
- `--color-warning`: `#f59e0b` — warnings, cautions (new, add to CSS)
- `--color-info`: `#60a5fa` — informational messages (new, add to CSS)

### Semantic Tokens (CSS Custom Properties)
```css
:root {
    --bg: #0f1115;
    --fg: #e6e8eb;
    --accent: #4ea1ff;
    --muted: #8b95a7;
    --error: #ff6b6b;
    --ok: #4ade80;
}
```

### Theme Presets (from `themeStore.ts`)
| Name | bg | fg | accent | muted | error | ok |
|------|----|----|-------|-------|-------|----|
| midnight (default) | #0f1115 | #e6e8eb | #4ea1ff | #8b95a7 | #ff6b6b | #4ade80 |
| neon | #0a0a0f | #f0f0f0 | #ff00ff | #8888aa | #ff3366 | #00ff88 |
| light | #f8f9fa | #1a1a2e | #2563eb | #6b7280 | #dc2626 | #16a34a |
| amber | #1c1812 | #fef3c7 | #f59e0b | #a18c6f | #ef4444 | #22c55e |

### Usage Rules
- Primary buttons use `--color-accent`; text on accent is always `#FFFFFF`
- Error states use `--color-error` bg with white text
- Success states use `--color-ok` bg with dark text
- Borders are always semi-transparent white; never pure white or pure black
- Never use `#000` for text; use `--color-fg` or `--color-muted`

---

## 3. Typography

### Font Families
- **Primary**: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
  (body text, UI elements, form inputs)
- **Secondary**: Same as Primary — no separate heading font specified yet
- **Mono**: `'JetBrains Mono', 'Fira Code', monospace` (new, add to CSS)

### Type Scale
| Token | Size | Line Height | Weight | Letter Spacing | Use Case |
|-------|------|-------------|--------|----------------|----------|
| Display | 48px | 56px | 700 | -0.5px | Hero sections, splash |
| H1 | 32px | 40px | 700 | -0.3px | Page titles |
| H2 | 24px | 32px | 600 | 0 | Section headings |
| H3 | 20px | 28px | 600 | 0 | Subsection headings |
| Body Large | 18px | 28px | 400 | 0 | Intro text, descriptions |
| Body | 16px | 24px | 400 | 0 | Primary content, form labels |
| Body Small | 14px | 20px | 400 | 0 | Secondary content, hints |
| Caption | 12px | 16px | 500 | 0.4px | Labels, captions, field hints |
| Button | 14px | 16px | 600 | 0.2px | All buttons |
| Mono | 13px | 20px | 400 | 0 | Code, JSON, tech content |

### Usage Rules
- All headings use Secondary font family (or Primary if no separate font loaded)
- All body text uses Primary font family
- Line height is unitless (relative to font size)
- Never go below 12px for body text
- Color: headings use `--color-fg`; body uses `--color-fg`; muted/captions use `--color-muted`

---

## 4. Spacing & Layout

### Spacing Scale (Base unit: 4px)
| Token | Value | Use Case |
|-------|-------|----------|
| xs | 4px | Tight spacing, icon gaps |
| sm | 8px | Compact spacing, list gaps |
| md | 16px | Default spacing, form rows |
| lg | 24px | Section spacing, card padding |
| xl | 32px | Large section gaps |
| 2xl | 48px | Major sections |
| 3xl | 64px | Page-level sections |

### Layout Grid
| Token | Value | Notes |
|-------|-------|-------|
| Container Max | 1200px | Desktop |
| Container Max (tablet) | 100% | No max-width |
| Grid Columns | 12 | Desktop |
| Grid Columns (tablet) | 4 | Tablet |
| Grid Columns (mobile) | 1 | Phone (explicit) |
| Gutter | 24px | Desktop |
| Gutter (mobile) | 16px | Phone/tablet |
| Margin | 32px | Desktop |
| Margin (mobile) | 16px | Phone/tablet |

### Component Spacing
| Component | Padding / Margin |
|-----------|------------------|
| Card | 20px |
| Section | 32px vertical |
| Button | 12px horizontal, 10px vertical |
| Input | 12px horizontal, 10px vertical |
| Module Header | 24px horizontal, 20px vertical |
| Sidebar Item | 12px horizontal, 8px vertical |

---

## 5. Component Registry

| ID | Name | Category | Status |
|----|------|----------|--------|
| titlebar-001 | TitleBar | navigation | stable |
| sidebar-001 | Sidebar | navigation | stable |
| content-001 | ContentArea | layout | stable |
| settings-001 | SettingsSidebar | layout | stable |
| status-001 | StatusBar | feedback | stable |
| module-001 | ModulePanelWrapper | layout | stable |
| field-001 | FieldInput | inputs | stable |
| field-002 | FieldInput/Number | inputs | stable |
| field-003 | FieldInput/Boolean | inputs | stable |
| field-004 | FieldInput/Select | inputs | stable |
| field-005 | FieldInput/Multiselect | inputs | stable |
| field-006 | FieldInput/File | inputs | stable |
| field-007 | FieldInput/Image | inputs | stable |
| field-008 | FieldInput/Rotation | inputs | stable |
| output-001 | ModuleOutputViewer | feedback | stable |
| btn-001 | Button/Primary | buttons | stable |
| btn-002 | Button/Secondary | buttons | stable |
| btn-003 | Button/Destructive | buttons | stable |
| btn-004 | Button/Ghost | buttons | stable |
| card-001 | Card/Base | containers | stable |
| card-002 | Card/Elevated | containers | draft |
| input-001 | Input/Text | inputs | stable |
| input-002 | Input/Number | inputs | stable |
| toggle-001 | Toggle | inputs | stable |
| badge-001 | Badge | indicators | stable |
| spinner-001 | Spinner | feedback | stable |
| tab-001 | Tab | navigation | stable |
| tab-002 | Tab/Output | navigation | stable |

---

## 6. Components (Full Specs)

### 6.1 Button/Primary
**ID**: `btn-001`
**Category**: `buttons`
**Version**: `1.0.0`
**Status**: `stable`

**Purpose**: Primary action for forms, modals, and key user actions.

**Anatomy**:
1. Container: background, border-radius, padding
2. Label: text content
3. Spinner (optional): loading indicator, replaces label

**Variants**:
- Default: Solid accent background, white text
- Loading: Spinner replaces label, disabled state
- With Icon: Icon before label (future)

**Properties**:
| Property | Token/Value | Description |
|----------|-------------|-------------|
| Background | `--color-accent` | Primary blue |
| Background Hover | `--color-accent-hover` | Darker blue |
| Text Color | `#FFFFFF` | Always white |
| Border Radius | `8px` | Rounded corners |
| Padding X | `16px` | Horizontal |
| Padding Y | `10px` | Vertical |
| Min Height | `44px` | Touch target |
| Font | Button token | 14px/600 |
| Border | none | No border |
| Shadow | none | Flat design |

**States**:
- **Default**: `bg: accent`, `text: white`
- **Hover**: `bg: accent-hover`, `shadow: 0 4px 6px rgba(0,0,0,0.2)`
- **Active/Pressed**: `transform: scale(0.98)`, `shadow: none`
- **Focus**: `ring: 2px solid accent`, `ring-offset: 2px`
- **Disabled**: `opacity: 0.5`, `cursor: not-allowed`
- **Loading**: spinner visible, label hidden, `aria-busy: true`

**Typography**:
- Font: `--typography-button`
- Size: `14px`
- Weight: `600`
- Letter-spacing: `0.2px`
- Color: `#FFFFFF`

**Accessibility**:
- ✅ Min touch target: 44×44px
- ✅ Keyboard navigable: Tab + Enter/Space
- ✅ ARIA: `aria-busy` when loading, `aria-disabled` when disabled
- ✅ Color contrast: 4.5:1 (white on #4ea1ff)
- ✅ Focus visible: 2px accent outline, 2px offset

**Usage Guidelines**:
- ✅ DO: Use for the single primary action on a view
- ✅ DO: Pair with icon for emphasis
- ❌ DON'T: Use more than one primary button per view
- ❌ DON'T: Use for navigation

**Responsive Behavior**:
- Mobile: Full width (100%), height 48px
- Tablet: Auto width, height 44px
- Desktop: Auto width, height 40px

**Code Export**:
```html
<button class="btn-primary" aria-label="Calculate" aria-busy="false">
  <span class="btn__text">Calculate DPS</span>
</button>
```

```css
.btn-primary {
  background: var(--color-accent);
  color: #fff;
  border-radius: 8px;
  padding: 10px 16px;
  min-height: 44px;
  font: 14px/16px var(--font-primary);
  font-weight: 600;
  letter-spacing: 0.2px;
  border: none;
  cursor: pointer;
  transition: all 0.15s ease;
}
.btn-primary:hover { background: var(--color-accent-hover); }
.btn-primary:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
```

```tailwind
class="bg-accent hover:bg-accent-hover text-white rounded-lg px-4 py-2.5 min-h-[44px] font-semibold text-sm transition-all duration-150 hover:shadow-md active:scale-95 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
```

**Related Components**: [Button/Secondary](#buttonsecondary), [Button/Ghost](#buttonghost), [Button/Destructive](#buttondestructive)

---

### 6.2 Button/Secondary
**ID**: `btn-002`
**Category**: `buttons`
**Version**: `1.0.0`
**Status**: `stable`

**Purpose**: Secondary actions, less prominent than primary.

**Properties**:
| Property | Token/Value |
|----------|-------------|
| Background | `transparent` |
| Border | `1px solid var(--color-border)` |
| Text Color | `var(--color-fg)` |
| Border Radius | `8px` |
| Padding | `10px 16px` |
| Min Height | `44px` |

**States**:
- **Default**: Transparent bg, border, fg text
- **Hover**: `bg: rgba(255,255,255,0.05)`, border lighter
- **Active**: `bg: rgba(255,255,255,0.1)`
- **Focus**: Same as Primary
- **Disabled**: Same as Primary

**Code Export**:
```tailwind
class="bg-transparent border border-border text-fg rounded-lg px-4 py-2 min-h-[44px] font-medium text-sm hover:bg-white/5 transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 disabled:opacity-50"
```

---

### 6.3 Button/Destructive
**ID**: `btn-003`
**Category**: `buttons`
**Version**: `1.0.0`
**Status**: `stable`

**Purpose**: Dangerous actions (delete, reset, remove).

**Properties**:
| Property | Token/Value |
|----------|-------------|
| Background | `rgba(255,107,107,0.15)` |
| Border | `1px solid rgba(255,107,107,0.3)` |
| Text Color | `var(--color-error)` |
| Border Radius | `8px` |
| Padding | `10px 16px` |
| Min Height | `44px` |

**States**: Same as Secondary, but with error colors.

```tailwind
class="bg-error/15 border border-error/30 text-error rounded-lg px-4 py-2 min-h-[44px] font-medium text-sm hover:bg-error/25 transition-colors"
```

---

### 6.4 Button/Ghost
**ID**: `btn-004`
**Category**: `buttons`
**Version**: `1.0.0`
**Status**: `stable`

**Purpose**: Tertiary actions, low prominence (e.g., Copy, Cancel).

**Properties**:
| Property | Token/Value |
|----------|-------------|
| Background | `transparent` |
| Border | `none` |
| Text Color | `var(--color-muted)` |
| Border Radius | `8px` |
| Padding | `10px 16px` |
| Min Height | `44px` |

**States**:
- **Hover**: `bg: rgba(255,255,255,0.05)`, `text: fg`
- **Active**: `bg: rgba(255,255,255,0.1)`

```tailwind
class="bg-transparent text-muted rounded-lg px-4 py-2 min-h-[44px] font-medium text-sm hover:bg-white/5 hover:text-fg transition-colors"
```

---

### 6.5 Input/Text
**ID**: `input-001`
**Category**: `inputs`
**Version**: `1.0.0`
**Status**: `stable`

**Purpose**: Single-line text input.

**Properties**:
| Property | Token/Value |
|----------|-------------|
| Background | `--color-bg` |
| Border | `1px solid var(--color-border)` |
| Text Color | `var(--color-fg)` |
| Border Radius | `8px` |
| Padding | `10px 12px` |
| Min Height | `44px` |
| Font | Body token, 16px |

**States**:
- **Default**: border `--color-border`
- **Focus**: `border: accent`, `ring: 2px solid accent / offset 2px`
- **Error**: `border: error`, helper text in error color
- **Disabled**: `opacity: 0.5`, `cursor: not-allowed`

**Accessibility**:
- ✅ Min touch target: 44×44px (min-height)
- ✅ Label always visible (no placeholder-only labels)
- ✅ Error text linked via `aria-describedby`

```tailwind
class="w-full px-3 py-2 bg-bg border border-muted/20 rounded-lg text-fg placeholder-muted/40 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
```

**Related**: [FieldInput](#fieldinput) (composite)

---

### 6.6 Input/Number
**ID**: `input-002`
**Category**: `inputs`
**Version**: `1.0.0`
**Status**: `stable`

**Purpose**: Numeric input with min/max/step.

Same as Input/Text but with `type="number"`, `min`, `max`, `step` attributes.

```tailwind
class="w-full px-3 py-2 bg-bg border border-muted/20 rounded-lg text-fg focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/40 disabled:opacity-50"
```

---

### 6.7 Toggle
**ID**: `toggle-001`
**Category**: `inputs`
**Version**: `1.0.0`
**Status**: `stable`

**Purpose**: Boolean on/off switch.

**Properties**:
| Property | Token/Value |
|----------|-------------|
| Width | `44px` |
| Height | `24px` |
| Background (off) | `var(--color-muted)` at 30% opacity |
| Background (on) | `var(--color-accent)` |
| Knob | `20px` circle, white |
| Border Radius | `12px` (full) |

**States**:
- **Off**: `bg: rgba(muted, 0.3)`, knob left
- **On**: `bg: accent`, knob right, `translateX(20px)`
- **Disabled**: `opacity: 0.5`

**Accessibility**:
- ✅ Role: `switch`
- ✅ ARIA: `aria-checked`, `aria-disabled`
- ✅ Label text always visible ("Enabled" / "Disabled")

```tailwind
class="relative inline-block w-10 h-6 rounded-full transition-colors"
```

---

### 6.8 Card/Base
**ID**: `card-001`
**Category**: `containers`
**Version**: `1.0.0`
**Status**: `stable`

**Purpose**: Group related content in a distinct surface.

**Properties**:
| Property | Token/Value |
|----------|-------------|
| Background | `var(--color-bg-alt)` |
| Border | `1px solid var(--color-border)` |
| Border Radius | `12px` |
| Padding | `20px` |
| Shadow | none (flat) |

**States**:
- **Default**: flat, no shadow
- **Hover** (interactive cards only): `shadow: 0 4px 6px rgba(0,0,0,0.3)`

```tailwind
class="bg-bg-alt border border-border rounded-xl p-5"
```

---

### 6.9 Select
**ID**: `select-001`
**Category**: `inputs`
**Version**: `1.0.0`
**Status**: `stable`

**Purpose**: Single-choice dropdown.

Same base styles as Input/Text, with native `<select>` element.

```tailwind
class="w-full px-3 py-2 bg-bg border border-muted/20 rounded-lg text-fg focus:outline-none focus:border-accent"
```

---

### 6.10 Badge
**ID**: `badge-001`
**Category**: `indicators`
**Version**: `1.0.0`
**Status**: `stable`

**Purpose**: Small status indicator (enabled, version, tag).

**Properties**:
| Property | Token/Value |
|----------|-------------|
| Background | `rgba(255,255,255,0.05)` |
| Text Color | `var(--color-muted)` |
| Border Radius | `6px` |
| Padding | `2px 8px` |
| Font | Caption token, 12px |

**States**:
- **Success variant**: `bg: rgba(ok, 0.15)`, `text: var(--color-ok)`
- **Error variant**: `bg: rgba(error, 0.15)`, `text: var(--color-error)`

```tailwind
class="text-xs text-muted bg-muted/10 px-2 py-0.5 rounded"
```

---

### 6.11 ModulePanelWrapper (Composite)
**ID**: `module-001`
**Category**: `layout`
**Version**: `1.0.0`
**Status**: `stable`

**Purpose**: Chrome container for every module workspace.

**Layout Structure**:
```
┌─────────────────────────────────────────────┐
│ HEADER (icon, name, v, desc, toggle)        │
├─────────────────────────────────────────────┤
│ BODY (scrollable)                           │
│  ┌─────────────────────────────────────┐    │
│  │ FORM SECTION                        │    │
│  │  Grid of FieldInput components       │    │
│  └─────────────────────────────────────┘    │
│  ┌─────────────────────────────────────┐    │
│  │ ACTIONS                             │    │
│  │  Row of Button components            │    │
│  └─────────────────────────────────────┘    │
│  ┌─────────────────────────────────────┐    │
│  │ OUTPUT TABS                         │    │
│  │  Tab bar + ModuleOutputViewer        │    │
│  └─────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

**Header Specs**:
| Property | Value |
|----------|-------|
| Padding | `24px` horizontal, `20px` vertical |
| Border Bottom | `1px solid var(--color-border)` |
| Background | `rgba(bg, 0.3)` |

**Form Grid**:
- Desktop: `grid-cols-3` (3 columns)
- Tablet: `grid-cols-2`
- Mobile: `grid-cols-1`
- Gap: `16px`

**Action Bar**:
- Padding: `16px` horizontal
- Gap: `8px`
- Sticky on desktop

---

### 6.12 FieldInput (Composite)
**ID**: `field-001`
**Category**: `inputs`
**Version**: `1.0.0`
**Status**: `stable`

**Purpose**: Combines label, input, description, and validation into one unit.

**Anatomy**:
```
┌──────────────────────────────────┐
│ Label *                           │
│ ┌──────────────────────────────┐ │
│ │ Input / Toggle / Select      │ │
│ └──────────────────────────────┘ │
│ Hint text (optional)             │
└──────────────────────────────────┘
```

**Properties**:
| Property | Value |
|----------|-------|
| Gap label→input | `8px` |
| Gap input→hint | `4px` |
| Label font | Body Small, 14px, weight 500 |
| Hint font | Caption, 12px, color muted |
| Error color | `var(--color-error)` |

**States**:
- **Error**: input border turns error color, hint text shows error message
- **Disabled**: input disabled, label opacity 0.5

**Related**: Delegates actual rendering to type-specific components:
- [Input/Text](#inputtext)
- [Input/Number](#inputnumber)
- [Toggle](#toggle)
- [Select](#select)
- [FieldInput/Multiselect](#fieldinputmultiselect)
- [FieldInput/File](#fieldinputfile)
- [FieldInput/Image](#fieldinputimage)
- [FieldInput/Rotation](#fieldinputrotation)

---

### 6.13 ModuleOutputViewer (Composite)
**ID**: `output-001`
**Category**: `feedback`
**Version**: `1.0.0`
**Status**: `stable`

**Purpose**: Tabbed output display for module results.

**Anatomy**:
```
┌─────────────────────────────────────────────┐
│ [Tab 1] [Tab 2] [Tab 3] ...    [Copy btn] │
├─────────────────────────────────────────────┤
│                                             │
│  Output content (stat cards, tables, etc.)  │
│                                             │
└─────────────────────────────────────────────┘
```

**Tab Specs**:
| Property | Value |
|----------|-------|
| Padding | `12px 16px` |
| Font | Body Small, 14px |
| Active | `border-bottom: 2px solid accent`, `color: accent` |
| Inactive | `border-bottom: 2px solid transparent`, `color: muted` |
| Hover (inactive) | `color: fg`, `border-color: rgba(muted, 0.2)` |

---

### 6.14 FieldInput/Rotation
**ID**: `field-008`
**Category**: `inputs`
**Version**: `1.0.0`
**Status**: `draft`

**Purpose**: Complex rotation builder for combat games.

See full spec in [ARCHITECTURE_UI_ELEMENTS.md](./ARCHITECTURE_UI_ELEMENTS.md).

---

## 7. Design Token Registry

### Colors
```
--color-bg: #0f1115;
--color-bg-alt: #1a1d23;
--color-fg: #e6e8eb;
--color-muted: #8b95a7;
--color-accent: #4ea1ff;
--color-accent-hover: #3b82f6;
--color-border: rgba(255,255,255,0.1);
--color-border-light: rgba(255,255,255,0.05);
--color-error: #ff6b6b;
--color-ok: #4ade80;
--color-warning: #f59e0b;
--color-info: #60a5fa;
```

### Typography
```
--font-primary: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
--font-mono: 'JetBrains Mono', 'Fira Code', monospace;

--typography-display: 48px/56px weight-700 tracking--0.5px
--typography-h1: 32px/40px weight-700 tracking--0.3px
--typography-h2: 24px/32px weight-600
--typography-h3: 20px/28px weight-600
--typography-body-lg: 18px/28px weight-400
--typography-body: 16px/24px weight-400
--typography-body-sm: 14px/20px weight-400
--typography-caption: 12px/16px weight-500 tracking-0.4px
--typography-button: 14px/16px weight-600 tracking-0.2px
--typography-mono: 13px/20px weight-400
```

### Spacing
```
--spacing-xs: 4px;
--spacing-sm: 8px;
--spacing-md: 16px;
--spacing-lg: 24px;
--spacing-xl: 32px;
--spacing-2xl: 48px;
--spacing-3xl: 64px;
```

### Layout
```
--container-max: 1200px;
--grid-gutter: 24px;
--grid-gutter-mobile: 16px;
--sidebar-width: 256px;
--settings-width: 384px;
--settings-min: 300px;
--settings-max: 600px;
--header-height: 48px;
--statusbar-height: 32px;
```

### Radii
```
--radius-sm: 6px;
--radius-md: 8px;
--radius-lg: 12px;
--radius-xl: 16px;
--radius-full: 9999px;
```

### Shadows
```
--shadow-sm: 0 1px 2px rgba(0,0,0,0.3);
--shadow-md: 0 4px 6px rgba(0,0,0,0.3);
--shadow-lg: 0 10px 15px rgba(0,0,0,0.3);
```

### Transitions
```
--transition-fast: 0.1s ease;
--transition-base: 0.15s ease;
--transition-slow: 0.3s ease;
```

---

## 8. Layout Patterns

### App Shell (Three Columns)

> **Decision (2026-07-04):** The app shell uses a fixed three-column layout
> with clearly separated responsibilities:
> - **Left sidebar** = **Categories** area (module/category navigation).
> - **Center** = **Content** area (the active module's workspace: header,
>   form grid, actions, output tabs).
> - **Right sidebar** = **Inspector / Execute** area (contextual detail,
>   executory controls, run actions, and results for the current selection).

```
┌──────────────┬──────────────────────────────────┬──────────────┐
│ Categories   │ Content                           │ Inspector /  │
│ (Left)       │ (Center)                          │ Execute      │
│ 256px        │ flex-1                            │ (Right)      │
│              │                                   │ 384px        │
│ Category /   │ Active Module Workspace           │ Context +    │
│ Module nav   │  - Header                          │ Run actions  │
│ - Calculator │  - Form Grid                      │ - Selection  │
│ - Scanner    │  - Actions                        │   detail     │
│ - Inventory  │  - Output Tabs                    │ - Execute /  │
│ - Rotation   │                                   │   Run button │
│              │                                   │ - Results &  │
│              │                                   │   stats      │
│              │                                   │ - Inspector  │
│              │                                   │   sections   │
└──────────────┴──────────────────────────────────┴──────────────┘
```

**Column responsibilities (canonical):**
1. **Left — Categories**: Navigation between top-level feature categories
   (Calculator, Scanner, Inventory, Rotation). Selecting a category switches
   the center Content area. The left column never hosts execute/run actions;
   it is navigation-only.
2. **Center — Content**: The primary workspace for the selected category/module.
   Hosts the module header, form grid, primary actions, and output tabs. This
   is where the user does the work.
3. **Right — Inspector / Execute**: Contextual inspector and executory surface
   for the current selection. Displays detail (e.g., selected Echo/Character
   stats, scan results), hosts the primary **Execute / Run** action (e.g.,
   "Start Scanning", "Import JSON", "Calculate DPS"), and shows post-run
   results and stats. Right column content is driven by the current selection
   in the center and is collapsible/resizable.

### Module Workspace
```
┌──────────────────────────────────────────────────────┐
│ [Icon] Module Name v1.0.0              [Enabled]     │
│ Description text                                      │
├──────────────────────────────────────────────────────┤
│ Form Grid                                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │ Field 1     │  │ Field 2     │  │ Field 3     │ │
│  └─────────────┘  └─────────────┘  └─────────────┘ │
│  ┌─────────────┐  ┌─────────────┐                   │
│  │ Field 4     │  │ Field 5     │                   │
│  └─────────────┘  └─────────────┘                   │
├──────────────────────────────────────────────────────┤
│ [Calculate DPS]  [Optimize Echoes]                   │
├──────────────────────────────────────────────────────┤
│ [Summary] [Breakdown] [Rotation] [JSON]              │
│ ┌──────────────────────────────────────────────────┐ │
│ │ Output content                                    │ │
│ └──────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

### Settings Sidebar Sections
| Section | Controls | Persistence |
|---------|----------|-------------|
| Appearance | Theme preset dropdown | localStorage + kernel |
| Developer | DevMode toggle, show event log | localStorage |
| Modules | Per-module enable/disable | kernel config |
| Updates | Auto-check toggle, "Check now" button | localStorage |
| About | Version, architecture, tech stack | Static |

---

## 9. Icon System

Current icons are inline SVGs in `TitleBar.tsx`, `ModulePanelWrapper.tsx`, and `Sidebar.tsx`. No icon library is imported.

**Standard icon sizes**:
- Sidebar icon: 20×20px
- Module header icon: 24×24px
- Button icon: 16×16px
- Status icon: 12×12px

**Stroke width**: 1.8px for all icons.

If an icon library is added later, prefer `lucide-react` (matches current style).

---

## 10. Animation & Motion

| Pattern | Duration | Easing | Use |
|---------|----------|--------|-----|
| `transition-fast` | 100ms | ease | Hover states |
| `transition-base` | 150ms | ease | Button presses, focus |
| `transition-slow` | 300ms | ease | Panel slide-in |
| `slide-in` | 200ms | ease-out | Settings sidebar open |

**Rules**:
- No decorative animations
- All motion respects `prefers-reduced-motion: reduce`
- Loading spinners use CSS-only infinite rotation

---

## 11. Accessibility Checklist

Every component must pass before marking `stable`:

- [ ] Color contrast ≥ 4.5:1 (WCAG AA) for text
- [ ] Min touch target ≥ 44×44px
- [ ] Focus indicator visible (2px ring, offset 2px)
- [ ] Keyboard navigable (Tab, Enter, Space, Escape)
- [ ] ARIA roles and labels where needed
- [ ] `aria-disabled` for disabled controls
- [ ] `aria-busy` for loading states
- [ ] `aria-describedby` for error messages
- [ ] No placeholder-only labels
- [ ] `prefers-reduced-motion` respected

---

## 12. Responsive Behavior

FrequencyManager is **desktop-first**. Tablet/mobile are explicitly out of
scope. The app runs in a frameless Electron window with a minimum width of
1024px.

If responsive behavior is needed later:
- Breakpoints: `1024px` (tablet), `768px` (mobile)
- Sidebar collapses to overlay below 1024px
- Form grid reduces columns at narrower widths
- Settings sidebar becomes a full-screen overlay below 768px

---

## 13. Quality Checklist

Before marking a component `stable`:

### Visual
- [ ] Uses design tokens (no hardcoded colors/spacing)
- [ ] Matches brand guidelines (calm, precise, premium)
- [ ] Consistent with existing components
- [ ] All variants documented

### Technical
- [ ] All states implemented (default, hover, active, focus, disabled, loading, error)
- [ ] Keyboard navigable
- [ ] No accessibility violations
- [ ] Animation respects reduced-motion

### Documentation
- [ ] DESIGN.md entry complete
- [ ] All properties documented
- [ ] Usage examples provided
- [ ] Component ID assigned
- [ ] Version set

---

## 14. Component Registry (Summary Table)

| ID | Name | Category | Status |
|----|------|----------|--------|
| btn-001 | Button/Primary | buttons | stable |
| btn-002 | Button/Secondary | buttons | stable |
| btn-003 | Button/Destructive | buttons | stable |
| btn-004 | Button/Ghost | buttons | stable |
| input-001 | Input/Text | inputs | stable |
| input-002 | Input/Number | inputs | stable |
| toggle-001 | Toggle | inputs | stable |
| select-001 | Select | inputs | stable |
| field-001 | FieldInput | inputs | stable |
| field-008 | FieldInput/Rotation | inputs | draft |
| output-001 | ModuleOutputViewer | feedback | stable |
| card-001 | Card/Base | containers | stable |
| badge-001 | Badge | indicators | stable |
| module-001 | ModulePanelWrapper | layout | stable |
| titlebar-001 | TitleBar | navigation | stable |
| sidebar-001 | Sidebar | navigation | stable |
| settings-001 | SettingsSidebar | layout | stable |
| status-001 | StatusBar | feedback | stable |

---

## 15. Export & Integration

### For Claude Code / Cursor / v0
1. Place DESIGN.md in project root
2. Reference in prompts: "Follow the design system in DESIGN.md"
3. Agents will read and apply tokens, component specs, and accessibility rules

### Updating DESIGN.md
- Edit tokens/specs here, regenerate all components
- Always commit DESIGN.md with matching component code changes

---

## 16. Changelog

- v1.0.0 (2026-07-04): Initial design system created for FrequencyManager