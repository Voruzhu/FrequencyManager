# FrequencyManager — Shared State & Stat Validation System

> **Status**: Implemented (renderer side) — kernel-side enforcement pending.

This document describes the cross-module data layer that lets any module read values that other modules (OCR, JSON Importer, manual edits) write, with built-in validation against game-specific stat rules.

---

## 1. Overview

The shared state is a single, global, **reactive key-value store** that lives in the renderer's `moduleStore.shared`. It is the canonical place for any value that:
- Comes from an external source (OCR screenshot, JSON file, game DB)
- Is consumed by more than one module
- Needs validation against game rules
- Needs a baseline/default for revert/reset semantics

### Why a shared store?

Without it, every module would need to manually wire up data exchange. With it:
- OCR-Scanner writes `state.echoes` → Damage Calculator reads from `state.echoes` automatically
- JSON Importer calls `shared.merge(path, newData)` → gets a `MergeDiff` for the conflict UI
- User edits a CRIT Rate value → validated against `character-stats.critRate` rule → clamped to [0, 100]

---

## 2. Shared State Tree

The state is a nested object. Common top-level keys (convention, not enforced):

```ts
{
  currentGame: { id, displayName, version, loaded, lastLoaded },
  characters: { [characterId]: { name, baseStats, equippedEchoes[] } },
  echoes:     { [echoId]: { name, mainStat, subStats[], cost, level, source, lastModified } },
  enemies:    { [enemyId]: { name, level, resistances } },
  calculations: { [calcId]: { timestamp, totalDps, breakdown, rotation, characterId } },
  _meta:      { /* per-key provenance metadata */ }
}
```

### Ownership

| Path | Owned by | Read by |
|------|----------|---------|
| `currentGame` | `game-loader` | All |
| `characters.*` | User / game DB | `damage-calculator`, `ocr-scanner` |
| `echoes.*` | `ocr-scanner`, `json-importer`, user | `damage-calculator` |
| `enemies.*` | User / game DB | `damage-calculator` |
| `calculations.*` | `damage-calculator` | All (history) |

Any module can read any path. Writes are validated by `gameRule`.

---

## 3. API Reference

The shared state store is exposed as `useModuleStore.getState().shared` (Zustand).

### `get(path: string): unknown`
Read a value by dot-path.
```ts
const atk = shared.get('characters.rover-spectro.baseStats.atk'); // 800
```

### `set(path: string, value: unknown, gameRule?: GameRuleRef): unknown`
Write a value. If `gameRule` is provided, numeric values are auto-clamped.
```ts
shared.set('characters.rover.atk', 1500, 'character-stats.atk'); // clamped to 1500
shared.set('characters.rover.atk', 99999, 'character-stats.atk'); // clamped to 9999
```
Returns the **clamped value** that was actually stored.

### `merge(path: string, newData: unknown): MergeDiff`
Diff-based merge — used by JSON Importer for the conflict UI.
```ts
const diff = shared.merge('echoes', importedEchoes);
// diff = { added: ['e3','e4'], removed: ['e1'], modified: [] }
```

### `reset(path: string): void`
Reset a path to its default value. Clears the dirty flag.

### `markClean(path: string): void`
Mark a path as clean (baseline = current). Called after the user confirms a change.

### `isDirty(path: string): boolean`
True if the current value differs from the baseline.

### `subscribe(path: string, handler: (value: unknown) => void): () => void`
Subscribe to changes at a path. Returns an unsubscribe function.

---

## 4. FieldSpec State Binding

`FieldSpec` now supports two new properties for declarative data binding:

```ts
{
  id: 'critRate',
  label: 'CRIT Rate',
  type: 'number',
  source: 'state',                              // bind to shared state
  statePath: 'characters.rover-spectro.baseStats.critRate',
  gameRule: 'character-stats.critRate',          // apply validation
  min: 0,
  max: 100,
  step: 0.1,
}
```

When a field has `source: 'state'` and `statePath`:
- **On mount**: the input reads the current value from shared state
- **On user edit**: the input writes to shared state (with clamping via `gameRule`)
- **On external write**: any other module that updates this path triggers a re-render of the input

This means a Damage Calculator CRIT Rate field automatically reflects the latest value from OCR, JSON import, or game DB — no manual data flow code.

### Game Rules

`GameRuleRef` is a union of rule ids:
```ts
'character-stats.atk' | 'character-stats.hp' | 'character-stats.def' |
'character-stats.critRate' | 'character-stats.critDmg' |
'character-stats.energyRegen' | 'character-stats.elementalMastery' |
'character-stats.healingBonus' | 'character-stats.effectHitRate' |
'character-stats.effectRes' |
'echo.mainStat' | 'echo.subStat'
```

These map to ranges in the active `GameDefinition.statRules`.

---

## 5. Stat Validation Rules (Game Definition)

Each game definition exports a `StatRules` object that the kernel and renderer both consult.

### Character Rules

```ts
character: {
  baseStats: {
    'rover-spectro': { atk: 800, hp: 12000, def: 600, critRate: 5, critDmg: 50, energyRegen: 100 },
    'jinhsi':       { atk: 850, hp: 11500, def: 580, critRate: 5, critDmg: 50, energyRegen: 100 },
  },
  maxStats: {
    atk: 9999, hp: 99999, def: 9999,
    critRate: 100, critDmg: 800, energyRegen: 500,
    elementalMastery: 2000, healingBonus: 200,
    effectHitRate: 200, effectRes: 200,
  },
}
```

`baseStats` is the **game-accurate zero-buff value** — this is what the "Reset to default" button restores to.

`maxStats` is the **absolute maximum** for any buffed character.

### Equipment Rules (Echoes / Artifacts)

```ts
echoes: {
  mainStatCaps: {
    'ATK%':     { 1: 18, 3: 33, 4: 42 },
    'CRIT Rate': { 1: 9,  3: 17, 4: 22 },
    'CRIT DMG':  { 1: 18.4, 3: 33.6, 4: 43.2 },
    // ...all StatTypes
  },
  subStatCaps: {
    'CRIT Rate': { maxPerRoll: 3.9, maxTotal: 39 },
    'CRIT DMG':  { maxPerRoll: 7.8, maxTotal: 78 },
    // ...all StatTypes
  },
}
```

`mainStatCaps[statType][cost]` returns the maximum value for that main stat at that cost. **An echo with 50 CRIT Rate from a cost-4 main stat is impossible** — the kernel/renderer will clamp it to 22 and warn the user.

`subStatCaps[statType].maxPerRoll` is the max value one sub-stat roll can give. `maxTotal` is the cumulative max across all 5 sub-stat slots.

---

## 6. Dirty / Baseline / Default Model

Every value in shared state has three conceptual states:

| State | Meaning |
|-------|---------|
| **default** | The game-accurate value with zero buffs (from `GameDefinition.statRules.character.baseStats`) |
| **baseline** | The last saved/synced value (from OCR, JSON import, etc.) |
| **current** | What the user sees in the UI right now |

Transitions:
- **OCR scan / JSON import** → `current = baseline = newData`
- **User edits in UI** → `current = edited; baseline unchanged; dirty = true`
- **Revert** → `current = baseline; dirty = false`
- **Reset** → `current = default; baseline = default; dirty = false`

The `dirty` flag is set automatically by `set()` and cleared by `markClean()` / `reset()`.

---

## 7. Conflict Resolution on Import

When `JSON Importer` calls `shared.merge('echoes', importedData)`:
1. Returns `MergeDiff` with `added[]`, `removed[]`, `modified[]`
2. UI shows diff count: `+12 added, -3 removed, 5 modified`
3. User has three options:
   - **Keep current** — discard the import
   - **Replace with new** — overwrite (sets baseline = newData)
   - **Merge manually** — show per-key choice UI (pending implementation)

The renderer is responsible for rendering the conflict UI; the store only provides the diff.

---

## 8. External UI Integration

Any external UI (a custom renderer view, a generated frontend, etc.) can
consume this directly:

```ts
const shared = useModuleStore.getState().shared;

// Read
const atk = shared.get('characters.rover-spectro.baseStats.atk');

// Write with validation
shared.set('characters.rover.critRate', 80, 'character-stats.critRate');

// Subscribe to changes (e.g., for live damage re-calc)
const unsub = shared.subscribe('characters.rover.critRate', (newVal) => {
  recalculateDamage(newVal);
});

// Detect conflicts
const diff = shared.merge('echoes', importedData);
```

### Replacing the Generic UI

Any field can be rendered by setting `statePath` + `gameRule` on the spec — the renderer auto-binds. Or a custom UI can call `shared.set/get` directly.

---

## 9. Future Work (Pending)

| Feature | Status | Notes |
|---------|--------|-------|
| Renderer-side state binding | ✅ Done | FieldInput subscribes to shared state |
| Validation rules in game defs | ✅ Done | wutheringWavesStatRules added |
| Subscribers + dirty tracking | ✅ Done | API + tests |
| Kernel-side enforcement | ⏳ Pending | Kernel will reject/clamps writes too |
| Per-key conflict UI ("merge manually") | ⏳ Pending | Currently shows only diff count |
| Persistence to disk | ⏳ Pending | Currently in-memory; add `shared-state.json` |
| Output validation (warn invalid stats) | ⏳ Pending | ModuleOutputViewer doesn't yet check ranges |

---

## 10. Migration Guide for Modules

### Before (no shared state)
```ts
// OCR-Scanner had no way to share results with Damage Calculator
return { outputs: { echoes: [...] } }; // stored in moduleStore.outputs['ocr-scanner'].echoes
```

### After (shared state)
```ts
// OCR-Scanner writes to shared state
const echoes = parseScreenshot(image);
shared.set('echoes', echoes, 'echo.subStat');
// Damage Calculator can now read them via state binding
return { outputs: { echoes } };
```

### Before (hardcoded validation)
```ts
if (value < 0 || value > 100) value = Math.max(0, Math.min(100, value));
```

### After (declarative)
```ts
shared.set('path.to.stat', value, 'character-stats.critRate');
// Auto-clamps to [0, 100]
```

---

## 11. Files

| File | Purpose |
|------|---------|
| `shared/types/game-definition.ts` | `StatRules`, `CharacterStatRules`, `EquipmentStatRules` types |
| `adapters/game-definitions/wuthering-waves.ts` | `wutheringWavesStatRules` with WuWa cap values |
| `src/renderer/src/types/index.ts` | `GameRuleRef`, extended `FieldSpec` |
| `src/renderer/src/stores/moduleStore.ts` | `SharedStateStore` implementation |
| `src/renderer/src/components/modules/FieldInput.tsx` | State binding in the input |
| `tests/renderer/shared-state.test.ts` | 15 unit tests for the store |

---

## 12. Example End-to-End Flow

User has 0 buffs on Rover. CRIT Rate should be **5** (default).

1. User opens **Damage Calculator**
2. CRIT Rate field is bound: `statePath: 'characters.rover-spectro.baseStats.critRate'`
3. `shared.get('characters.rover-spectro.baseStats.critRate')` returns `undefined` (not set)
4. FieldInput shows the spec's `default: 5`
5. User types `9999` in the field
6. `FieldInput.onChange(9999)` → parent calls `shared.set('...critRate', 9999, 'character-stats.critRate')`
7. Store clamps to `100` (the `maxStats.critRate` ceiling)
8. `set()` notifies subscribers → FieldInput re-renders with `100`
9. User's invalid value is silently corrected, with a red border indicating the clamp (future work)

The user can click "Reset" to revert to `5` (the game-accurate base value).