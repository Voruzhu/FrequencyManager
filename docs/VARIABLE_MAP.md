# FrequencyManager — Variable Map

> This document maps every backend variable, action, and shared-state path to its frontend implementation contract. Use this as the single source of truth for what the backend provides and how the frontend consumes it.

---

## 1. How to Use This Document

1. **Variables** — Each row under a module is a frontend-bound variable.
   - `varId` is the variable identifier used in the frontend store / React context.
   - `type` tells the frontend what kind of input to render (number, text, boolean, select, rotation).
   - `path` is the shared-state path the frontend reads from and writes to.
   - `gameRule` is the validation rule the kernel clamps to. The frontend should mirror `[min, max]` for instant feedback.
   - `source` indicates whether the value is user-configurable (`user-input`) or derived from state (`state`).

2. **Actions** — Each row under "Module Actions" is a callable action.
   - Call `window.frequencyManager.executeModuleAction(moduleId, actionId, values)` where `values` is a map of `{ varId: currentValue }`.

3. **Shared State** — Paths any module can read/write via the bridge.

---

## 2. Module Variables

### 2.1 Damage Calculator

| Variable ID | Backend Path | Type | Validation (gameRule) | Min | Max | Default | Source |
|-------------|--------------|------|-----------------------|-----|-----|---------|--------|
| `damage_calc_character_id` | — | select | — | — | — | `rover-spectro` | user-input |
| `damage_calc_rotation_length` | — | number | — | 5 | 60 | `20` | user-input |
| `damage_calc_include_resonance` | — | boolean | — | — | — | `true` | user-input |
| `damage_calc_include_concerto` | — | boolean | — | — | — | `true` | user-input |
| `damage_calc_rotation` | — | rotation | — | — | — | see `RotationBuilderSpec` | user-input |
| `damage_calc_crit_rate` | `characters.{charId}.stats.critRate` | number | `character-stats.critRate` | 0 | 100 | `5` | state |
| `damage_calc_crit_dmg` | `characters.{charId}.stats.critDmg` | number | `character-stats.critDmg` | 0 | 800 | `50` | state |
| `damage_calc_atk` | `characters.{charId}.stats.atk` | number | `character-stats.atk` | 0 | 9999 | `800` | state |
| `damage_calc_hp` | `characters.{charId}.stats.hp` | number | `character-stats.hp` | 0 | 99999 | `12000` | state |
| `damage_calc_def` | `characters.{charId}.stats.def` | number | `character-stats.def` | 0 | 9999 | `600` | state |
| `damage_calc_energy_regen` | `characters.{charId}.stats.energyRegen` | number | `character-stats.energyRegen` | 0 | 500 | `100` | state |

> **Dynamic options**: The character dropdown is populated by the backend
> `game:get-options` RPC. The frontend must call it on startup and whenever the
> active game changes. Replace `{charId}` with the selected character id
> before calling backend methods.

**Note:** `{charId}` is a placeholder — replace with the value of `damage_calc_character_id` at runtime.

### 2.2 OCR Scanner

| Variable ID | Backend Path | Type | Validation | Min | Max | Default | Source |
|-------------|--------------|------|------------|-----|-----|---------|--------|
| `ocr_image_path` | — | text | — | — | — | `""` | user-input |
| `ocr_auto_add` | — | boolean | — | — | — | `true` | user-input |

**Outputs (read-only):**
- `ocr_echoes` — array of detected echoes
- `ocr_raw` — raw OCR result JSON

### 2.3 JSON Importer

| Variable ID | Backend Path | Type | Validation | Min | Max | Default | Source |
|-------------|--------------|------|------------|-----|-----|---------|--------|
| `json_import_source` | — | select | — | — | — | `file` | user-input |

**Outputs (read-only):**
- `json_imported` — array of imported records
- `json_errors` — array of validation errors

### 2.4 Game Loader

| Variable ID | Backend Path | Type | Validation | Min | Max | Default | Source |
|-------------|--------------|------|------------|-----|-----|---------|--------|
| `game_loader_game_id` | — | select | — | — | — | `wuthering-waves` | user-input |

**Outputs (read-only):**
- `game_loader_game` — loaded game definition JSON

### 2.5 Update Checker

No user-configurable fields. Action-only module.

---

## 3. Shared State Paths

These paths are global and can be read by any module via `shared.get(path)`.

| Path | Type | Description | Owner |
|------|------|-------------|-------|
| `currentGame.id` | string | Active game id (`wuthering-waves`, `genshin-impact`) | game-loader |
| `currentGame.displayName` | string | User-facing game name | game-loader |
| `currentGame.version` | string | Game definition version | game-loader |
| `currentGame.loaded` | boolean | Whether a game is active | game-loader |
| `characters.{charId}.name` | string | Character display name | game DB |
| `characters.{charId}.baseStats.atk` | number | Base ATK (zero buffs) | game DB |
| `characters.{charId}.baseStats.hp` | number | Base HP | game DB |
| `characters.{charId}.baseStats.def` | number | Base DEF | game DB |
| `characters.{charId}.baseStats.critRate` | number | Base CRIT Rate % | game DB |
| `characters.{charId}.baseStats.critDmg` | number | Base CRIT DMG % | game DB |
| `characters.{charId}.baseStats.energyRegen` | number | Base Energy Regen % | game DB |
| `characters.{charId}.stats.atk` | number | Current ATliegt ATK (buffed) | state |
| `characters.{charId}.stats.hp` | number | Current HP | state |
| `characters.{charId}.stats.def` | number | Current DEF | state |
| `characters.{charId}.stats.critRate` | number | Current CRIT Rate % | state |
| `characters.{charId}.stats.critDmg` | number | Current CRIT DMG % | state |
| `characters.{charId}.stats.energyRegen` | number | Current Energy Regen % | state |
| `echoes.{echoId}.name` | string | Echo set name | ocr-scanner / json-importer |
| `echoes.{echoId}.cost` | number | Echo cost (1-4) | ocr-scanner / json-importer |
| `echoes.{echoId}.level` | number | Echo level | ocr-scanner / json-importer |
| `echoes.{echoId}.mainStat` | string | Main stat type (e.g. `ATK%`) | ocr-scanner / json-importer |
| `echoes.{echoId}.mainStatValue` | number | Main stat value | ocr-scanner / json-importer |
| `echoes.{echoId}.subStats` | array | Sub-stat rolls | ocr-scanner / json-importer |
| `calculations.{calcId}.totalDps` | number | Total DPS result | damage-calculator |
| `calculations.{calcId}.totalDamage` | number | Total damage (rotation-based) | damage-calculator |
| `calculations.latest` | object | Alias to the most recent calculation | damage-calculator |

---

## 4. Module Actions

Each action is called from the frontend via:
```js
window.frequencyManager.executeModuleAction(moduleId, actionId, values)
```

### 4.1 damage-calculator

| Action ID | Params (var IDs) | Returns | Description |
|-----------|----------------------|---------|-------------|
| `calculate` | `{ characterId, rotationLength, includeResonance, includeConcerto, rotation }` | `{ summary, breakdown, rotation, stats }` | Run DPS calculation |
| `optimize-echoes` | `{ characterId }` | `{ summary }` | Suggest best 5 echoes |

### 4.2 ocr-scanner

| Action ID | Params (var IDs) | Returns | Description |
|-----------|----------------------|---------|-------------|
| `scan` | `{ imagePath }` | `{ echoes, raw }` | Scan screenshot |

### 4.3 json-importer

| Action ID | Params (var IDs) | Returns | Description |
|-----------|----------------------|---------|-------------|
| `import` | `{ source }` | `{ imported, errors }` | Import from file/clipboard |
| `export` | — | `{ imported }` | Export current data |

### 4.4 update-checker

| Action ID | Params | Returns | Description |
|-----------|--------|---------|-------------|
| `check-now` | — | `{ app, games }` | Force check for updates |

### 4.5 game-loader

| Action ID | Params | Returns | Description |
|-----------|--------|---------|-------------|
| `load` | `{ gameId }` | `{ game }` | Load a game definition |

---

## 5. Validation Ranges (gameRule Reference)

These are the ranges the kernel/renderer clamps to. The frontend should mirror these for instant feedback.

| gameRule | Min | Max | Notes |
|----------|-----|-----|-------|
| `character-stats.atk` | 0 | 9999 | Absolute character ATK |
| `character-stats.hp` | 0 | 99999 | Absolute character HP |
| `character-stats.def` | 0 | 9999 | Absolute character DEF |
| `character-stats.critRate` | 0 | 100 | Percentage |
| `character-stats.critDmg` | 0 | 800 | Percentage |
| `character-stats.energyRegen` | 0 | 500 | Percentage |
| `character-stats.elementalMastery` | 0 | 2000 | Flat |
| `character-stats.healingBonus` | 0 | 200 | Percentage |
| `character-stats.effectHitRate` | 0 | 200 | Percentage |
| `character-stats.effectRes` | 0 | 200 | Percentage |
| `echo.mainStat.{statType}` | 0 | varies by cost | See `mainStatCaps`exus wutheringWavesStatRules |
| `echo.subStat.{statType}` | 0 | varies | See `subStatCaps` in wutheringWavesStatRules |

---

## 6. Frontend Quick-Start

1. **Read variables on mount** — Load initial values from shared state:
   ```js
   const val = await window.frequencyManager.getSharedState(path);
   store.setVar(varName, val);
   ```

2. **Write on user change** — On any user input change:
   ```js
   await window.frequencyManager.setSharedState(path, newValue, gameRule);
   ```

3. **Call actions** — On button click:
   ```js
   const values = { characterId: store.getVar('damage_calc_character_id'), ... };
   const result = await window.frequencyManager.executeModuleAction('damage-calculator', 'calculate', values);
   ```

4. **Subscribe for live updates**:
   ```js
   const unsub = window.frequencyManager.onSharedStateChanged('characters.{charId}.stats.critRate', (val) => {
     store.setVar('damage_calc_crit_rate', val);
   });
   ```

---

## 7. Full Variables JSON

See the companion file [`variables.json`](variables.json) for a machine-readable version.
