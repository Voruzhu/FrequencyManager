# End-Game Mode Comparison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a Rotation Builder rotation be compared against a real time
budget (manually set, or filled in by a curated end-game-mode preset), with
the preset library auto-delivered so updating it never requires a new app
release.

**Architecture:** Three independent, sequentially-buildable pieces: (1) a
pure `timeLimitSeconds`-vs-`totalDuration` comparison added to the existing
rotation engine + wired into `RotationScreen.tsx`'s existing state/save/load
flow; (2) a new, standalone `endgamePresets.ts` fetch/cache/fallback module,
fully testable with a mocked `fetch`, no UI dependency; (3) a "Load end-game
preset" picker in `RotationScreen.tsx` that wires (1) and (2) together.

**Tech Stack:** React/TypeScript (renderer), Zustand (persisted stores via
the existing `userStorage` adapter), Jest (`testEnvironment: 'node'`, no
DOM/RTL rendering anywhere in this codebase — UI-only changes are verified
manually against the running app, not via component tests; that convention
continues here).

## Global Constraints

- Reuse the EXACT existing `WaveConfig` shape (`lib/rotationEngine.ts`) for
  a preset's `waves` field — no new/parallel enemy-config type.
- `timeLimitSeconds` is optional everywhere it appears — undefined means
  "no comparison," never a required field (Trounce Domain content has no
  real in-combat clock; ToA/Abyss/Theater do).
- Fetch `https://raw.githubusercontent.com/Voruzhu/FrequencyManager/main/shared/game-data/endgame-presets/<gameId>.json`
  directly (not jsDelivr) — always-fresh matters more than CDN caching for
  a single small JSON file that exists specifically to avoid staleness.
- No ley-line-disorder/special-rule auto-simulation — `specialRuleNote` is
  plain display text only, never parsed into a buff.
- **This plan does NOT populate real preset content** (real Trounce Domain
  HP, real ToA floor time limits, real current Abyss/Theater cycle config).
  Two web searches during design turned up no clean, confidently-sourceable
  numbers for any of these on the first pass — fabricating placeholder
  numbers into shipped data would be worse than shipping an empty preset
  list. Task 2 seeds both preset files with a valid, schema-correct, EMPTY
  `presets: []` array — proving the pipeline end-to-end with zero fabricated
  data. Populating real presets is an explicit, separate follow-up (a
  content-sourcing task, not a code task) — see the design doc's Section 3.

---

### Task 1: Time budget comparison

**Files:**
- Modify: `src/renderer/src/lib/rotationEngine.ts` (add a new exported function)
- Modify: `src/renderer/src/stores/rotationStore.ts:8-28` (`SavedRotation` interface)
- Modify: `src/renderer/src/screens/RotationScreen.tsx` (state, save/load/reset, UI)
- Test: `tests/renderer/rotationEngine.test.ts`

**Interfaces:**
- Produces: `compareToTimeBudget(totalDuration: number, timeLimitSeconds: number): { withinBudget: boolean; secondsRemaining: number }` — exported from `lib/rotationEngine.ts`, consumed directly by `RotationScreen.tsx` and (later, read-only) by Task 3.
- Produces: `SavedRotation.timeLimitSeconds?: number`.

- [ ] **Step 1: Write the failing test**

Add to `tests/renderer/rotationEngine.test.ts` (new `describe` block, anywhere after the existing imports — add `compareToTimeBudget` to the existing import line at the top of the file):

```ts
import { elapsedTimes, cooldownWarningFor, simulateWaves, applyWaveTransition, resolveWaveEnemy, compareToTimeBudget, type WaveConfig } from '../../src/renderer/src/lib/rotationEngine';
```

```ts
describe('compareToTimeBudget', () => {
    it('reports withinBudget=true and positive secondsRemaining when under the limit', () => {
        const result = compareToTimeBudget(42.3, 90);
        expect(result.withinBudget).toBe(true);
        expect(result.secondsRemaining).toBeCloseTo(47.7, 5);
    });

    it('reports withinBudget=false and negative secondsRemaining when over the limit', () => {
        const result = compareToTimeBudget(96.1, 90);
        expect(result.withinBudget).toBe(false);
        expect(result.secondsRemaining).toBeCloseTo(-6.1, 5);
    });

    it('exactly at the limit counts as within budget (secondsRemaining === 0)', () => {
        const result = compareToTimeBudget(90, 90);
        expect(result.withinBudget).toBe(true);
        expect(result.secondsRemaining).toBe(0);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/renderer/rotationEngine.test.ts -t "compareToTimeBudget"`
Expected: FAIL — `compareToTimeBudget is not a function` (not exported yet).

- [ ] **Step 3: Write minimal implementation**

Add to `src/renderer/src/lib/rotationEngine.ts` (end of file, after `simulateWaves`):

```ts
/** Compares a rotation's actual total duration against a real time budget
 * (e.g. a floor's clear-time limit) — pure display math; `totalDuration` is
 * already computed by the caller (`RotationScreen.tsx`), so no engine
 * change is needed beyond this comparison itself. `secondsRemaining` is
 * negative when over budget. */
export interface TimeBudgetComparison {
    withinBudget: boolean;
    secondsRemaining: number;
}
export function compareToTimeBudget(totalDuration: number, timeLimitSeconds: number): TimeBudgetComparison {
    const secondsRemaining = timeLimitSeconds - totalDuration;
    return { withinBudget: secondsRemaining >= 0, secondsRemaining };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/renderer/rotationEngine.test.ts -t "compareToTimeBudget"`
Expected: PASS (3 tests)

- [ ] **Step 5: Add `timeLimitSeconds` to `SavedRotation`**

In `src/renderer/src/stores/rotationStore.ts`, modify the interface (exact current text, lines 8-28):

```ts
export interface SavedRotation {
    id: string;
    name: string;
    /** Which named party (`namedPartyStore.ts`) this rotation's turn-picker is
     * restricted to. Undefined for a rotation saved before this field existed,
     * or one never assigned a party — it still loads fine, just without a
     * turn-picker restriction until a party is explicitly selected. */
    partyId?: string;
    steps: RotationStepSpec[];
    /** characterId -> enabled conditional self-buff ids for that member.
     * Legacy field — conditional buffs are now placed as 'buff' timeline
     * steps instead (see `RotationStepSpec.buffRefId`); kept optional purely
     * so a rotation saved before this change still loads without error. */
    enabledSelfBuffIds?: Record<string, string[]>;
    /** 'boss' = single WaveConfig entry (HP optional). 'waves' = 2+ entries.
     * Undefined for a rotation saved before this field existed — treated as
     * 'boss' mode with no enemy config (falls back to the plain single-target
     * behavior every rotation had before this feature). */
    mode?: 'boss' | 'waves';
    waves?: WaveConfig[];
    /** Real time budget to compare this rotation's actual duration against
     * (e.g. a floor's clear-time limit, manually typed or filled in by an
     * end-game-mode preset — see `lib/endgamePresets.ts`). Undefined = no
     * comparison shown; every rotation saved before this field existed keeps
     * working exactly as before. Independent of `mode`/`waves` — settable on
     * a plain Boss-mode rotation too. */
    timeLimitSeconds?: number;
}
```

- [ ] **Step 6: Wire state + save/load/reset in `RotationScreen.tsx`**

Add new state right after the existing `waves` state (exact current text at line 157):

```ts
    const [waves, setWaves] = useState<WaveConfig[]>([{ enemyId: 'dummy' }]);
    const [timeLimitSeconds, setTimeLimitSeconds] = useState<number | undefined>(undefined);
```

Modify `handleSave` (exact current text at lines 196-205) to include the new field:

```ts
    const handleSave = () => {
        if (steps.length === 0) return;
        const name = rotationName.trim();
        if (!name) return;
        const id = loadedRotationId ?? nextRotationId();
        const rotation: SavedRotation = { id, name, partyId: activePartyId, steps, mode, waves, timeLimitSeconds };
        useRotationStore.getState().save(activeGameId, rotation);
        setLoadedRotationId(id);
        toast.success(`Saved "${name}"`);
    };
```

Modify `handleLoad` (exact current text at lines 206-213) to restore it:

```ts
    const handleLoad = (r: SavedRotation) => {
        setSteps(r.steps);
        setRotationName(r.name);
        setLoadedRotationId(r.id);
        setActivePartyId(r.partyId);
        setMode(r.mode ?? 'boss');
        setWaves(r.waves ?? [{ enemyId: 'dummy' }]);
        setTimeLimitSeconds(r.timeLimitSeconds);
    };
```

Modify `handleNewRotation` (exact current text at lines 221-227) to reset it:

```ts
    const handleNewRotation = () => {
        setSteps([]);
        setRotationName('');
        setLoadedRotationId(null);
        setMode('boss');
        setWaves([{ enemyId: 'dummy' }]);
        setTimeLimitSeconds(undefined);
    };
```

- [ ] **Step 7: Add the UI input + comparison line**

In the "Enemy" card (exact current text at lines 365-413), add a time-limit
input right after the Boss/Waves toggle buttons (after line 371's closing
`</div>`, before the `{waves.map(...)}` block):

```tsx
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">Time limit (s):</span>
                                <Input
                                    type="number"
                                    placeholder="optional"
                                    className="w-28"
                                    value={timeLimitSeconds ?? ''}
                                    onChange={(e) => setTimeLimitSeconds(e.target.value === '' ? undefined : Number(e.target.value))}
                                />
                            </div>
```

In the Results card, add the comparison line right after the existing
Total DMG/DPS/Duration grid (exact current text ends at line 468's closing
`</div>` for that grid, immediately before `<RotationDpsChart .../>` at
line 471):

```tsx
                                {timeLimitSeconds != null && timeLimitSeconds > 0 && (() => {
                                    const budget = compareToTimeBudget(totalDuration, timeLimitSeconds);
                                    return (
                                        <div className={cn(
                                            'rounded-md border px-2.5 py-1.5 text-xs',
                                            budget.withinBudget ? 'border-border bg-surface text-muted-foreground' : 'border-warning/40 bg-warning/10 text-warning',
                                        )}>
                                            {totalDuration.toFixed(1)}s / {timeLimitSeconds}s — {budget.withinBudget
                                                ? `${budget.secondsRemaining.toFixed(1)}s to spare`
                                                : `${Math.abs(budget.secondsRemaining).toFixed(1)}s over, would not clear in time`}
                                        </div>
                                    );
                                })()}
```

Add `compareToTimeBudget` to the existing `rotationEngine` import at the
top of `RotationScreen.tsx` (exact current text at line 18):

```ts
import { elapsedTimes, simulateWaves, applyWaveTransition, resolveWaveEnemy, compareToTimeBudget, type WaveConfig } from '@/lib/rotationEngine';
```

- [ ] **Step 8: Typecheck and manually verify**

Run: `npx tsc --noEmit -p src/renderer/tsconfig.json`
Expected: no new errors.

Run the app (`npm run dev` or the web dev server), open Rotation Builder,
build any rotation with at least one step, type a time limit smaller than
the shown Duration, confirm the warning-styled comparison line appears with
the correct "over" amount; type a limit larger than Duration, confirm the
neutral-styled "to spare" line appears; save the rotation, click "New
rotation," reload the saved one, confirm the time limit and comparison
reappear exactly as saved.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/lib/rotationEngine.ts src/renderer/src/stores/rotationStore.ts src/renderer/src/screens/RotationScreen.tsx tests/renderer/rotationEngine.test.ts
git commit -m "feat: compare a rotation's duration against a real time budget"
```

---

### Task 2: `endgamePresets.ts` — fetch/cache/fallback module + empty preset scaffold

**Files:**
- Create: `shared/game-data/endgame-presets/wuthering-waves.json`
- Create: `shared/game-data/endgame-presets/genshin-impact.json`
- Create: `src/renderer/src/lib/endgamePresets.ts`
- Test: `tests/renderer/endgamePresets.test.ts`

**Interfaces:**
- Consumes: `WaveConfig` from `lib/rotationEngine.ts` (Task 1, unchanged),
  `userStorage` from `lib/userStorage.ts` (existing, unchanged).
- Produces: `EndgameModePreset` type, `fetchEndgamePresets(gameId: string): Promise<EndgameModePreset[]>` — the ONLY export Task 3 consumes.

- [ ] **Step 1: Create the (empty) preset data files**

Create `shared/game-data/endgame-presets/wuthering-waves.json`:

```json
{
    "schemaVersion": "1.0",
    "generatedAt": "2026-07-30",
    "presets": []
}
```

Create `shared/game-data/endgame-presets/genshin-impact.json`:

```json
{
    "schemaVersion": "1.0",
    "generatedAt": "2026-07-30",
    "presets": []
}
```

- [ ] **Step 2: Write the failing test**

Create `tests/renderer/endgamePresets.test.ts`:

```ts
(global as unknown as { window: unknown }).window = {};

import { fetchEndgamePresets } from '../../src/renderer/src/lib/endgamePresets';

describe('fetchEndgamePresets', () => {
    const realFetch = global.fetch;
    afterEach(() => {
        global.fetch = realFetch;
        jest.restoreAllMocks();
    });

    it('returns the manifest\'s presets array on a successful fetch', async () => {
        const manifest = { schemaVersion: '1.0', generatedAt: '2026-08-01', presets: [{ id: 'test-1', category: 'trounce-domain', displayName: 'Test Boss', waves: [{ enemyId: 'dummy' }] }] };
        global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => manifest } as Response);
        const result = await fetchEndgamePresets('genshin-impact');
        expect(result).toEqual(manifest.presets);
    });

    it('falls back to the bundled snapshot when fetch throws (e.g. offline) and no cache exists', async () => {
        global.fetch = jest.fn().mockRejectedValue(new Error('network error'));
        const result = await fetchEndgamePresets('genshin-impact');
        expect(Array.isArray(result)).toBe(true); // bundled snapshot is currently an empty array (Task 2 scope) — shape is what's under test, not content
    });

    it('falls back to the bundled snapshot when the response is not ok', async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: false, json: async () => ({}) } as Response);
        const result = await fetchEndgamePresets('wuthering-waves');
        expect(Array.isArray(result)).toBe(true);
    });

    it('falls back to the bundled snapshot when the JSON is malformed (missing schemaVersion)', async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ presets: 'not-an-array' }) } as Response);
        const result = await fetchEndgamePresets('wuthering-waves');
        expect(Array.isArray(result)).toBe(true);
    });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest tests/renderer/endgamePresets.test.ts`
Expected: FAIL — cannot find module `'../../src/renderer/src/lib/endgamePresets'`.

- [ ] **Step 4: Write minimal implementation**

Create `src/renderer/src/lib/endgamePresets.ts`:

```ts
import type { WaveConfig } from './rotationEngine';
import { userStorage } from './userStorage';
import wuwaSnapshot from '@shared/game-data/endgame-presets/wuthering-waves.json';
import giSnapshot from '@shared/game-data/endgame-presets/genshin-impact.json';

/**
 * A curated real end-game-mode target (Tower of Adversity floor, Spiral
 * Abyss half, Imaginarium Theater round, Trounce Domain boss) — auto-
 * delivered (see `fetchEndgamePresets` below) so updating these never
 * needs a new app release. `waves` reuses the EXACT existing
 * `WaveConfig` shape from `lib/rotationEngine.ts` — no new enemy-config
 * concept. `timeLimitSeconds` is optional: Trounce Domains have no real
 * in-combat clock, unlike Abyss/Theater/ToA.
 */
export interface EndgameModePreset {
    id: string;
    category: 'tower-of-adversity' | 'spiral-abyss' | 'imaginarium-theater' | 'trounce-domain';
    displayName: string;
    cycleLabel?: string;
    waves: WaveConfig[];
    timeLimitSeconds?: number;
    specialRuleNote?: string;
    sourceNote?: string;
}

interface EndgamePresetManifest {
    schemaVersion: string;
    generatedAt: string;
    presets: EndgameModePreset[];
}

const MANIFEST_URL = (gameId: string) =>
    `https://raw.githubusercontent.com/Voruzhu/FrequencyManager/main/shared/game-data/endgame-presets/${gameId}.json`;
const CACHE_KEY = (gameId: string) => `fm-endgame-presets-${gameId}`;
const CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours

const BUNDLED_SNAPSHOTS: Record<string, EndgamePresetManifest> = {
    'wuthering-waves': wuwaSnapshot as EndgamePresetManifest,
    'genshin-impact': giSnapshot as EndgamePresetManifest,
};

function isValidManifest(v: unknown): v is EndgamePresetManifest {
    return !!v && typeof v === 'object' && Array.isArray((v as EndgamePresetManifest).presets);
}

/** Fetches this game's end-game-mode preset library, always-fresh (no CDN
 * caching — see this feature's spec for why raw.githubusercontent.com was
 * chosen over jsDelivr). Falls back, in order: local cache (if fetch fails
 * or the response is invalid) -> bundled repo snapshot (if no cache exists
 * either) -> the bundled snapshot's own empty array, never throws. */
export async function fetchEndgamePresets(gameId: string): Promise<EndgameModePreset[]> {
    const cacheKey = CACHE_KEY(gameId);
    try {
        const cachedRaw = await userStorage.getItem(cacheKey);
        if (cachedRaw) {
            const cached = JSON.parse(cachedRaw) as { fetchedAt: number; manifest: EndgamePresetManifest };
            if (Date.now() - cached.fetchedAt < CACHE_MAX_AGE_MS && isValidManifest(cached.manifest)) {
                return cached.manifest.presets;
            }
        }
    } catch { /* corrupt cache entry — fall through to a fresh fetch */ }

    try {
        const res = await fetch(MANIFEST_URL(gameId));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const manifest = await res.json();
        if (!isValidManifest(manifest)) throw new Error('malformed manifest');
        await userStorage.setItem(cacheKey, JSON.stringify({ fetchedAt: Date.now(), manifest }));
        return manifest.presets;
    } catch {
        // Network failure, non-OK response, or malformed JSON — try the
        // (possibly stale, but real) cache before the bundled snapshot.
        try {
            const cachedRaw = await userStorage.getItem(cacheKey);
            if (cachedRaw) {
                const cached = JSON.parse(cachedRaw) as { fetchedAt: number; manifest: EndgamePresetManifest };
                if (isValidManifest(cached.manifest)) return cached.manifest.presets;
            }
        } catch { /* fall through to bundled snapshot */ }
        return BUNDLED_SNAPSHOTS[gameId]?.presets ?? [];
    }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest tests/renderer/endgamePresets.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit -p src/renderer/tsconfig.json`
Expected: no new errors. (If importing `.json` from `@shared/...` fails to
resolve, check `resolveJsonModule` is enabled in `src/renderer/tsconfig.json`
— it's already required for any other JSON import in this codebase; if this
is the first one, add `"resolveJsonModule": true` to that tsconfig's
`compilerOptions`.)

- [ ] **Step 7: Commit**

```bash
git add shared/game-data/endgame-presets/wuthering-waves.json shared/game-data/endgame-presets/genshin-impact.json src/renderer/src/lib/endgamePresets.ts tests/renderer/endgamePresets.test.ts
git commit -m "feat: add auto-delivered end-game-mode preset fetch/cache module (empty preset scaffold)"
```

---

### Task 3: "Load end-game preset" picker in Rotation Builder

**Files:**
- Modify: `src/renderer/src/screens/RotationScreen.tsx`

**Interfaces:**
- Consumes: `fetchEndgamePresets`, `EndgameModePreset` (Task 2); `WaveConfig`, `compareToTimeBudget` (Task 1, already imported); existing `mode`/`waves`/`timeLimitSeconds` state (Task 1).

- [ ] **Step 1: Fetch presets on mount**

Add near the top of `RotationScreen()`, after the existing `useState` calls
for `waves`/`timeLimitSeconds` (Task 1, Step 6):

```ts
    const [endgamePresets, setEndgamePresets] = useState<EndgameModePreset[]>([]);
    useEffect(() => {
        let cancelled = false;
        fetchEndgamePresets(activeGameId).then((presets) => { if (!cancelled) setEndgamePresets(presets); });
        return () => { cancelled = true; };
    }, [activeGameId]);
```

Add the two new imports at the top of the file (alongside the existing
`rotationEngine` import at line 18):

```ts
import { fetchEndgamePresets, type EndgameModePreset } from '@/lib/endgamePresets';
```

Add `useEffect` to the existing React import at line 1:

```ts
import { useMemo, useState, useEffect } from 'react';
```

- [ ] **Step 2: Add the picker + special-rule callout in the Enemy card**

Add a new `<Card>` right after the existing "Enemy" card (immediately
after its closing `</Card>` — the current text ends at line 413), before
the "Saved rotations" card:

```tsx
                    {endgamePresets.length > 0 && (
                        <Card>
                            <CardHeader><CardTitle>End-game mode presets</CardTitle></CardHeader>
                            <CardContent className="space-y-2">
                                {(['tower-of-adversity', 'spiral-abyss', 'imaginarium-theater', 'trounce-domain'] as const).map((category) => {
                                    const inCategory = endgamePresets.filter((p) => p.category === category);
                                    if (inCategory.length === 0) return null;
                                    return (
                                        <div key={category} className="space-y-1">
                                            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{category.replace(/-/g, ' ')}</div>
                                            <div className="flex flex-wrap gap-1.5">
                                                {inCategory.map((preset) => (
                                                    <Button
                                                        key={preset.id}
                                                        size="sm"
                                                        variant="secondary"
                                                        onClick={() => {
                                                            setMode(preset.waves.length > 1 ? 'waves' : 'boss');
                                                            setWaves(preset.waves);
                                                            setTimeLimitSeconds(preset.timeLimitSeconds);
                                                            setActivePreset(preset);
                                                        }}
                                                    >
                                                        {preset.displayName}
                                                    </Button>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </CardContent>
                        </Card>
                    )}
```

Add the tracking state right next to `endgamePresets` (Step 1):

```ts
    const [activePreset, setActivePreset] = useState<EndgameModePreset | null>(null);
```

- [ ] **Step 3: Show the loaded preset's note/cycle/source, dismissibly**

Add inside the same new Card, right after the category-grouped buttons
block (still inside `<CardContent>`, after the `.map((category) => ...)}`
closing):

```tsx
                                {activePreset && (
                                    <div className="space-y-1 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-muted-foreground">
                                        <div className="flex items-center justify-between gap-2">
                                            <span>Loaded: <span className="text-foreground">{activePreset.displayName}</span>{activePreset.cycleLabel ? ` — ${activePreset.cycleLabel}` : ''}</span>
                                            <Button size="sm" variant="ghost" onClick={() => setActivePreset(null)}>Dismiss</Button>
                                        </div>
                                        {activePreset.specialRuleNote && (
                                            <div>Special rule: {activePreset.specialRuleNote} — toggle a matching buff manually if relevant.</div>
                                        )}
                                        {activePreset.sourceNote && <div>Source: {activePreset.sourceNote}</div>}
                                    </div>
                                )}
```

- [ ] **Step 4: Reset `activePreset` alongside the other reset points**

Modify `handleNewRotation` (Task 1, Step 6 already touched this — add one
more line):

```ts
    const handleNewRotation = () => {
        setSteps([]);
        setRotationName('');
        setLoadedRotationId(null);
        setMode('boss');
        setWaves([{ enemyId: 'dummy' }]);
        setTimeLimitSeconds(undefined);
        setActivePreset(null);
    };
```

Modify `handleLoad` (Task 1, Step 6 already touched this — add one more
line; a saved rotation doesn't store `presetId`, so loading one always
clears any currently-shown preset banner, which is correct — the banner is
a "you just picked this" indicator, not a persisted fact about the
rotation):

```ts
    const handleLoad = (r: SavedRotation) => {
        setSteps(r.steps);
        setRotationName(r.name);
        setLoadedRotationId(r.id);
        setActivePartyId(r.partyId);
        setMode(r.mode ?? 'boss');
        setWaves(r.waves ?? [{ enemyId: 'dummy' }]);
        setTimeLimitSeconds(r.timeLimitSeconds);
        setActivePreset(null);
    };
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p src/renderer/tsconfig.json`
Expected: no new errors.

- [ ] **Step 6: Manually verify**

Since `endgamePresets.json` currently ships empty (Task 2's deliberate
scope), the new "End-game mode presets" card won't render anything yet
(`endgamePresets.length > 0` guards it) — that's expected and correct.
Verify by temporarily editing your LOCAL
`shared/game-data/endgame-presets/genshin-impact.json` to add one fake
entry (do not commit this edit), e.g.:
```json
{ "schemaVersion": "1.0", "generatedAt": "2026-07-30", "presets": [
    { "id": "test", "category": "trounce-domain", "displayName": "Test Preset", "waves": [{ "enemyId": "dummy", "hp": 500000 }], "specialRuleNote": "Test note", "sourceNote": "Manual test" }
] }
```
Run the app, open Rotation Builder with GI active, confirm the "End-game
mode presets" card appears with a "Test Preset" button under "trounce
domain," clicking it fills the Enemy card's wave with 500000 HP, and the
loaded-preset banner shows the note/source with a working Dismiss button.
**Revert this local edit before committing** (`git checkout --
shared/game-data/endgame-presets/genshin-impact.json`).

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/screens/RotationScreen.tsx
git commit -m "feat: add end-game-mode preset picker to Rotation Builder"
```

---

## Self-Review Notes

- **Spec coverage:** Section 1 (time budget) -> Task 1. Section 2 (delivery
  mechanism + UI) -> Tasks 2-3. Section 3 (real preset content) ->
  explicitly excluded per Global Constraints, matching the spec's own
  "sourced (not fabricated) before implementation is considered done"
  framing — that gate is a separate follow-up, not skipped silently.
- **Type consistency:** `EndgameModePreset.waves: WaveConfig[]` matches
  `lib/rotationEngine.ts`'s existing export exactly (same import, not
  redefined). `timeLimitSeconds?: number` matches between
  `SavedRotation` (Task 1) and `EndgameModePreset` (Task 2). `activePreset`
  state and its reset points are introduced and threaded consistently
  across Task 3's steps.
- **No placeholders:** the one deliberately-deferred item (real preset
  data) is called out explicitly, with a concrete reason (two failed
  sourcing searches during design) and a concrete follow-up shape (a
  separate content-sourcing task) — not a bare "TODO."
