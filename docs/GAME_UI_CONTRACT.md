# FrequencyManager — Game-Driven UI Contract

This document describes the **dynamic UI contract** between game definitions and the FrequencyManager renderer. Game definitions can now control sidebar categories and inventory tabs at runtime without code changes.

---

## 1. Overview

When a game definition is loaded, the renderer reads `GameDefinition.uiOptions` to derive:

1. **Sidebar Categories** — What appears in the left navigation
2. **Inventory Tabs** — Sub-tabs inside the Inventory category

The UI updates **immediately** when the active game changes (no reload needed).

---

## 2. GameDefinition.uiOptions Extension

```typescript
interface GameDefinition {
    // ... existing fields
    uiOptions?: {
        // Existing fields
        characters: Array<{ value: string; label: string }>;
        setNames: string[];
        weaponTypes: string[];
        elements: string[];

        // NEW: Dynamic UI fields
        categories?: CategoryUI[];
        hiddenCategories?: string[];
        inventoryTabs?: InventoryTabUI[];
    };
}

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

---

## 3. Default Categories

If a game does NOT provide `uiOptions.categories`, these defaults are shown:

| ID | Label | Icon |
|----|-------|------|
| `calculator` | Calculator | 🔢 |
| `scanner` | Scanner | 📷 |
| `inventory` | Inventory | 🎒 |
| `rotation` | Rotation | 🔄 |

### Category Resolution Logic

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

---

## 4. Game Capabilities

| Capability | How to Achieve |
|------------|----------------|
| **Add a category** | Add to `uiOptions.categories` with new `id` |
| **Remove a default** | Add id to `uiOptions.hiddenCategories` |
| **Rename a default** | Add to `uiOptions.categories` with same `id`, different `label`/`icon` |
| **Reorder categories** | Provide full `uiOptions.categories` array in desired order |
| **Define inventory tabs** | Add to `uiOptions.inventoryTabs` |

---

## 5. Inventory Tabs

The Inventory category renders sub-tabs based on `uiOptions.inventoryTabs`.

### Default Inventory Tabs by Game

If not specified, these fallbacks are used:

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

### Slot Types

| Slot | Purpose | Content Source |
|------|---------|----------------|
| `characters` | Character list | `GameDefinition.uiOptions.characters` |
| `weapons` | Weapon list | `GameDefinition.uiOptions.weaponTypes` |
| `echoes` | Echo/equipment list | `GameDefinition.uiOptions.setNames` (WU) |
| `artifacts` | Artifact list | `GameDefinition.uiOptions.setNames` (GI) |

---

## 6. Example: Adding a "Team Builder" Category

```typescript
// In game definition (e.g., adapters/game-definitions/my-game/definition.ts)
export const myGame: GameDefinition = {
    // ... existing fields
    uiOptions: {
        characters: [...],
        setNames: [...],
        weaponTypes: [...],
        elements: [...],
        
        // Add custom category
        categories: [
            { id: 'calculator', label: 'Calculator', icon: '🔢' },
            { id: 'scanner', label: 'Scanner', icon: '📷' },
            { id: 'inventory', label: 'Inventory', icon: '🎒' },
            { id: 'rotation', label: 'Rotation', icon: '🔄' },
            { id: 'team-builder', label: 'Team Builder', icon: '👥' },  // NEW
        ],
        
        inventoryTabs: [
            { id: 'characters', label: 'Characters', slot: 'characters' },
            { id: 'weapons', label: 'Weapons', slot: 'weapons' },
            { id: 'echoes', label: 'Echoes', slot: 'echoes' },
        ],
    },
};
```

The renderer will:
1. Show "Team Builder" in the sidebar after Rotation
2. Call the content slot for `team-builder` (needs a mapping in `ContentArea.tsx`)

---

## 7. Content Slot Mapping

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

## 8. Preload Bridge Extension

The `getGameOptions` RPC now returns the extended shape:

```typescript
// In preload.ts
getGameOptions: (): Promise<{
    characters: Array<{ value: string; label: string }>;
    setNames: string[];
    weaponTypes: string[];
    elements: string[];
    // NEW
    categories?: CategoryUI[];
    hiddenCategories?: string[];
    inventoryTabs?: InventoryTabUI[];
} | null> => ipcRenderer.invoke('game-loader:get-options'),
```

---

## 9. Hook API: `useGameUI()`

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

## 10. Migration from Static UI

### Before (Static)
```typescript
// App.tsx
const CATEGORIES = [
    { id: 'calculator', label: 'Calculator' },
    { id: 'scanner', label: 'Scanner' },
    { id: 'inventory', label: 'Inventory' },
    { id: 'rotation', label: 'Rotation' },
];
```

### After (Dynamic)
```typescript
// App.tsx
const { categories, activeCategory, setActiveCategory } = useGameUI();
```

No breaking changes — games without `uiOptions` get the defaults.

---

## 11. Testing Checklist

When adding a new game or modifying UI options:

- [ ] `uiOptions.characters` populated from character database
- [ ] `uiOptions.setNames` populated from equipment sets
- [ ] `uiOptions.weaponTypes` matches `character.weapons`
- [ ] `uiOptions.elements` matches `character.elements`
- [ ] `uiOptions.inventoryTabs` defines correct slot types
- [ ] Categories render in sidebar after game load
- [ ] Switching games updates categories immediately
- [ ] Inventory tabs render correct content per slot
- [ ] Hiding a default category works
- [ ] Adding a new category works

---

## 12. Layout & Design Architecture

The renderer uses a **triple-column layout** driven by the active game definition.

### 12.1 Triple-Column Layout

```
┌─────────────────┬─────────────────────────────┬─────────────────┐
│  Sidebar        │  Content                    │  Settings       │
│  (Categories)   │  (Active Category Panel)    │  (Right Panel)  │
├─────────────────┼─────────────────────────────┼─────────────────┤
│                 │                             │                 │
│  Categories     │  DamageCalculatorPanel      │  Appearance     │
│  ───────────    │  InventoryPanel             │  Developer      │
│  Scanner        │  OcrScannerPanel            │  Modules        │
│  Inventory      │  RotationBuilderPanel       │  Updates        │
│  Rotation       │  (or custom slot)             │  About          │
│                 │                             │                 │
└─────────────────┴─────────────────────────────┴─────────────────┘
              TitleBar (top, frameless)
              StatusBar (bottom)
```

| Column | Width | Purpose |
|--------|-------|---------|
| **Left** | `w-60` (240px) | Category navigation from `useGameUI().categories` |
| **Center** | `flex-1` | Active category's content panel |
| **Right** | `w-80` (320px) | Persistent settings sidebar (resizable) |

### 12.2 Liquid Glass Design System

All three columns share the **Liquid Glass** aesthetic — a frosted glass treatment using Tailwind CSS with very low opacity white fills and backdrop blur:

```css
/* Base surface */
background: rgba(255, 255, 255, 0.02);
backdrop-filter: blur(40px);
border: 1px solid rgba(255, 255, 255, 0.08);
```

**Tokens used in App.tsx:**
| Token | Value | Purpose |
|-------|-------|---------|
| `glassBase` | `bg-white/[0.02] backdrop-blur-2xl border border-white/[0.08]` | Column containers |
| `glassHover` | `hover:bg-white/[0.04] hover:border-white/[0.12]` | Hover elevation |
| `glassActive` | `bg-white/[0.06] border-white/[0.15] shadow-[0_0_20px_rgba(59,130,246,0.12)]` | Active/selected items |
| `sectionHeader` | `px-4 py-3 border-b border-white/[0.06] backdrop-blur-md bg-white/[0.02]` | Section headers |

### 12.3 Persistent Settings Sidebar

The `SettingsSidebar` is now a **first-class layout element**, not an overlay. It is always visible in the right column and includes:

- **Appearance** — Theme selector (driven by `useThemeStore`)
- **Developer** — Toggle for dev mode (driven by `useDevStore`)
- **Modules** — Enable/disable modules (driven by `useModuleStore`)
- **Updates** — Auto-check toggle and manual check button
- **About** — Version and tech stack info

## 13. Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-07-07 | Initial dynamic UI contract |
