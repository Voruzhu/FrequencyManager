# Optimizer Main-Slot Bonus Awareness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the gear Optimizer (`shared/calc/optimizer.ts`) both (a) reject candidate gear combos that are physically impossible in WW (more than one cost-4 "main slot" echo) and (b) apply a combo's cost-4 echo's main-slot stat bonus when scoring it — matching the real game's mechanics, and matching what the Calculator/Rotation screens already do.

**Architecture:** Two independent, additive changes to `shared/calc/optimizer.ts`, both reusing patterns already established in the same file: widen the existing `withinCostBudget` combo-legality gate (used by both the single-threaded and worker-pool paths already), and add a new `mainSlotEchoBuffs` function computed per-combo inside `computeBaseLoadouts`, mirroring exactly how `setBonusBuffEntries` is already computed per-combo there.

**Tech Stack:** TypeScript, Jest + ts-jest.

## Global Constraints

- This is WW-only. GI combos (no piece ever has a `cost` field) must be completely unaffected by both changes.
- The new main-slot buff logic only covers **unconditional** (`conditional:false`) `WW_ECHO_SELF_BUFFS` entries — conditional ones (Fallacy of No Return, Jué) already reach the Optimizer today via the caller's manually-toggled buff list (`OptimizeConfig.buffs`), and are out of scope for this change.
- `mainSlotEchoBuffs` must not depend on real, changing game data in its own tests — it takes an optional 3rd parameter for a test-injected lookup table, defaulting to the real `WW_ECHO_SELF_BUFFS` for every real call site.
- No UI changes — this is a scoring-correctness fix only.

---

## Task 1: Widen `withinCostBudget` to reject illegal multi-cost-4 combos

**Files:**
- Modify: `shared/calc/optimizer.ts:718-723`
- Test: `tests/shared/optimizer.test.ts:118-138` (existing `describe('withinCostBudget...')` block — one case needs correcting, not just new cases added)

**Interfaces:**
- Produces: `withinCostBudget(combo: GearEntry[], maxTotalCost: number | undefined): boolean` — same exported name and signature, broadened behavior. Both existing call sites (`optimizer.ts:846`, `src/renderer/src/workers/optimizerWorker.ts:69`) already call this function and need no changes themselves.

- [ ] **Step 1: Write the failing/updated tests**

In `tests/shared/optimizer.test.ts`, the existing block at line 118 is:

```typescript
describe('withinCostBudget — WuWa\'s real 12-cost cap across 5 equipped echoes', () => {
    it('a combo totaling exactly the cap is allowed', () => {
        const combo = [gear(1, 4), gear(1, 3), gear(1, 3), gear(1, 1), gear(1, 1)]; // 4+3+3+1+1 = 12
        expect(withinCostBudget(combo, 12)).toBe(true);
    });

    it('a combo exceeding the cap is rejected (e.g. five cost-4 echoes = 20, impossible in-game)', () => {
        const combo = Array.from({ length: 5 }, () => gear(1, 4));
        expect(withinCostBudget(combo, 12)).toBe(false);
    });

    it('undefined cap (GI, no cost concept) never rejects anything', () => {
        const combo = Array.from({ length: 5 }, () => gear(1, 4));
        expect(withinCostBudget(combo, undefined)).toBe(true);
    });

    it('gear with no cost field at all contributes 0, never blocking a combo', () => {
        const combo = [gear(1), gear(1), gear(1), gear(1), gear(1)];
        expect(withinCostBudget(combo, 12)).toBe(true);
    });
});
```

Replace the entire block with (the 3rd case is corrected — its old data
and assertion no longer hold once this task's change ships, since 5
cost-4 pieces will be rejected by the new slot-shape rule regardless of
`maxTotalCost`; new cases are appended):

```typescript
describe('withinCostBudget — WuWa\'s real 12-cost cap across 5 equipped echoes', () => {
    it('a combo totaling exactly the cap is allowed', () => {
        const combo = [gear(1, 4), gear(1, 3), gear(1, 3), gear(1, 1), gear(1, 1)]; // 4+3+3+1+1 = 12
        expect(withinCostBudget(combo, 12)).toBe(true);
    });

    it('a combo exceeding the cap is rejected (e.g. five cost-4 echoes = 20, impossible in-game)', () => {
        const combo = Array.from({ length: 5 }, () => gear(1, 4));
        expect(withinCostBudget(combo, 12)).toBe(false);
    });

    it('undefined cap never applies a total-SUM rejection (the separate at-most-one-cost-4 slot rule still applies regardless)', () => {
        const combo = [gear(1, 4), gear(1, 3), gear(1, 3), gear(1, 3), gear(1, 3)]; // sum 16, only 1 cost-4 piece
        expect(withinCostBudget(combo, undefined)).toBe(true);
    });

    it('gear with no cost field at all contributes 0, never blocking a combo', () => {
        const combo = [gear(1), gear(1), gear(1), gear(1), gear(1)];
        expect(withinCostBudget(combo, 12)).toBe(true);
    });

    it('a combo with 2 cost-4 pieces is rejected even when the total is well within budget (impossible in-game: only 1 slot can hold a cost-4 piece)', () => {
        const combo = [gear(1, 4), gear(1, 4), gear(1, 1), gear(1, 1), gear(1, 1)]; // sum 11, under any real cap
        expect(withinCostBudget(combo, 12)).toBe(false);
    });

    it('a combo with 2 cost-4 pieces is rejected regardless of maxTotalCost, including undefined', () => {
        const combo = [gear(1, 4), gear(1, 4), gear(1, 1), gear(1, 1), gear(1, 1)];
        expect(withinCostBudget(combo, undefined)).toBe(false);
    });

    it('a combo with exactly 1 cost-4 piece is never rejected by the slot-shape rule', () => {
        const combo = [gear(1, 4), gear(1, 3), gear(1, 3), gear(1, 1), gear(1, 1)];
        expect(withinCostBudget(combo, 12)).toBe(true);
    });

    it('a GI-style combo (no piece has a cost field) is unaffected by the slot-shape rule', () => {
        const combo = [gear(1), gear(1), gear(1), gear(1), gear(1)];
        expect(withinCostBudget(combo, undefined)).toBe(true);
    });
});
```

- [ ] **Step 2: Run the tests to verify the new/changed cases fail**

Run: `npx jest tests/shared/optimizer.test.ts -t "withinCostBudget"`
Expected: FAIL — the two new "2 cost-4 pieces" cases currently return
`true` (no slot-shape check exists yet), so both assertions of `false`
fail. The corrected "undefined cap" case should already PASS as-is (its
new data only has 1 cost-4 piece, so nothing about it depends on the
not-yet-implemented change) — confirm this one passes even before Step 3,
proving the test-data fix itself was correct independent of the
implementation.

- [ ] **Step 3: Implement the widened check**

In `shared/calc/optimizer.ts`, find (lines 713-723):

```typescript
/** Whether a gear combo stays within the real in-game total-cost budget (WuWa's
 * 12, across 5 echoes costing 1/3/4 each — see `OptimizeConfig.maxTotalCost`).
 * Always true when `maxTotalCost` is undefined (GI has no cost concept) or a
 * piece has no `cost` (same reason). Exported so the worker path can apply
 * the identical filter to its own generated slice of combos. */
export function withinCostBudget(combo: GearEntry[], maxTotalCost: number | undefined): boolean {
    if (maxTotalCost == null) return true;
    let total = 0;
    for (const g of combo) total += g.cost ?? 0;
    return total <= maxTotalCost;
}
```

Replace with:

```typescript
/** Whether a gear combo stays within the real in-game total-cost budget (WuWa's
 * 12, across 5 echoes costing 1/3/4 each — see `OptimizeConfig.maxTotalCost`)
 * AND obeys the real per-slot cost ceiling (WuWa's 5 slots are capped at
 * [4, 3, 3, 1, 1] — only ONE slot can ever hold a cost-4 piece, so a combo
 * with 2+ cost-4 pieces is illegal even if their total sum fits the budget,
 * e.g. two cost-4 + three cost-1 = 11, under any real cap, but physically
 * impossible to equip). The cost-4 check runs unconditionally (not gated
 * behind maxTotalCost) since it's a slot-SHAPE constraint, not a budget
 * number — it would still apply even for a hypothetical game module with no
 * total-cost cap at all. Always true for GI (no piece ever has a `cost`
 * field, so neither check ever fires) or a piece with no `cost` (same
 * reason). Exported so the worker path can apply the identical filter to
 * its own generated slice of combos. */
export function withinCostBudget(combo: GearEntry[], maxTotalCost: number | undefined): boolean {
    if (combo.filter((g) => g.cost === 4).length > 1) return false;
    if (maxTotalCost == null) return true;
    let total = 0;
    for (const g of combo) total += g.cost ?? 0;
    return total <= maxTotalCost;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest tests/shared/optimizer.test.ts -t "withinCostBudget"`
Expected: PASS (all 8 cases in the block).

- [ ] **Step 5: Run the full existing test file once**

Run: `npx jest tests/shared/optimizer.test.ts`
Expected: PASS — confirms nothing else in this large existing file (e.g.
`optimize — never recommends a loadout exceeding the real total-cost
budget`, `computeBaseLoadouts / targetRanges / ... — worker-split
equivalence`) accidentally relied on the old 2-cost-4-pieces-allowed
behavior.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit -p src/renderer/tsconfig.json` and `npx tsc --noEmit`
Expected: both PASS.

- [ ] **Step 7: Commit**

```bash
git add shared/calc/optimizer.ts tests/shared/optimizer.test.ts
git commit -m "fix: optimizer rejects gear combos with more than one cost-4 echo"
```

---

## Task 2: Add `mainSlotEchoBuffs` and wire it into `computeBaseLoadouts`

**Files:**
- Modify: `shared/calc/optimizer.ts` (new import + new function + `computeBaseLoadouts` change)
- Test: `tests/shared/optimizer.test.ts` (new `describe` blocks)

**Interfaces:**
- Consumes: `withinCostBudget`'s new guarantee from Task 1 (at most one
  cost-4 piece ever reaches a scored combo) — this is why
  `mainSlotEchoBuffs` needs no separate "which one is the real main slot"
  tie-break the way the renderer's `mainSlotEchoId` does.
- Produces: `mainSlotEchoBuffs(gear: GearEntry[], characterName?: string, selfBuffs?: Record<string, Array<{...}>>): BuffEntry[]` — new export.

- [ ] **Step 1: Write the failing tests**

Add to `tests/shared/optimizer.test.ts` (append after the existing
`describe('withinCostBudget...')` block; add `mainSlotEchoBuffs` to the
existing top-of-file import list alongside `withinCostBudget`):

```typescript
describe('mainSlotEchoBuffs — WuWa cost-4 echo main-slot bonus, derived per combo', () => {
    const SELF_BUFFS: Record<string, Array<{ stat: string; value: number; conditional?: boolean; appliesTo?: string[]; restrictedToCharacters?: string[] }>> = {
        'Test Main Slot Echo': [
            { stat: 'critRate', value: 15, conditional: false },
        ],
        'Test Restricted Echo': [
            { stat: 'critRate', value: 15, conditional: false, restrictedToCharacters: ['Rebecca'] },
        ],
        'Test Conditional Echo': [
            { stat: 'atk', value: 100, conditional: true },
        ],
    };
    function echo(name: string, id: string, cost?: number): GearEntry {
        return { kind: 'echo', id, name, setName: name, rarity: 5, mainStat: { key: 'atk', label: 'ATK', value: 100 }, subStats: [], ...(cost != null ? { cost } : {}) };
    }

    it('returns the cost-4 piece\'s unconditional buff when present', () => {
        const gear = [echo('Test Main Slot Echo', 'a', 4), echo('Filler', 'b', 1)];
        const result = mainSlotEchoBuffs(gear, undefined, SELF_BUFFS);
        expect(result).toHaveLength(1);
        expect(result[0].stat).toBe('critRate');
        expect(result[0].value).toBe(15);
    });

    it('returns an empty array when no cost-4 piece is in the combo', () => {
        const gear = [echo('Filler', 'a', 1), echo('Filler2', 'b', 3)];
        expect(mainSlotEchoBuffs(gear, undefined, SELF_BUFFS)).toEqual([]);
    });

    it('returns an empty array when the cost-4 piece has no WW_ECHO_SELF_BUFFS entry', () => {
        const gear = [echo('No Bonus Echo', 'a', 4)];
        expect(mainSlotEchoBuffs(gear, undefined, SELF_BUFFS)).toEqual([]);
    });

    it('excludes a restrictedToCharacters-gated buff for a non-qualifying character', () => {
        const gear = [echo('Test Restricted Echo', 'a', 4)];
        expect(mainSlotEchoBuffs(gear, 'Jinhsi', SELF_BUFFS)).toEqual([]);
    });

    it('includes a restrictedToCharacters-gated buff for a qualifying character', () => {
        const gear = [echo('Test Restricted Echo', 'a', 4)];
        const result = mainSlotEchoBuffs(gear, 'Rebecca', SELF_BUFFS);
        expect(result).toHaveLength(1);
        expect(result[0].value).toBe(15);
    });

    it('excludes a conditional:true entry (out of scope — reaches the optimizer via OptimizeConfig.buffs instead)', () => {
        const gear = [echo('Test Conditional Echo', 'a', 4)];
        expect(mainSlotEchoBuffs(gear, undefined, SELF_BUFFS)).toEqual([]);
    });

    it('defaults to the real WW_ECHO_SELF_BUFFS table when no 3rd argument is passed', () => {
        expect(() => mainSlotEchoBuffs([echo('Anything', 'a', 4)])).not.toThrow();
    });
});

describe('computeBaseLoadouts — main-slot echo bonus is derived PER COMBO, reaches actual damage', () => {
    function charFor(): CharacterEntry {
        return {
            kind: 'character', id: 'c1', name: 'Rebecca', element: 'Spectro', weaponType: 'Sword', rarity: 5,
            stats: { atk: 1000, critRate: 5, critDmg: 50 },
            skills: [{ id: 'basic', name: 'Basic Attack', type: 'Basic', description: '', multiplier: 1, scaling: 'atk' }],
            equipped: { gearIds: [] },
        };
    }
    const CATALOG: StatDef[] = [{ key: 'atk', label: 'ATK' }, { key: 'critRate', label: 'Crit Rate', percent: true }, { key: 'critDmg', label: 'Crit DMG', percent: true }];
    function echo(name: string, id: string, cost?: number): GearEntry {
        return { kind: 'echo', id, name, setName: name, rarity: 5, mainStat: { key: 'atk', label: 'ATK', value: 100 }, subStats: [], ...(cost != null ? { cost } : {}) };
    }

    it('a combo with a main-slot-bonus-bearing cost-4 echo does more damage than an otherwise-identical combo without one', () => {
        const c = charFor();
        const config: OptimizeConfig = {
            // 'average' mode, not 'always' — critMultiplier('always') is
            // `1 + critDmg/100` and completely ignores critRate, so it would
            // never detect Adam Smasher's +15% Crit Rate bonus at all. Only
            // 'average' (`1 + (critRate/100)*(critDmg/100)`) and a nonzero
            // critDmg make a Crit-Rate-only buff show up as a damage delta.
            targets: [], buffs: [], critMode: 'average',
            enemy: { id: 'e', name: 'Dummy', level: 90, def: 0, res: 0 },
            catalog: CATALOG, topN: 5,
        };
        const combos = [
            [echo('Reminiscence - Nightmare: Adam Smasher', 'a', 4)], // real seeded entry, +15% Crit Rate for Lucy/Rebecca
            [echo('Plain Filler Echo', 'b', 4)], // no main-slot bonus text at all
        ];
        const results = computeBaseLoadouts(c, combos, config);
        expect(results[0].skillDamage.basic).toBeGreaterThan(results[1].skillDamage.basic);
    });

    it('a combo with no cost-4 piece at all does not crash and applies no main-slot bonus', () => {
        const c = charFor();
        const config: OptimizeConfig = {
            targets: [], buffs: [], critMode: 'none',
            enemy: { id: 'e', name: 'Dummy', level: 90, def: 0, res: 0 },
            catalog: CATALOG, topN: 5,
        };
        expect(() => computeBaseLoadouts(c, [[echo('Filler', 'a', 1)]], config)).not.toThrow();
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest tests/shared/optimizer.test.ts -t "mainSlotEchoBuffs"`
Expected: FAIL — `mainSlotEchoBuffs` doesn't exist yet (import error /
`ReferenceError`).

- [ ] **Step 3: Implement `mainSlotEchoBuffs`**

In `shared/calc/optimizer.ts`, add a new import alongside the existing
type-only import block (near the top of the file):

```typescript
import { WW_ECHO_SELF_BUFFS } from '../game-data/echo-set-names';
```

Then add the new function near the other "derive buffs from a specific
gear combo" functions (`gearScopedBuffs` at line 295, `setBonusBuffEntries`
at line 396 — place it after `setBonusBuffEntries`, before
`skillMultiplierAt`):

```typescript
/**
 * A gear combo's main-slot echo bonus (WW only) — the UNCONDITIONAL
 * (`conditional:false`) portion of `WW_ECHO_SELF_BUFFS` for whichever cost-4
 * echo is in this combo, gated by `restrictedToCharacters`. Conditional
 * (opt-in) entries are NOT included here — those already reach the
 * Optimizer via the caller's own manually-toggled buff list
 * (`OptimizeConfig.buffs`), the same way conditional weapon/character
 * buffs do.
 *
 * Must be computed PER COMBO (unlike kit/weapon buffs, which are the same
 * across every combo during a search) since which echo (if any) occupies
 * the combo's own cost-4 slot varies per combo — see `computeBaseLoadouts`,
 * the one caller. `withinCostBudget`'s at-most-one-cost-4-piece rule
 * guarantees `gear.find` below resolves at most one match, so no separate
 * "which one is the real main slot" tie-break is needed here (contrast the
 * renderer's `mainSlotEchoId` in `src/renderer/src/lib/selfBuffs.ts`, which
 * defends against stale/imported data that predates that constraint).
 *
 * Directly imports `WW_ECHO_SELF_BUFFS` rather than threading it through
 * `OptimizeConfig` as a generic parameter — GI has no equivalent mechanic,
 * so there's no second game's table to justify genericity here the way
 * `setBonusBuffEntries`'s `setBonuses` parameter is justified. The 3rd
 * parameter below exists purely so tests can inject a small synthetic
 * table instead of depending on real, evolving game data; every real call
 * site omits it and gets the real table.
 */
export function mainSlotEchoBuffs(
    gear: GearEntry[],
    characterName?: string,
    selfBuffs: Record<string, Array<{ stat: string; value: number; conditional?: boolean; appliesTo?: string[]; restrictedToCharacters?: string[] }>> = WW_ECHO_SELF_BUFFS,
): BuffEntry[] {
    const mainSlot = gear.find((g) => g.cost === 4);
    if (!mainSlot) return [];
    return (selfBuffs[mainSlot.name] ?? [])
        .filter((sb) => sb.conditional === false && (!sb.restrictedToCharacters || sb.restrictedToCharacters.includes(characterName ?? '')))
        .map((sb, i) => ({
            id: `gear-${mainSlot.id}-${sb.stat}-${sb.appliesTo?.join('+') ?? 'all'}-${i}`,
            name: `${mainSlot.name} (Main Slot)`,
            source: mainSlot.name,
            stat: sb.stat,
            value: sb.value,
            ...(sb.appliesTo ? { appliesTo: sb.appliesTo } : {}),
        }));
}
```

- [ ] **Step 4: Run the tests to verify the `mainSlotEchoBuffs` cases pass**

Run: `npx jest tests/shared/optimizer.test.ts -t "mainSlotEchoBuffs"`
Expected: PASS (all 7 cases). The `computeBaseLoadouts` cases from Step 1
will still fail — that wiring happens in Step 5.

- [ ] **Step 5: Wire it into `computeBaseLoadouts`**

In `shared/calc/optimizer.ts`, find (lines 749-761 — exact text, not
reproduced with surrounding lines omitted):

```typescript
    return combos.map((gear, idx) => {
        // Set-bonus buffs depend on THIS combo's own real piece counts (a
        // different combo can activate different sets/tiers entirely) — must
        // be derived per combo, same reason as `gearScopedBuffs` below, not
        // assumed once upfront from a caller's "intended sets" hint.
        const comboSetBuffs = config.setBonuses ? setBonusBuffEntries(gear, config.setBonuses, c.name) : [];
        const allBuffs = [...config.buffs, ...comboSetBuffs];
        const stats = computeBuildStats(c, gear, allBuffs, config.weapon, config.catalog);
        // Per-attack-type DMG% sub-stats (e.g. WW's "Basic Attack DMG Bonus")
        // vary per combo, unlike kit/weapon buffs — must be recomputed here,
        // not folded into `kitScopedBuffs` above (see `gearScopedBuffs`).
        const comboScopedBuffs = [...kitScopedBuffs, ...comboSetBuffs.filter(isScopedBuff), ...gearScopedBuffs(gear)];
```

Replace with:

```typescript
    return combos.map((gear, idx) => {
        // Set-bonus buffs depend on THIS combo's own real piece counts (a
        // different combo can activate different sets/tiers entirely) — must
        // be derived per combo, same reason as `gearScopedBuffs` below, not
        // assumed once upfront from a caller's "intended sets" hint.
        const comboSetBuffs = config.setBonuses ? setBonusBuffEntries(gear, config.setBonuses, c.name) : [];
        // Main-slot echo bonus (WW only) — same "depends on this combo's own
        // real gear" reasoning as comboSetBuffs above; withinCostBudget
        // guarantees at most one cost-4 piece ever reaches a scored combo.
        const comboGearBuffs = mainSlotEchoBuffs(gear, c.name);
        const allBuffs = [...config.buffs, ...comboSetBuffs, ...comboGearBuffs];
        const stats = computeBuildStats(c, gear, allBuffs, config.weapon, config.catalog);
        // Per-attack-type DMG% sub-stats (e.g. WW's "Basic Attack DMG Bonus")
        // vary per combo, unlike kit/weapon buffs — must be recomputed here,
        // not folded into `kitScopedBuffs` above (see `gearScopedBuffs`).
        const comboScopedBuffs = [...kitScopedBuffs, ...comboSetBuffs.filter(isScopedBuff), ...comboGearBuffs.filter(isScopedBuff), ...gearScopedBuffs(gear)];
```

- [ ] **Step 6: Run the tests to verify everything passes**

Run: `npx jest tests/shared/optimizer.test.ts`
Expected: PASS (every case in the file, including the two new
`computeBaseLoadouts — main-slot echo bonus...` cases and everything from
Task 1).

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit -p src/renderer/tsconfig.json` and `npx tsc --noEmit`
Expected: both PASS (the root config matters here — this change touches
`shared/` code consumed by `adapters/`-adjacent paths, matching this
project's own established gotcha of running both configs).

- [ ] **Step 8: Commit**

```bash
git add shared/calc/optimizer.ts tests/shared/optimizer.test.ts
git commit -m "feat: optimizer applies a combo's cost-4 echo main-slot bonus when scoring"
```

---

## Task 3: Full regression pass

**Files:** none (verification only)

- [ ] **Step 1: Full unit test suite**

Run: `npx jest`
Expected: PASS, including every new/changed case from Tasks 1-2 and every
pre-existing test. The one known pre-existing, unrelated failure
(`tests/core/event-bus.test.ts`, an EventBus shutdown timing assertion —
confirmed via direct diff to touch neither `core/event-bus.ts` nor its
test file across this entire feature and the prior echo main-slot bonus
feature) is expected and not a regression.

- [ ] **Step 2: Both typecheck configs**

Run: `npx tsc --noEmit -p src/renderer/tsconfig.json`
Run: `npx tsc --noEmit`
Expected: both PASS.

- [ ] **Step 3: Both builds**

Run: `npm run build:main`
Run: `npm run build:renderer`
Expected: both succeed.

- [ ] **Step 4: Manual/CDP verification of an actual Optimizer run**

Using this project's established CDP verification technique (clone the
real `%APPDATA%\frequency-manager` userData directory to a scratch path
first, hash-verify before/after, never touch the real directory directly;
rebuild `dist/renderer` before launching since `npx electron .` loads the
prebuilt bundle otherwise): open the Calculator for a character who owns
the seeded "Reminiscence - Nightmare: Adam Smasher" echo (or another
sourced cost-4 echo) among their unequipped inventory, run "Optimize gear"
with a pool that includes both that echo and at least one plain (no
main-slot-bonus) cost-4 echo, and confirm:
- No recommended loadout ever includes 2 cost-4 pieces simultaneously.
- If the main-slot-bonus echo would improve the optimization target for a
  qualifying character, the Optimizer actually recommends including it
  over an otherwise-similar plain cost-4 echo (or, at minimum, that
  equipping the recommended result and viewing it in the Calculator shows
  the bonus correctly applied — confirming the Optimizer's internal score
  and the Calculator's displayed result agree).

- [ ] **Step 5: No commit for this task** — it's verification-only. If any
  step fails, fix forward with a new commit and re-run this task's steps.
