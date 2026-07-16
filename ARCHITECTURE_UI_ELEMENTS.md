# FrequencyManager — Architecture-Provided UI Elements

This document lists every UI element, component, and interaction pattern that the FrequencyManager architecture natively provides to modules and users. This is the **contract** between the kernel/renderer and any module — if a module declares it in its `ModuleUISpec`, the renderer will render it.

---

## 1. Layout Shell (App-Level)

The renderer provides a fixed, three-column layout shell that wraps all modules:

| Element | Description | Customization |
|---------|-------------|---------------|
| **TitleBar** | Frameless window top bar with app title, window controls (min/max/close), and settings trigger | Theme-aware, can add custom actions via props |
| **Sidebar (Left)** | 256px fixed-width module navigator with search, quick-access (Dashboard), and collapsible groups by tag | Module list driven by `ModuleInfo[]` from store |
| **ContentArea (Center)** | Flexible workspace that renders the active module's UI spec | Driven entirely by `ModuleUISpec` |
| **SettingsSidebar (Right)** | 384px default, user-resizable (300–600px), persists width to localStorage | Sections: Appearance, Developer, Modules, Updates, About |
| **StatusBar** | Bottom bar showing kernel health, loaded module count, resource usage, version | Updated via health events |

**Key behaviors:**
- All three columns are always visible (no overlays/modals for settings)
- Right sidebar has drag handle on left edge for resize
- Window is frameless with custom TitleBar
- Theme applied via `data-theme` attribute on `<html>`

---

## 2. Module UI Specification (`ModuleUISpec`)

Every module declares a `ModuleUISpec` (either static in `moduleUISpecs.ts` or dynamic via kernel `module:ui-spec` RPC). The renderer consumes this to build the entire module workspace.

### 2.1 Fields (`FieldSpec[]`)

Each field becomes an input control in a responsive form grid. The renderer provides these **field types** out of the box:

| Type | Rendered Component | Props Supported |
|------|-------------------|-----------------|
| `text` | `<input type="text">` | `placeholder`, `description`, `required` |
| `number` | `<input type="number">` | `min`, `max`, `step`, `placeholder`, `required` |
| `select` | `<select>` with options | `options: [{value, label}]`, `required`, `description` |
| `multiselect` | Multi-select dropdown | `options`, `required`, `description` |
| `boolean` | Toggle switch (custom styled) | `default`, `description` |
| `file` | File picker button + display | `accept` (MIME), `description` |
| `image` | Image drop zone + preview | `description`, `required` |
| `rotation` | **RotationBuilder** (complex custom component) | `rotationConfig: RotationBuilderSpec` |

**Field sources** (`source` property):
- `user-input` — User fills it in
- `config` — Pre-filled from kernel config
- `selection` — Comes from a selector (e.g., character picker)
- `state` — Bound to the shared state store with optional `gameRule` validation (see Section 4)

**State binding additions** (when `source: 'state'`):
- `statePath` — dot-path into shared state, e.g. `'characters.rover-spectro.baseStats.critRate'`
- `gameRule` — `GameRuleRef` for validation/clamping, e.g. `'character-stats.critRate'`

See [`docs/SHARED_STATE.md`](docs/SHARED_STATE.md) for the full shared-state API and migration guide.

**Common field props:**
- `id` — Unique key
- `label` — Human-readable label
- `description` — Help text shown below field
- `required` — Validation
- `default` — Initial value

### 2.2 Actions (`ActionSpec[]`)

Rendered as buttons in an action bar. The renderer provides:

| Style | Visual |
|-------|--------|
| `primary` | Blue accent, filled |
| `secondary` | Ghost with border |
| `danger` | Red accent |
| `ghost` | Text only, hover background |

**Action props:**
- `id` — Unique key (sent to kernel as `module:action:<id>`)
- `label` — Button text
- `description` — Tooltip
- `style` — One of above
- `requiresFields` — Array of field IDs that must be filled before enabled
- `confirmMessage` — Optional confirmation dialog

### 2.3 Outputs (`OutputSpec[]`)

Rendered as tabs in the output viewer. The renderer provides these **output kinds**:

| Kind | Rendered Component | Data Shape Expected |
|------|-------------------|---------------------|
| `stat` | Large number cards (KPIs) | `{ key: string, value: string\|number, unit?: string }[]` |
| `table` | Sortable, filterable data table | `{ columns: string[], rows: Record<string, unknown>[] }` |
| `list` | Vertical list with icons | `{ items: { label, value, icon?, meta? }[] }` |
| `chart` | Chart.js / Recharts area | `{ series: { name, data: number[] }[], labels: string[] }` |
| `json` | Syntax-highlighted JSON tree (Monaco/Prism) | Any JSON-serializable object |
| `image` | Image viewer with zoom/pan | `{ url: string, alt?: string }` |

**Output props:**
- `id` — Channel ID (matches backend output channel)
- `label` — Tab label
- `kind` — One of above
- `description` — Tooltip

---

## 3. Built-in Complex Components

These are rendered automatically when the spec references them:

### 3.1 RotationBuilder (`type: 'rotation'`)
A full-featured rotation builder for combat games:
- **Character selector** with icons
- **Skill palette** per character (basic, skill, ultimate)
- **Timeline canvas** — drag-and-drop steps, reorder, delete
- **Energy visualization** — bar showing energy flow over rotation
- **Validation** — checks cooldowns, energy constraints, max length
- **Export/Import** — JSON serialization of rotation

**Config (`RotationBuilderSpec`):**
```ts
{
  characters: [{ id, label, icon? }],
  skills: { characterId: [{ id, label, type, energyCost?, cooldown? }] },
  defaultRotation: RotationStepSpec[],
  maxRotationLength: number, // seconds
  showEnergy: boolean
}
```

### 3.2 ModuleOutputViewer
Tabbed output area that:
- Auto-switches to new output when action completes
- Shows loading skeletons while waiting
- Provides "Copy JSON" button per tab
- Handles empty/error states gracefully

### 3.3 FieldInput
Unified input component that renders any `FieldSpec` type with:
- Label + description
- Validation (required, min/max)
- Error state display
- Consistent dark-theme styling
- Focus rings with accent color

---

## 4. Module-Level UI Chrome (ModulePanelWrapper)

Every module rendered via the generic path gets this chrome automatically:

```
┌─────────────────────────────────────────────────────────────┐
│ Module Header                                               │
│ ┌─────────┐  Module Name v1.0.0    [enabled badge]  [menu] │
│ │  Icon   │  Description text                               │
│ └─────────┘                                               │
├─────────────────────────────────────────────────────────────┤
│ Form Grid (FieldSpec[])          │  Sticky Action Bar      │
│ ┌────────┐ ┌────────┐             │  [Primary] [Secondary] │
│ │ Field  │ │ Field  │             │                        │
│ │ Field  │ │ Field  │  (scrolls)  │                        │
│ └────────┴─────────┘             │                        │
├─────────────────────────────────────────────────────────────┤
│ Output Tabs (OutputSpec[])                                  │
│ [Summary ▼] [Breakdown ▼] [Rotation ▼] [JSON ▼]             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │  Output content (stat cards / table / list / chart ...) │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**Responsive behavior:**
- Form grid: 1 col mobile → 2 col tablet → 3–6 col desktop
- Action bar: sticky on desktop, scrolls on mobile
- Output tabs: horizontal scroll on narrow widths

---

## 5. Settings Sidebar Sections (Always Available)

| Section | Controls | Persistence |
|---------|----------|-------------|
| **Appearance** | Theme preset dropdown (from `themeStore.presets`) | `localStorage` + kernel config |
| **Developer** | Dev Mode toggle (enables DevPanel, extra logging) | `localStorage` |
| **Modules** | Per-module enable/disable toggles (calls `enableModule`/`disableModule`) | Kernel config |
| **Updates** | Auto-check toggle + "Check Now" button (calls `update-checker:check-now`) | `localStorage` |
| **About** | Version, architecture info, tech stack | Static |

---

## 6. DevPanel (Conditional)

Shown only when `devMode` is true (bottom docked panel):
- **Event Log** — Real-time kernel event bus stream with correlation IDs
- **Module Health** — Per-module status, uptime, last error
- **Config Inspector** — Live view of kernel config tree
- **Action Tester** — Raw RPC invocation against any module

---

## 7. Preload Bridge API (Renderer → Main → Kernel)

The renderer exposes `window.frequencyManager` with these typed methods:

| Method | Returns | Description |
|--------|---------|-------------|
| `getModules()` | `Promise<ModuleInfo[]>` | List all modules with metadata |
| `enableModule(id)` | `Promise<void>` | Enable a module |
| `disableModule(id)` | `Promise<void>` | Disable a module |
| `getModuleUI(id)` | `Promise<ModuleUISpec \| null>` | Fetch dynamic UI spec from kernel |
| `executeModuleAction(id, actionId, values)` | `Promise<unknown>` | Run a module action |
| `getModuleOutput(id, outputId)` | `Promise<unknown>` | Fetch stored output |
| `scanImage(path)` | `Promise<unknown>` | OCR scan shortcut |
| `calculateDamage(request)` | `Promise<unknown>` | Damage calc shortcut |
| `openImageDialog()` | `Promise<string \| null>` | Native file picker for images |
| `saveJsonFile(name, content)` | `Promise<string \| null>` | Native save dialog |
| `checkGameUpdatesNow()` | `Promise<{ok, checked}>` | Trigger update check |
| `on(event, handler)` | `Unsubscribe` | Subscribe to kernel events |

---

## 8. Theme System

CSS custom properties (defined in `index.css`, controlled by `themeStore`):

| Variable | Default (Dark) | Purpose |
|----------|----------------|---------|
| `--bg` | `#0f0f0f` | Base background |
| `--bg-alt` | `#1a1a1a` | Panel/card background |
| `--fg` | `#e0e0e0` | Primary text |
| `--muted` | `#808080` | Secondary text |
| `--accent` | `#3b82f6` | Primary actions, focus rings, active states |
| `--border` | `rgba(255,255,255,0.1)` | Borders, dividers |
| `--error` | `#ef4444` | Danger states |
| `--ok` | `#4ade80` | Success states |

**Presets** (in `themeStore`): Dark, Midnight, High Contrast, etc.

### Liquid Glass Design (2026-07-07)

All three layout columns use a **Liquid Glass** aesthetic — frosted glass with very low opacity fills and heavy blur, rather than solid semi-transparent backgrounds.

**Tailwind tokens (in `App.tsx`):**
| Token | Value | Purpose |
|-------|-------|---------|
| `glassBase` | `bg-white/[0.02] backdrop-blur-2xl border border-white/[0.08]` | Column containers |
| `glassHover` | `hover:bg-white/[0.04] hover:border-white/[0.12]` | Hover elevation |
| `glassActive` | `bg-white/[0.06] border-white/[0.15] shadow-[0_0_20px_rgba(59,130,246,0.12)]` | Active/selected items |
| `sectionHeader` | `px-4 py-3 border-b border-white/[0.06] backdrop-blur-md bg-white/[0.02]` | Section headers |
>+++++++ REPLACE


---

## 9. What Modules MUST Provide

To integrate with the architecture, a module's `manifest.ts` or kernel-side `module:ui-spec` handler must return a `ModuleUISpec`:

```ts
{
  fields: FieldSpec[],      // Input form
  actions: ActionSpec[],    // Buttons
  outputs: OutputSpec[]     // Result tabs
}
```

That's it. The renderer handles all chrome, layout, validation, loading states, output rendering, and error handling.

---

## 10. Extensibility Points

| Need | How |
|------|-----|
| Custom field type | Add to `FieldInput.tsx` switch, update `FieldSpec.type` union |
| Custom output kind | Add case to `ModuleOutputViewer.tsx` |
| Custom action style | Add to `ActionSpec.style` union + CSS |
| Truly custom module UI | Add to `CUSTOM_PANELS` in `ContentArea.tsx` |
| New theme preset | Add to `themeStore.presets` |
| New sidebar group tag | Add tag to module's `ModuleInfo.tags` |

---

## 11. External UI Binding Layer

An externally-built UI can use [`docs/variables.json`](../docs/variables.json) as the
single source of truth for variable names, types, backend paths, and validation
ranges.

**Variable naming convention:**
- `<module_short>_<field_id>` — e.g. `damage_calc_crit_rate`
- Character-scoped paths include `{charId}` which the external UI replaces
  with the value of the character selector variable at runtime.

**Wiring pattern:**

```
External variable ──► backend path via shared state
     │
     │  on change
     ▼
window.frequencyManager.setSharedState(path, value, gameRule)
     │
     │  auto-clamp + notify
     ▼
shared state ──► all subscribers (other variables, modules, UI)
```

**Action wiring:**

```
External button ──► window.frequencyManager.executeModuleAction(moduleId, actionId, {
  var1: currentValue1,
  var2: currentValue2,
})
     │
     ▼
module backend returns { outputs: { ... } }
     │
     ▼
External UI reads output variables from shared state or action return value
```

## 12. Dynamic Game Options (Game-Agnostic UI)

When the active game changes (e.g. WuWa → Genshin), the UI must update its
dropdown options without reloading the page or changing variable names.

**How it works:**

1. User selects a new game in `game_loader_game_id` and clicks the
   `game-loader:load` action.
2. Backend resolves the new `GameDefinition` and broadcasts `game:loaded`.
3. The UI calls `window.frequencyManager.executeModuleAction('game-loader', 'get-options', {})`.
4. Backend returns `{ characters, setNames, weaponTypes, elements, categories, hiddenCategories, inventoryTabs }` derived
   from `GameDefinition.uiOptions`.
5. The UI updates the dropdown options for `damage_calc_character_id` in-place.
6. The sidebar categories and inventory tabs update immediately via `useGameUI()` hook.
7. All other variables stay the same — only the option lists change.

**RPC signature:**
```
game:get-options → { 
  characters: Array<{value, label}>, 
  setNames: string[], 
  weaponTypes: string[], 
  elements: string[],
  categories?: CategoryUI[],
  hiddenCategories?: string[],
  inventoryTabs?: InventoryTabUI[]
}
```

**GameDefinition contract addition** (`shared/types/game-definition.ts`):
```ts
uiOptions?: {
    characters: Array<{ value: string; label: string }>;
    setNames: string[];
    weaponTypes: string[];
    elements: string[];
    categories?: CategoryUI[];
    hiddenCategories?: string[];
    inventoryTabs?: InventoryTabUI[];
};

interface CategoryUI {
    id: string;           // Unique category id (e.g., 'calculator')
    label: string;        // Human-readable label
    icon?: string;        // Optional emoji or icon hint
}

interface InventoryTabUI {
    id: string;           // Unique tab id
    label: string;        // Human-readable label
    slot?: 'characters' | 'weapons' | 'echoes' | 'artifacts'; // Content slot type
}
```

Each game package (e.g. `wuthering-waves/`, `genshin-impact/`) must populate
`uiOptions` when the app starts. This keeps the UI game-agnostic:
- One set of variables
- One set of backend paths
- One UI codebase
- Dropdown content, sidebar categories, and inventory tabs change at runtime

---

## 13. Dynamic Sidebar Categories & Inventory Tabs

The sidebar categories and inventory tabs are now fully game-driven.

### 13.1 Default Categories

If a game does NOT provide `uiOptions.categories`, these defaults are shown:

| ID | Label | Icon |
|----|-------|------|
| `calculator` | Calculator | 🔢 |
| `scanner` | Scanner | 📷 |
| `inventory` | Inventory | 🎒 |
| `rotation` | Rotation | 🔄 |

### 13.2 Category Resolution Logic

```typescript
const categories = gameOptions
    ? (() => {
        const extras = gameOptions.categories ?? [];
        const hidden = new Set(gameOptions.hiddenCategories ?? []);
        
        // Start with defaults, filter hidden
        const base = DEFAULT_CATEGORIES.filter(c => !hidden.has(c.id));
        
        // Override/append game-defined categories
        const extraMap = new Map(extras.map(e => [e.id, e]));
        const merged = base.map(c => extraMap.get(c.id) ?? c);
        
        // Append new categories not in defaults
        const newCats = extras.filter(e => !DEFAULT_CATEGORIES.some(d => d.id === e.id));
        return [...merged, ...newCats];
    })()
    : [...DEFAULT_CATEGORIES];
```

### 13.3 Game Capabilities

| Capability | How to Achieve |
|------------|----------------|
| **Add a category** | Add to `uiOptions.categories` with new `id` |
| **Remove a default** | Add id to `uiOptions.hiddenCategories` |
| **Rename a default** | Add to `uiOptions.categories` with same `id`, different `label`/`icon` |
| **Reorder categories** | Provide full `uiOptions.categories` array in desired order |
| **Define inventory tabs** | Add to `uiOptions.inventoryTabs` |

### 13.4 Inventory Tabs

The Inventory category renders sub-tabs based on `uiOptions.inventoryTabs`.

**Default Inventory Tabs by Game:**

**Wuthering Waves:**
```typescript
[
    { id: 'characters', label: 'Characters', slot: 'characters' },
    { id: 'weapons', label: 'Weapons', slot: 'weapons' },
    { id: 'echoes', label: 'Echoes', slot: 'echoes' },
]
```

**Genshin Impact:**
```typescript
[
    { id: 'characters', label: 'Characters', slot: 'characters' },
    { id: 'weapons', label: 'Weapons', slot: 'weapons' },
    { id: 'artifacts', label: 'Artifacts', slot: 'artifacts' },
]
```

**Slot Types:**

| Slot | Purpose | Content Source |
|------|---------|----------------|
| `characters` | Character list | `GameDefinition.uiOptions.characters` |
| `weapons` | Weapon list | `GameDefinition.uiOptions.weaponTypes` |
| `echoes` | Echo/equipment list | `GameDefinition.uiOptions.setNames` (WU) |
| `artifacts` | Artifact list | `GameDefinition.uiOptions.setNames` (GI) |

---

## 14. Hook API: `useGameUI()`

Components can consume the dynamic UI via the `useGameUI` hook:

```typescript
import { useGameUI } from '@/hooks/useGameUI';

function MyComponent() {
    const { 
        categories,           // CategoryUI[] — final computed categories
        inventoryTabs,        // InventoryTabUI[] — final computed tabs
        activeCategory,       // string — currently selected category id
        setActiveCategory,    // (id: string) => void
        gameOptions,          // GameOptions | null — raw options from IPC
        loading,              // boolean — initial fetch in progress
    } = useGameUI();

    return (
        <nav>
            {categories.map(cat => (
                <button 
                    key={cat.id} 
                    onClick={() => setActiveCategory(cat.id)}
                    className={activeCategory === cat.id ? 'active' : ''}
                >
                    {cat.icon} {cat.label}
                </button>
            ))}
        </nav>
    );
}
```

---

## 15. Content Slot Mapping

Categories map to content slots via a registry in `ContentArea.tsx`. Current mappings:

| Category ID | Content Slot | Component |
|-------------|--------------|-----------|
| `calculator` | `calculator` | `DamageCalculatorPanel` |
| `scanner` | `scanner` | `OcrScannerPanel` |
| `inventory` | `inventory` | `InventoryPanel` (uses `inventoryTabs`) |
| `rotation` | `rotation` | `RotationBuilderPanel` |

To add a custom category, extend the slot registry in `src/renderer/src/components/ContentArea.tsx`:

```typescript
const CONTENT_SLOTS: Record<string, React.ComponentType<{ gameOptions: GameOptions }>> = {
    calculator: DamageCalculatorPanel,
    scanner: OcrScannerPanel,
    inventory: InventoryPanel,
    rotation: RotationBuilderPanel,
    // Add custom slots here
    'team-builder': TeamBuilderPanel,
};
```

---

## 16. Summary: Architecture-Provided UI Inventory (Updated)

### Layout & Chrome
- ✅ Frameless window with custom TitleBar
- ✅ **Dynamic three-column responsive layout** (Sidebar | Content | Settings) — categories driven by active game
- ✅ Resizable right sidebar with persistence
- ✅ Bottom StatusBar with health metrics

### Module Workspace (Generic)
- ✅ Module header (icon, name, version, description, enable badge)
- ✅ Responsive form grid from `FieldSpec[]`
- ✅ 8 field types (text, number, select, multiselect, boolean, file, image, rotation)
- ✅ Sticky action bar from `ActionSpec[]` (4 styles, validation, confirm)
- ✅ Tabbed output viewer from `OutputSpec[]` (6 kinds: stat, table, list, chart, json, image)
- ✅ Loading, empty, and error states for all outputs

### Complex Components
- ✅ RotationBuilder (full drag-drop timeline with energy viz)
- ✅ FieldInput (unified, validated, accessible)
- ✅ ModuleOutputViewer (tabs, copy, loading skeletons)
- ✅ **useGameUI() hook** — reactive game-driven UI state

### Game-Driven UI (NEW)
- ✅ **Dynamic sidebar categories** — from `GameDefinition.uiOptions.categories`
- ✅ **Category hiding/renaming/reordering** — via `hiddenCategories` and full category array
- ✅ **Dynamic inventory tabs** — from `GameDefinition.uiOptions.inventoryTabs`
- ✅ **Immediate updates on game switch** — no reload needed
- ✅ **Per-game defaults** — WU gets Echoes, GI gets Artifacts

### Settings & Config
- ✅ Theme selector with presets
- ✅ Dev mode toggle
- ✅ Module enable/disable management
- ✅ Update checker with auto-check
- ✅ About/version panel

### Developer Tools
- ✅ DevPanel (event log, health, config, action tester)
- ✅ Structured logging with correlation IDs

### Bridge & Integration
- ✅ Type-safe preload bridge (`window.frequencyManager`)
- ✅ Kernel event subscription
- ✅ Dynamic UI spec fetching from kernel
- ✅ Mock executor for Docker/preview mode
- ✅ **Extended `getGameOptions` RPC** — returns categories, hiddenCategories, inventoryTabs

### Theming
- ✅ CSS variable system
- ✅ Multiple presets
- ✅ Instant switching (no reload)

---

**This is the complete UI contract.** Any module that declares a `ModuleUISpec` gets all of the above for free. Custom UIs are only needed for truly unique workflows (like a node-graph editor or 3D viewer) — everything else fits in this schema.
