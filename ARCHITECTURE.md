# FrequencyManager — Architecture

This document describes the high-level system design of FrequencyManager. For
contributor guidance see [CONTRIBUTING.md](./CONTRIBUTING.md); for changelog
history see [CHANGELOG.md](./CHANGELOG.md); for the project overview see
[README.md](./README.md).

---

## 1. Design Goals

1. **Modularity** — Every feature must be an independent, hot-swappable module.
2. **Stability** — A buggy or malicious module must never crash the host application.
3. **Observability** — Every important action must be loggable, traceable, and health-checkable.
4. **Game-agnosticism** — Game-specific knowledge (vocabulary, OCR regexes,
   combat formulas, set bonuses) is encapsulated in a single typed
   `GameDefinition` object that ships per-game. Switching games is a config
   change, not a code change.
5. **Plugin-ready** — New games and new feature modules can be added without
   touching the kernel, the renderer, or other modules.
6. **Developer experience** — Heavily commented, strict TypeScript, fast test feedback loop.

---

## 2. Layered Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  Renderer  (browser context)                                     │
│  ─ HTML/CSS/TS UI                                                │
│  ─ Has NO Node access                                            │
│  ─ Talks to main via window.frequencyManager (preload bridge)    │
└──────────────────────────────────────────────────────────────────┘
                              ▲
                              │  contextBridge (sandboxed)
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  Preload  (sandboxed)                                            │
│  ─ Exposes a strictly-typed API                                  │
│  ─ Wraps ipcRenderer.invoke + ipcRenderer.on                     │
└──────────────────────────────────────────────────────────────────┘
                              ▲
                              │  IPC (ipcMain.handle)
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  Main Process  (Electron)                                        │
│  ─ Owns BrowserWindow lifecycle                                  │
│  ─ Boots the Kernel                                              │
│  ─ Wires IPC handlers to Kernel methods                          │
└──────────────────────────────────────────────────────────────────┘
                              ▲
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  Kernel  (core/)                                                 │
│  ─ Lifecycle:  boot → running → shutting-down → stopped          │
│  ─ Subsystems: EventBus, ModuleRegistry, ModuleSandbox,          │
│                ConfigSystem, FeatureFlags, HealthMonitor         │
└──────────────────────────────────────────────────────────────────┘
                              ▲
                              │  typed events  (EventBus)
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  Modules  (modules/<name>/)                                      │
│  ─ Each module declares itself in module.manifest.json           │
│  ─ Each module owns a ModuleSandbox (permissions + isolation)    │
│  ─ Modules communicate ONLY through EventBus                     │
│                                                                     │
│  Examples:                                                          │
│   - game-loader     resolves activeGame, injects GameDefinition    │
│   - json-importer   generic JSON export/import                      │
│   - ocr-scanner     reads game.definition.ocr                       │
│   - damage-calculator reads game.definition.combat + .sets         │
└──────────────────────────────────────────────────────────────────┘
                              ▲
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  Game-Definition Adapters  (adapters/game-definitions/)         │
│  ─ Each game ships ONE GameDefinition object                     │
│  ─ Modules depend on the GameDefinition INTERFACE, not concrete  │
│  ─ Adding a new game = adding one file to this directory         │
│                                                                     │
│  Currently bundled:                                                │
│   - wuthering-waves.ts   echoes + WU combat + WU sets              │
│   - genshin-impact.ts    artifacts + GI combat + GI sets           │
└──────────────────────────────────────────────────────────────────┘
```

---

## 3. Modular Plugin Architecture

### 3.1 Kernel Responsibilities

The kernel (`core/kernel.ts`) is the single source of truth for application
state. It does **not** contain business logic. Its responsibilities are:

- Boot, run, shut down.
- Load and unload modules based on disk discovery + manifest.
- Maintain the EventBus, ModuleRegistry, ConfigSystem, FeatureFlags, and HealthMonitor.
- Provide a typed `KernelInterface` for modules to consume.

### 3.2 Module Lifecycle

```
discover (filesystem scan) ─▶ validate manifest ─▶ load (dynamic import)
                                                          │
                                                          ▼
                                                 createModuleSandbox
                                                          │
                                                          ▼
                                                  init() → start()
                                                          │
                                                          ▼
                                                subscribe + publish events
                                                          │
                                                          ▼
                                                stop() → destroy() sandbox
```

### 3.3 Module Manifest

Every module declares itself in `module.manifest.json`:

```json
{
    "id": "ocr-scanner",
    "name": "OCR Scanner",
    "version": "1.2.0",
    "entry": "./src/index.ts",
    "permissions": ["ocr:scan", "fs:read"],
    "dependencies": ["core@^1.0.0", "game-loader@^1.0.0"],
    "featureFlags": ["ocr-enabled"]
}
```

- `id` — unique, kebab-case.
- `version` — must follow [SemVer](https://semver.org/).
- `entry` — relative path to the module's main file (compiled JS in production).
- `permissions` — minimum set the module needs.
- `dependencies` — `name@semver-range`. The kernel rejects modules whose declared deps are not satisfied.
- `featureFlags` — gates the module behind a runtime flag.

### 3.4 Module Sandbox

`ModuleSandbox` (`core/module-sandbox.ts`) isolates each module:

- Wraps all module execution in `execute(fn)` which catches errors and enforces an `executionTimeoutMs`.
- Tracks timers / intervals registered by the module so they can be cleared on destroy.
- Enforces a permission set. Any attempt to use a kernel API for which the module has no permission throws `ModuleError('PERMISSION_DENIED', ...)`.
- A crashing module throws but the sandbox destroys itself cleanly; the kernel keeps running.

---

## 4. The Game-Definition Layer (NEW)

This is the most important architectural addition. FrequencyManager originally
targeted Wuthering Waves only — every game-specific constant (set names, OCR
regexes, combat formulas, element vocabulary) was hardcoded into the OCR and
damage-calculator modules. To support multiple games without forking the
kernel, we extracted every game-specific constant into a typed contract.

### 4.1 The `GameDefinition` Contract

`shared/types/game-definition.ts` defines:

- **Canonical vocabularies** — `ElementType`, `WeaponType`, `StatType` are
  shared across all games. Each game picks a *subset* of each via its
  `GameDefinition.character.elements` etc.
- **Equipment shape** — `slotLabel`, `maxSubStats`, `maxLevel`,
  `allowedMainStatTypes`, `allowedCosts`.
- **Character shape** — `elements`, `weapons`, `maxLevel`, `maxAscension`,
  `ascensionBonus[]`.
- **Combat actions** — `id`, `label`, `multiplier`, `energy`, `duration`.
- **OCR rules** — `namePattern`, `costPattern`, `mainStatPattern`,
  `subStatPattern`, `setNames[]`.
- **Set bonuses** — `SetBonusDefinition[]` mapping name to stat bonuses.

```ts
interface GameDefinition {
    id: string;                                    // e.g. "wuthering-waves"
    displayName: string;                           // e.g. "Wuthering Waves"
    description: string;
    version: string;
    equipment: EquipmentDefinition;
    character: CharacterDefinition;
    combat: { actions: CombatActionDefinition[]; defaultRotationLength: number };
    ocr: OcrRules;
    sets: SetBonusDefinition[];
    statAliases?: Record<string, string>;
}
```

### 4.2 How a game loads

**The app ships with ZERO games compiled in.** Every game — including the
official Wuthering Waves and Genshin Impact packages — is plain data that
loads at runtime from `<userData>/game-modules/` (see Section 16). There is
no compiled-in fallback; a fresh install shows a "No game installed yet"
screen until at least one package is dropped in.

```
<userData>/game-modules/**/*.json  (loose file OR packaged folder)
        │
        ▼
shared/game-data/external-loader.ts
    loadExternalGameBundles(dir)  — parse, validate, buildGameBundle()
        │
        ▼
adapters/game-definitions/index.ts
    initExternalGameModules(dir)  — registers into GAME_DEFINITIONS/GAME_BUNDLES
        │
        ▼
config/default.json
    game.activeGame: "wuthering-waves"   (a PREFERENCE, tried first if installed)
        │
        ▼
modules/game-loader/src/index.ts
    resolveAndInject()  — falls back to listInstalledGames()[0] if unresolved
        │
        ▼
kernel.config.set("game", { activeGame, version, definition })
        │
        ▼
other modules read via kernel.config.get("game.definition")
```

### 4.3 Adding a game

Games are added entirely as data — no kernel, IPC, renderer, or other module
code needs to change. See Section 16 for the full mechanism and
[`docs/GAME_MODULES.md`](docs/GAME_MODULES.md) for the end-user/author guide.
In short: author a `GameDefinition` + `charDB`/`weaponDB`/`supplements` (the
exact `ExternalGameModuleFile` shape), drop it into
`<userData>/game-modules/` (loose JSON or a packaged folder with icons), and
restart. `scripts/build-game-package.js` builds the two OFFICIAL packages
(Wuthering Waves, Genshin Impact) the same way any third party would build
their own — see `adapters/game-definitions/<game>/bundle.ts`'s exported
`*ModuleInput` for the source each package is built from.

---

## 5. Inter-Module Communication

### 5.1 The EventBus

`core/event-bus.ts` is the only sanctioned way for modules to communicate.
It supports:

- **Pub/Sub** — `bus.publish(type, payload)` and `bus.subscribe(type, handler)`.
- **RPC** — `bus.request(target, type, payload)` plus `bus.onRequest(type, handler)`.
- **Correlation IDs** — every event carries a `correlationId` for tracing.
- **Wildcard subscriptions** — `bus.subscribe('*', handler)` receives every event.
- **Priority + filter + once** — subscription options for fine-grained control.

### 5.2 Why not direct imports?

Direct imports between modules would couple their lifecycles and break
hot-swapping. The event bus is a single, serializable, observable surface
that:

- Lets us swap a module at runtime without re-wiring consumers.
- Lets us record every event for diagnostics.
- Lets us evolve the message format under semver without recompiling consumers.

### 5.3 Event Naming Convention

`<domain>:<entity>:<action>` — e.g. `ocr:scan-request`, `damage:calculated`,
`module:ocr-scanner:loaded`, `game:loaded`. Use past tense for completed
actions, request/response suffixes for RPC.

---

## 6. IPC and the Renderer

### 6.1 Security posture

The renderer runs with **no Node access**:

```ts
new BrowserWindow({
    webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        preload: path.join(__dirname, 'preload.js'),
    },
});
```

All privileged calls go through the preload bridge exposed as
`window.frequencyManager`.

### 6.2 The preload surface

`src/preload/preload.ts` exposes a typed object:

```ts
window.frequencyManager.health()                // kernel health
window.frequencyManager.listModules()           // all loaded modules
window.frequencyManager.scanImage(path)         // OCR scan request
window.frequencyManager.calculateDamage(req)    // DPS calculation
window.frequencyManager.openImageDialog()       // native file picker
window.frequencyManager.saveJsonFile(name, ...) // native save dialog
window.frequencyManager.on(event, handler)      // event subscription

// Update notifications
window.frequencyManager.onAppUpdateAvailable(info => ...);
window.frequencyManager.onAppUpdateProgress(progress => ...);
window.frequencyManager.onAppUpdateDownloaded(info => ...);
window.frequencyManager.installAppUpdate();
window.frequencyManager.onGameUpdateAvailable(info => ...);
window.frequencyManager.onGameUpdateIncompatible(info => ...);
window.frequencyManager.checkGameUpdatesNow();

// Shared state & module actions (see Section 15)
window.frequencyManager.getSharedState(path)
window.frequencyManager.setSharedState(path, newValue, gameRule)
window.frequencyManager.executeModuleAction(moduleId, actionId, values)
```

### 6.3 Kernel-level RPCs

Modules register these via `kernel.eventBus.onRequest(...)`; the preload
bridge exposes whichever ones the renderer needs.

| RPC | Module | Purpose |
| --- | --- | --- |
| `game:list-installed` | `game-loader` | list all registered games |
| `game:get-active` | `game-loader` | get currently active game + definition |
| `game:get-bundle` | `game-loader` | get the full renderer-ready `GameBundle` |
| `game:get-options` | `game-loader` | get dropdown option lists derived from `GameDefinition.uiOptions` |
| `game:set-active` | `game-loader` | switch the active game |
| `json:export` | `json-importer` | wrap payload in envelope, return JSON |
| `json:import-string` | `json-importer` | parse + validate envelope |
| `json:export-to-file` | `json-importer` | write to disk |
| `json:import-from-file` | `json-importer` | read from disk |
| `update-checker:check-now` | `update-checker` | manual game-def check |
| `update-checker:get-cache` | `update-checker` | read last check results |

---

## 7. Configuration

`core/config.ts` provides a typed configuration system:

- `default.json` in `config/` provides baseline values.
- Environment variables (`FREQUENCY_MANAGER_*`) override at boot.
- Validation runs on boot — invalid config aborts startup with a clear error.
- Modules inject runtime values (e.g. the `GameDefinition`) via
  `kernel.config.set('game', { ... })`.

`process.env.NODE_ENV` selects between `default.json`, `development.json`, and
`production.json` if present.

---

## 8. Feature Flags

`core/feature-flags.ts` exposes a typed flag store. Flags default to off in
production and on in development. Modules declare their required flags in
`module.manifest.json` under `featureFlags`. A module whose flag is disabled
is not loaded.

Per-game feature flags let us ship beta support for a new game without
disabling the existing one:

```json
"featureFlags": {
  "ocr-enabled": true,
  "game-wuthering-waves-installed": true,
  "game-genshin-impact-installed": true
}
```

---

## 9. Observability

### 9.1 Structured Logging

`StructuredLogger` (`core/kernel.ts`) emits one JSON line per event:

```json
{
  "timestamp": "2026-06-29T10:00:00Z",
  "level": "info",
  "module": "ocr-scanner",
  "message": "Scan complete",
  "correlationId": "corr-1"
}
```

Always include the `correlationId` when forwarding a request. Logs can be
grepped by correlation ID to reconstruct a full request flow across modules.

### 9.2 Health Checks

`kernel.healthCheck()` returns:

```ts
{
    status: 'healthy' | 'degraded' | 'unhealthy',
    checks: { kernel: HealthCheckEntry, modules: HealthCheckEntry, ... },
    metadata: { version, modulesLoaded, modulesFailed },
    uptime: number,
    timestamp: number,
}
```

The `game-loader` module adds its own check (whether an active game is loaded).

---

## 10. Error Handling

- Every error is a `ModuleError` (extends `Error`) carrying a string `code` for programmatic handling.
- Synchronous and asynchronous errors thrown inside a module's `execute()` are caught by the sandbox and re-thrown as `ModuleError('MODULE_EXECUTION_FAILED', ...)`.
- The renderer-facing IPC handlers wrap user errors in a JSON shape: `{ ok: false, code, message }`.
- The `json-importer` module returns its own `ImportResult` shape with `error: { code, message }`.

---

## 11. Security

- **Least privilege** — each module declares exactly the permissions it needs.
- **Input validation** — `zod` schemas validate every payload at module boundaries.
- **Secrets in env vars** — never committed; `.env.example` documents required keys.
- **Strict CSP** — the renderer allows only same-origin scripts and inline styles.
- **Sandboxed renderer** — `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- **External link policy** — `setWindowOpenHandler` routes all external URLs to the system browser.

---

## 12. Testing Strategy

| Layer            | What it covers                          | Where it lives                |
| ---------------- | --------------------------------------- | ----------------------------- |
| Unit             | Public functions, pure logic            | `tests/**/*.test.ts`          |
| Integration      | Module-to-module event flow             | each module's `tests/`        |
| Contract         | Public API surface of a module          | each module's `tests/`        |
| End-to-end       | Critical user journeys                  | `tests/e2e/`                  |

Run with `npm test`. Coverage with `npm run test:coverage`.

Per-module tests live under `modules/<name>/tests/` (where applicable). Core
kernel tests live in `tests/core/`.

---

## 13. Folder Layout

See [CONTRIBUTING.md](./CONTRIBUTING.md#-project-structure) for the canonical
layout. The most important invariants:

> **`core/` only contains code that ships with the kernel. Anything
> feature-specific lives under `modules/<feature>/` or `adapters/<integration>/`.**

> **`adapters/game-definitions/` is the only place where game-specific data
> (vocabulary, OCR regexes, set bonuses, combat formulas) is allowed to live.**

---

## 14. Future Work

- **Marketplace installer** — download additional game-module packages from
  a GitHub repo directly into the app, instead of the user placing the JSON
  file manually (see Section 16).
- **Microservice split** — every module is already message-driven, so
  splitting the kernel into separate processes is mostly a packaging change.
- **Persistent state** via a typed `StorageAdapter`.
- **Telemetry** behind a feature flag, off by default.
- Migrate from Electron-builder to **electron-forge** for better plugin support.

---

## 15. Shared State & Stat Validation (NEW)

FrequencyManager modules need to share data with each other and with the
user's input. A naive solution — every module reading from every other
module — would couple them tightly and prevent the kernel-side validation
that protects the user from invalid stats (e.g. 50 CRIT Rate from a 4-cost
main-stat echo, which is impossible in Wuthering Waves).

The architecture therefore introduces a **shared, reactive, validated
data store** in the renderer (`moduleStore.shared`).

### 15.1 What it provides

- **Path-based key-value access** — `get('characters.rover-spectro.baseStats.atk')`
- **Validated writes** — `set(path, value, 'character-stats.critRate')`
  auto-clamps numeric values to the legal range for that stat
- **Diff-based merge** — `merge(path, newData)` returns
  `{ added, removed, modified }` for conflict-resolution UIs
- **Reactive subscriptions** — `subscribe(path, handler)` fires on every
  change, letting the UI update without polling
- **Dirty/baseline/default tracking** — distinguish "what's on screen"
  from "what the user last confirmed" from "the game-accurate zero-buff value"

### 15.2 StatRules (per-game validation)

Each `GameDefinition` exports a `StatRules` object that the kernel and
renderer both consult. For Wuthering Waves, this lives in
`wutheringWavesStatRules` (`adapters/game-definitions/wuthering-waves/`):

```ts
{
  character: {
    baseStats: { 'rover-spectro': { atk: 800, ..., critRate: 5, ... }, ... },
    maxStats:  { atk: 9999, critRate: 100, critDmg: 800, ... }
  },
  echoes: {
    mainStatCaps: { 'CRIT Rate': { 1: 9, 3: 17, 4: 22 }, 'CRIT DMG': { 1: 18.4, 3: 33.6, 4: 43.2 }, ... },
    subStatCaps:  { 'CRIT Rate': { maxPerRoll: 3.9, maxTotal: 39 }, 'CRIT DMG': { maxPerRoll: 7.8, maxTotal: 78 }, ... }
  }
}
```

`baseStats` is the **game-accurate zero-buff value** used by the
"Reset to default" button. `maxStats` is the **absolute maximum**
any buffed character can reach. `mainStatCaps[statType][cost]` is the
max value the stat can take when it's the main stat of an echo at that
cost. `subStatCaps[statType]` is the per-roll and total caps for sub-stats.

### 15.3 Declarative binding via `FieldSpec`

The renderer-side `FieldSpec` was extended to support declarative data
binding. A field with:

```ts
{
  id: 'critRate',
  type: 'number',
  source: 'state',
  statePath: 'characters.rover-spectro.baseStats.critRate',
  gameRule: 'character-stats.critRate',
}
```

…will:
- Read its initial value from `shared.get('characters.rover-spectro.baseStats.critRate')`
- Write user edits back to that path, auto-clamped via `character-stats.critRate`
- Re-render when any other module writes to that path

This means the Damage Calculator's CRIT Rate field automatically reflects
the latest value from OCR, JSON import, or game DB — no manual data flow
code in the module itself.

### 15.4 Conflict resolution on import

When the JSON Importer reads a backup file, it calls
`shared.merge('echoes', importedData)`. The store returns a
`MergeDiff { added, removed, modified }` and the UI shows three buttons:

- **Keep current** — discard the import
- **Replace with new** — overwrite (sets baseline = newData)
- **Merge manually** — per-key choice (UI work in progress)

### 15.5 Files

- [`docs/SHARED_STATE.md`](docs/SHARED_STATE.md) — full API and migration guide
- `shared/types/game-definition.ts` — `StatRules` types
- `adapters/game-definitions/wuthering-waves/` — `wutheringWavesStatRules`
- `src/renderer/src/types/index.ts` — `GameRuleRef`, extended `FieldSpec`
- `src/renderer/src/stores/moduleStore.ts` — `SharedStateStore` impl
- `src/renderer/src/components/modules/FieldInput.tsx` — state binding
- `tests/renderer/shared-state.test.ts` — 15 unit tests

---

## 16. Game Modules (zero built-in games)

**The app ships with zero games compiled in.** Wuthering Waves and Genshin
Impact are not special-cased — they're the two "official" packages,
downloadable from the Releases page and installed exactly the same way a
community-authored game would be. This is possible because a `GameDefinition`
+ its character/weapon rosters are 100% plain data (no functions), making
"add a game" fundamentally a data-distribution problem, not a code-execution
one. `adapters/game-definitions/index.ts`'s registry (`GAME_DEFINITIONS`/
`GAME_BUNDLES`/`GAME_ICON_DIRS`) starts empty and is populated ENTIRELY by
`initExternalGameModules(dir)` — there is no separate built-in vs. external
code path anymore.

This was a deliberate cutover from an earlier design where Wuthering
Waves/Genshin Impact shipped compiled into the app and only THIRD-PARTY games
went through the external loader. `adapters/game-definitions/<game>/bundle.ts`
still exports the raw `buildGameBundle()` input (`wutheringWavesModuleInput`,
`genshinImpactModuleInput`) as the source of truth for each official game;
`scripts/build-game-package.js` (`npm run package:games`) requires the
COMPILED `dist/` version of that export, reshapes it into the
`ExternalGameModuleFile` format, bundles the game's `icons/` folder alongside
it, and zips the result into `dist/game-packages/<id>.zip` — the exact same
artifact a community author would hand-produce. The installer's
`build.files` config excludes `dist/adapters/game-definitions/{wuthering-waves,genshin-impact}/**`
and `dist/game-packages/**`, so none of this ships inside the app binary.

### 16.1 How it works

1. On boot, before `createKernel()` runs, `loadExternalGameModules()`
   (`src/main/electron-main.ts`) scans `<userData>/game-modules/` (creating
   the folder if it doesn't exist) and calls `initExternalGameModules(dir)`
   (`adapters/game-definitions/index.ts`).
2. Two on-disk shapes are scanned side by side (`shared/game-data/external-loader.ts`):
   loose `game-modules/*.json` files (self-contained, no icons — nowhere for
   a lone JSON file to put art), and packaged `game-modules/<name>/*.json`
   subdirectories (exactly one JSON file; an ambiguous 2+ or a folder with
   none logs an error rather than guessing) with an optional sibling
   `icons/` folder — the shape you get from extracting a distributed `.zip`.
3. Each module is parsed, schema-validated (pragmatic zod validation — not
   exhaustive, catches "wrong shape" not every possible nested-field
   mistake), and its OCR regex patterns are checked for basic safety (length
   cap + a static catastrophic-backtracking-shape guard) before being
   derived into a full `GameBundle` via `buildGameBundle()` — the SAME
   function every game, official or community, is built with.
4. Valid modules are registered into `adapters/game-definitions/index.ts`'s
   `GAME_DEFINITIONS`/`GAME_BUNDLES` maps (plus `GAME_ICON_DIRS` for a
   packaged module that shipped icons) via `initExternalGameModules()`. A
   file whose `definition.id` collides with an ALREADY-REGISTERED id (first
   loaded wins — no "which one is official" special case) is skipped with a
   logged error, never silently overridden. `getGameDefinition`/
   `getGameBundle`/`hasGameDefinition`/`listInstalledGames` are the only way
   any other module (`game-loader`, `damage-calculator`, `ocr-scanner`)
   reads game data — none of them can tell an official package from a
   community one.
5. This MUST happen before kernel boot: `game-loader`'s first
   `resolveAndInject()` call (during module initialization) needs every
   installed game already registered to resolve a persisted
   `game.activeGame` pointing at one.

### 16.1.1 Icon resolution

`fm-icon://<gameId>/<relPath>` (`setupIconProtocol()`,
`src/main/electron-main.ts`) resolves via `getExternalIconsDir(gameId)` — the
packaged module's own `icons/` folder, if it registered one when scanned. A
loose top-level JSON module has no entry in `GAME_ICON_DIRS` at all, so it
always falls through to the renderer's placeholder art. The lookup keeps the
existing path-traversal guard (`resolvedPath.startsWith(baseDir)`).

### 16.1.2 Zero/partial installs are a normal state, not a fault

Before this was hardened, a fresh install with no game modules yet (or only
some of them) would throw `ModuleError('NO_GAME_AVAILABLE')` out of
`game-loader`'s `initialize()` — which, because that call happened BEFORE
any of its `onRequest` RPC registrations, meant the whole RPC surface
(`game:list-installed`, `game:get-active`, `game:get-bundle`, etc.) never
registered at all, and the hardcoded `'wuthering-waves'` fallback literal
meant even having ONLY Genshin Impact installed hit this same failure. Fixed
by:
- Registering every RPC FIRST, resolving the active game LAST, so the
  surface is always callable regardless of what's installed.
- `resolveAndInject()` no longer throws for "nothing resolves" — it logs,
  leaves `activeGameId` at `null`, and returns `undefined`. `initialize()`
  sets health to `'degraded'` (not `'unhealthy'`/errored) in that case,
  matching `healthCheck()`'s pre-existing convention that "no game yet" is
  expected and recoverable.
- The fallback-of-last-resort is `listInstalledGames()[0]?.id`, not a
  literal — `'wuthering-waves'` is still tried FIRST as a preference (via
  `config/default.json`'s `activeGame`), just never assumed to exist.
  `config/default.json`'s `fallbackGame` was also removed (was hardcoded to
  `'wuthering-waves'`) so this dynamic fallback actually gets a chance to run.
- The renderer's `gameStore.syncFromBackend()` trusts a genuinely empty
  `getGames()` response instead of silently keeping its 2-entry offline
  fallback (which would misrepresent "zero games" as "both built-ins are
  installed"). `Workspace.tsx` shows a "No game installed yet" `EmptyState`
  (pointing at `docs/GAME_MODULES.md`) in place of any game-scoped screen
  when `games.length === 0`; Dashboard and Settings stay reachable either way.

### 16.2 Renderer wiring

`useGameStore`'s `games` list starts as a 2-entry offline fallback, then gets
replaced by the REAL backend list (`window.frequencyManager.getGames()` →
`game:list-installed` RPC) via `syncFromBackend()` — called once on boot
(`AppShell.tsx`) and awaited before the bundle-prefetch loop and the
inventory-seed step run, so an external game's data/starter-character aren't
silently skipped by reading the games list before the sync lands.
`setActiveGame()` also (re-)fetches the target game's bundle and seeds its
inventory reactively, covering a mid-session switch to a game that wasn't
prefetched at boot.

### 16.3 Security posture

Since the format has no executable code, the attack surface is narrow:
malformed/incompatible data (handled by schema validation, always
fails safely per-file) and adversarial OCR regex patterns (handled by
`isRegexSafe`'s static guard). No `eval`, no dynamic `require`, no IPC
permission changes — an external game module is exactly as privileged as
picking a different value in a dropdown.

### 16.4 Files

- [`docs/GAME_MODULES.md`](docs/GAME_MODULES.md) — end-user/community guide:
  file format, directory location, validation rules, icon packaging
- `shared/game-data/external-loader.ts` — parsing, validation, regex safety,
  loose-file + packaged-subdirectory scanning, `buildGameBundle` invocation
- `adapters/game-definitions/index.ts` — `initExternalGameModules`,
  `getExternalIconsDir`, the merged built-in + external registry
- `src/main/electron-main.ts` — `loadExternalGameModules()` (called before
  `initializeKernel()`), `setupIconProtocol()`'s two-path lookup
- `modules/game-loader/src/index.ts` — RPC-registration-before-resolution
  ordering, non-throwing `resolveAndInject()`, dynamic fallback
- `config/default.json` — no more hardcoded `fallbackGame`
- `src/renderer/src/stores/gameStore.ts` — real backend-synced `games` list,
  trusts a genuinely empty response
- `src/renderer/src/components/shell/Workspace.tsx` — "No game installed
  yet" gate for game-scoped screens
- `tests/shared/external-loader.test.ts`,
  `tests/shared/game-definitions-registry.test.ts`,
  `modules/game-loader/tests/game-loader.test.ts` — coverage
