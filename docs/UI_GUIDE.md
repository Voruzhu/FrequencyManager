# FrequencyManager — UI Guide

A map of the renderer UI: what each region is for, what each screen does, and the
shared building blocks. The UI runs on **mock data** for now (no backend wiring);
every screen is written so a real backend drops in later without markup changes.

Renderer source: `src/renderer/src`. `@` = that `src`.

---

## 1. Layout regions (the app shell)

The window is a fixed frame (`components/shell/AppShell.tsx`) laid out as:

```
┌─────────────────────────────────────────────────────────────┐
│  TOP BAR                                     [game ▾]  _ ▢ ✕ │   ← TopBar.tsx
├───┬──────────────────────────────────┬──────────────────────┤
│ N │                                  │                      │
│ A │        CENTER WORKSPACE          ║      INSPECTOR       │   ║ = drag handle
│ V │        (active screen)           ║      (right panel)   │
│   │                                  │                      │
├───┴──────────────────────────────────┴──────────────────────┤
│  STATUS BAR                                                  │   ← StatusBar.tsx
└─────────────────────────────────────────────────────────────┘
```

| Region | File | Purpose |
| --- | --- | --- |
| **Top bar** | `shell/TopBar.tsx` | App mark + wordmark (drag region), the **active-game selector**, and the frameless **window controls** (minimize / maximize / close). Theme selection was moved out of here into Settings → Appearance. |
| **Window controls** | `shell/WindowControls.tsx` | Min/max/close. Currently no-ops — the `window:*` IPC isn't wired yet; each button optional-chains a preload method so it lights up automatically when that's added. |
| **Nav rail** | `shell/NavRail.tsx` | Slim icon-only navigation. Dashboard is always shown; the game-driven screens (Calculator/Scanner/Inventory/Rotation) are filtered by the active game's categories; Settings sits at the bottom. Hover shows a tooltip label. The active screen is owned by `stores/uiStore.ts` (single source of truth). |
| **Center workspace** | `shell/Workspace.tsx` | Renders the active screen from `screens/registry.tsx`. This is the main working area — browse, configure, calculate. |
| **Inspector (right)** | `shell/InspectorPanel.tsx` | Shows details of the **currently selected item** (character / weapon / echo / artifact) so the center area stays focused on browsing instead of expanding everything inline. Collapsible via the panel-icon button; re-open with the tab on the right edge. |
| **Resize** | `ui/resizable.tsx` | The center ↔ inspector split is **draggable** (grab the handle between them). The layout size is remembered between sessions (`autoSaveId`). Min/max widths are enforced. |
| **Status bar** | `shell/StatusBar.tsx` | Module enabled/total count, app version, overall health dot, and a DEV MODE tag when developer mode is on. |

### Selection model
Any screen can call `useSelectionStore().select(item)` to push a character/weapon/gear
into the Inspector. Selecting a character in the Calculator or Inventory updates the
right panel. `selectionStore` also owns whether the inspector is open.

---

## 2. Screens (center workspace)

Registered in `screens/registry.tsx`; each is a file under `screens/`.

### Dashboard — `DashboardScreen.tsx`
The landing overview. Contains:
- **Stat tiles**: active game, modules enabled, system health, app version.
- **Active Game card**: name, description, version of the current game.
- **Quick actions**: jump to Calculator / Scanner / Inventory.
- **Recent activity**: last outputs produced by modules (empty until you run something).

### Damage Calculator — `CalculatorScreen.tsx`
A build optimizer modeled on Genshin Optimizer. Flow:
1. **Select a character** (top-right selector). This also mirrors the character into the Inspector.
2. **Character summary** appears: stats grid, skills (with damage multipliers), and equipped weapon + gear.
3. **Optimization targets**:
   - **Maximize**: choose the objective — a skill's damage or a stat.
   - **Gear slots** (how many pieces to equip) and **Show top N** (how many loadouts to return).
   - **Constraints**: add minimum targets, e.g. *Energy Regen ≥ 200* or *Resonance Liberation ≥ 10000*. Each constraint is a `Stat`/`Skill` + a `≥` threshold.
4. **Optimize loadouts** runs a real (small) combinatorial search over your gear pool
   (`data/optimizer.ts`): it enumerates gear combinations, computes resulting stats and
   per-skill damage, filters by your constraints, and ranks by the objective.
5. **Results**: the top-N loadouts. Each row shows rank, whether it meets all targets
   (or which it misses), the objective value, the chosen gear, and the resulting key stats.

> The optimizer math is demo-grade and UI-only. The real, game-accurate engine belongs
> in a backend module; the screen only depends on `optimizer.ts`'s exported types.

### OCR Scanner — `ScannerScreen.tsx`
Two-pane. Left = **scan history**; right = **detail** of the selected scan (detected
echoes with cost/set/sub-stats + raw OCR text). **Start scan** simulates a scan and
fires a toast. Empty states guide when there's nothing selected.

### Inventory — `InventoryScreen.tsx`
Browse your collection in game-driven tabs (**Characters / Weapons / Echoes|Artifacts**).
Each item is a tile with a placeholder icon, name, and badges. **Click a tile to inspect
it** in the right panel. The gear tab is labeled per game (Echoes for WuWa, Artifacts for Genshin).

### Rotation — `RotationScreen.tsx`
Wraps the rotation builder (`components/modules/RotationBuilder.tsx`): add character
actions to a timeline, set durations and energy, and watch the total time / net energy.

### Settings — `SettingsScreen.tsx`
Tabbed, consolidating what used to be scattered panels:
- **Appearance** — theme preset picker (applies live; swatches preview each preset).
- **Game** — active game selector.
- **Modules** — enable/disable feature modules.
- **Updates** — game-definition update table + "Check now".
- **Data** — JSON export / import.
- **Developer** — toggle developer mode (shows the Dev panel).
- **About** — version info.

---

## 3. Theming

- Four presets (Midnight / Neon / Light / Amber) live in `lib/theme.ts` as full **color-role**
  sets (`--background`, `--surface`, `--primary`, `--border`, …) expressed as RGB channels.
- `applyPreset()` writes those to `<html>`, so switching a theme recolors the whole app live.
- Change the theme in **Settings → Appearance**. The choice persists across restarts and is
  applied before first paint (no flash).
- Font is **IBM Plex Sans / Mono**, bundled locally (works under the strict CSP).

---

## 4. Shared building blocks (`components/ui/`)

Built on shadcn/ui + Radix. Highlights:
- **ItemIcon** (`ui/item-icon.tsx`) — the **placeholder art tile** for characters / weapons /
  echoes / artifacts (a bordered square with a kind icon + rarity ring). Swap in real images
  later via its `src` prop with no call-site changes.
- **StatTile** — KPI/metric tile (Dashboard, results).
- **PageHeader / EmptyState / Table / Dialog / Select / DropdownMenu / Avatar / Tooltip / Tabs / Toaster** — standard kit.
- **Resizable** — draggable panel splitter (used for center ↔ inspector).

Token rule: use `bg-surface` / `bg-surface-2` / `bg-secondary` for muted surfaces; `text-muted-foreground`
for secondary text. (The legacy `muted` alias means muted *text*, not a surface.)

---

## 5. Game-module-driven UI (the extension pattern)

The UI renders from the **active game module's data**, not from hardcoded lists.
The module (`data/gameData.ts`, later the real backend `GameDefinition`) declares:

| Module field | Drives |
| --- | --- |
| `statCatalog` (`StatDef[]`: key, label, percent) | Character summary stats, Inspector stats, optimizer stat targets, loadout stat grids, which **basic buffs** are offered (a buff whose stat isn't in the catalog is hidden — e.g. Elemental Mastery never appears for Wuthering Waves), and per-game labels (GI shows "Energy Recharge", WuWa "Energy Regen"). The generic `elemDmg` entry is displayed with the character's element ("Spectro DMG", "Pyro DMG"). |
| `characters[].skills` | Skill lists everywhere: summary, Inspector, optimization skill targets, rotation editor, Talents window. |
| `gearKind` / `gearLabel(Plural)` | Echo vs Artifact naming across Inventory, pickers, tabs. |
| `maxGear` | Equip cap (default 5). |
| `getSequenceLabel(gameId)` | "Sequence" (WuWa) vs "Constellation" (GI) in the Talents window. |
| `getEnemies(gameId)` | The enemy picker's boss list. |
| `getBuffs(gameId)` | Character-sourced buffs + catalog-filtered basic buffs. |

**To add a new stat to a game**: add one `StatDef` to its `statCatalog` (and, if
gear/buffs should feed it, use its key — `xyz` flat, `xyzPct` percent-scaling).
Every stat surface picks it up automatically; no screen code changes.

`computeBuildStats` (`data/optimizer.ts`) is fully generic over the catalog:
`*Pct` keys scale their base stat, the character's own element key feeds
`elemDmg` (off-element bonuses stay inert), everything else adds flat.

## 6. What's mock vs real (current state)

| Area | State |
| --- | --- |
| All screens | Render from **mock data** (`data/gameData.ts`, per-screen mocks). |
| Damage optimizer | Real combinatorial search, **demo math** (`data/optimizer.ts`). |
| Item icons | **Placeholder** shapes — real art pending. |
| Window min/max/close | No-op until `window:*` IPC is wired. |
| Kernel modules (OCR, damage engine, game switching) | **Not loaded** — separate backend task. |

---

*Files of interest: `components/shell/*` (layout), `screens/*` (screens),
`components/ui/*` (kit), `data/gameData.ts` + `data/optimizer.ts` (mock data & optimizer),
`stores/*` (uiStore, selectionStore, gameStore, themeStore, moduleStore).*
