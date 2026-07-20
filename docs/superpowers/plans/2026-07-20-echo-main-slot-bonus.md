# Echo "Main Slot" Bonuses Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Model WuWa's cost-4 echo "main slot" stat bonuses in the damage calculator (currently only 3 of 54 cost-4 echoes have any bonus modeled), enforce that at most one cost-4 echo can be equipped at a time (mirroring the real game), and show a "Main Slot" badge on the equipped cost-4 echo in both the Calculator's gear list and the Inventory screen.

**Architecture:** Extend the existing `ConditionalSelfBuff` shared type with a `restrictedToCharacters` field (mirroring the Set-bonus system's identical field), thread a character-name parameter through the existing `gearAutoBuffs`/`conditionalGearBuffs` functions to enforce it, add a WW-specific cost-4 exclusivity rule to `calcStore`'s `equipGear` (mirroring the existing GI artifact-slot rule), and add an optional `mainSlot` badge prop to the shared `GearCard` component consumed by both display locations.

**Tech Stack:** TypeScript, React, Zustand, Jest + ts-jest (`node` test environment).

## Global Constraints

- Main-slot bonus data covers the **flat stat-buff portion only** — any echo whose text also unlocks a new castable Echo Skill move (e.g. Adam Smasher) has that portion explicitly omitted, not fabricated as a stand-in stat.
- Every sourced entry must be verified against `api.encore.moe/en/echo/<id>` (`Skill.DescriptionEx`) and cross-checked against a 2nd source (wuthering.gg or wutheringwaves.gg) — no guessing, gaps reported explicitly.
- Do not assume `Nightmare:`/`Reminiscence:`-prefixed cost-4 echoes share bonus text with a same-named base entry — verify each of the 54 catalog entries independently.
- This is WW-only. Genshin Impact's artifact system has no equivalent mechanic and is untouched.

---

## Task 1: `ConditionalSelfBuff` gains `restrictedToCharacters`, seed one real entry

**Files:**
- Modify: `shared/types/game-bundle.ts:114-131` (`ConditionalSelfBuff` interface)
- Modify: `shared/game-data/echo-set-names.ts:770-781` (`WW_ECHO_SELF_BUFFS` declaration + data)
- Modify: `src/renderer/src/data/gameData.ts:369-371` (`gearSelfBuffs` return annotation)

**Interfaces:**
- Produces: `ConditionalSelfBuff.restrictedToCharacters?: string[]` (canonical field, doc-commented).
- Produces: `WW_ECHO_SELF_BUFFS`'s value type and `gearSelfBuffs`'s return type both gain a matching `restrictedToCharacters?: string[]` field (these are hand-maintained inline structural types, not aliases of `ConditionalSelfBuff` — same pre-existing convention already used for `conditional`/`appliesTo` in both spots).
- Produces: a real, sourced `'Reminiscence - Nightmare: Adam Smasher'` entry in `WW_ECHO_SELF_BUFFS`, restricted to `['Lucy', 'Rebecca']` — this seeds Tasks 2-4's tests with real data and is verified against `api.encore.moe/en/echo/6000201`'s `Skill.DescriptionEx`: *"...When Lucy or Rebecca has this Echo equipped in the main slot, their Crit. Rate is increased by 15% and they unlock special Echo Skills."* (the "unlock special Echo Skills" portion is intentionally omitted per the Global Constraints).

- [ ] **Step 1: Add the field to the canonical type**

In `shared/types/game-bundle.ts`, find the `ConditionalSelfBuff` interface (starts line 114):

```typescript
export interface ConditionalSelfBuff {
    stat: string;
    label: string;
    value: number;
    conditional?: boolean;
    appliesTo?: string[];
    scaleOff?: BuffEntry['scaleOff'];
    stacksMax?: number;
    /**
     * Present ONLY for the clean "N seconds after casting skill X" pattern —
     * lets the Rotation Builder auto-compute this buff's uptime instead of
     * requiring a manual toggle. Absent for stance/stack/HP-threshold-gated
     * buffs (permanently manual-toggle-only, not a placeholder — see
     * `docs/superpowers/specs/2026-07-19-rotation-builder-overhaul-design.md`
     * Section 3 for the full scoping rationale).
     */
    autoTrigger?: { skillIds: string[]; durationSeconds: number };
}
```

Add a new field after `autoTrigger`:

```typescript
export interface ConditionalSelfBuff {
    stat: string;
    label: string;
    value: number;
    conditional?: boolean;
    appliesTo?: string[];
    scaleOff?: BuffEntry['scaleOff'];
    stacksMax?: number;
    /**
     * Present ONLY for the clean "N seconds after casting skill X" pattern —
     * lets the Rotation Builder auto-compute this buff's uptime instead of
     * requiring a manual toggle. Absent for stance/stack/HP-threshold-gated
     * buffs (permanently manual-toggle-only, not a placeholder — see
     * `docs/superpowers/specs/2026-07-19-rotation-builder-overhaul-design.md`
     * Section 3 for the full scoping rationale).
     */
    autoTrigger?: { skillIds: string[]; durationSeconds: number };
    /**
     * Restricts this buff to specific wielders (`CharacterEntry.name` exact
     * match), same convention as `SetBonusEntry.restrictedToCharacters` —
     * e.g. an echo's main-slot bonus that only applies to certain
     * characters (WW's "Adam Smasher" echo → Lucy/Rebecca only). Absent =
     * applies to any wielder.
     */
    restrictedToCharacters?: string[];
}
```

- [ ] **Step 2: Widen `WW_ECHO_SELF_BUFFS`'s declared type and add the seed entry**

In `shared/game-data/echo-set-names.ts`, find (line 770):

```typescript
export const WW_ECHO_SELF_BUFFS: Record<string, Array<{ stat: string; label: string; value: number; conditional?: boolean; appliesTo?: string[] }>> = {
    'Lady of the Sea': [
        { stat: 'elemDmg', label: 'Aero DMG Bonus (Echo Skill)', value: 12, conditional: true },
        { stat: 'dmgBonus', label: 'Liberation DMG Bonus (Echo Skill)', value: 12, conditional: true, appliesTo: ['ult'] },
    ],
    'Fallacy of No Return': [
        { stat: 'energyRegen', label: 'Energy Regen (Echo Skill)', value: 10, conditional: true },
    ],
    'Jué': [
        { stat: 'dmgBonus', label: 'Res. Skill DMG Bonus (Echo Skill, "Blessing of Time")', value: 16, conditional: true, appliesTo: ['skill'] },
    ],
};
```

Replace with:

```typescript
export const WW_ECHO_SELF_BUFFS: Record<string, Array<{ stat: string; label: string; value: number; conditional?: boolean; appliesTo?: string[]; restrictedToCharacters?: string[] }>> = {
    'Lady of the Sea': [
        { stat: 'elemDmg', label: 'Aero DMG Bonus (Echo Skill)', value: 12, conditional: true },
        { stat: 'dmgBonus', label: 'Liberation DMG Bonus (Echo Skill)', value: 12, conditional: true, appliesTo: ['ult'] },
    ],
    'Fallacy of No Return': [
        { stat: 'energyRegen', label: 'Energy Regen (Echo Skill)', value: 10, conditional: true },
    ],
    'Jué': [
        { stat: 'dmgBonus', label: 'Res. Skill DMG Bonus (Echo Skill, "Blessing of Time")', value: 16, conditional: true, appliesTo: ['skill'] },
    ],
    // Main-slot bonus only — this echo ALSO unlocks a brand-new castable
    // Echo Skill move for Lucy/Rebecca specifically; that portion is a
    // separate, larger feature (a new skill, not a buff) and is
    // intentionally not modeled here. Source: api.encore.moe/en/echo/6000201
    // Skill.DescriptionEx.
    'Reminiscence - Nightmare: Adam Smasher': [
        { stat: 'critRate', label: 'Crit. Rate (Main Slot)', value: 15, conditional: false, restrictedToCharacters: ['Lucy', 'Rebecca'] },
    ],
};
```

(Note: `conditional: false` here because this bonus is an always-on passive stat once the equip/character gate is satisfied — not a manually-toggled "activate Echo Skill" proc, unlike the 3 pre-existing entries above it.)

- [ ] **Step 3: Widen `gearSelfBuffs`'s return type annotation**

In `src/renderer/src/data/gameData.ts`, find (line 369):

```typescript
export function gearSelfBuffs(g: { name: string }): Array<{ stat: string; label: string; value: number; conditional?: boolean; appliesTo?: string[] }> {
    return WW_ECHO_SELF_BUFFS[g.name] ?? [];
}
```

Replace with:

```typescript
export function gearSelfBuffs(g: { name: string }): Array<{ stat: string; label: string; value: number; conditional?: boolean; appliesTo?: string[]; restrictedToCharacters?: string[] }> {
    return WW_ECHO_SELF_BUFFS[g.name] ?? [];
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p src/renderer/tsconfig.json` and `npx tsc --noEmit`
Expected: both PASS, no errors.

- [ ] **Step 5: Commit**

```bash
git add shared/types/game-bundle.ts shared/game-data/echo-set-names.ts src/renderer/src/data/gameData.ts
git commit -m "feat: add restrictedToCharacters to ConditionalSelfBuff, seed Adam Smasher main-slot bonus"
```

---

## Task 2: `gearAutoBuffs`/`conditionalGearBuffs` enforce `restrictedToCharacters` AND main-slot exclusivity

**Files:**
- Modify: `src/renderer/src/lib/selfBuffs.ts:157-178`
- Test: `tests/renderer/selfBuffs.test.ts`

**Interfaces:**
- Consumes: `gearSelfBuffs(g)` from Task 1, now returning entries that may carry `restrictedToCharacters`.
- Produces: `gearAutoBuffs(gear: GearData[], stacks?: Record<string, number>, characterName?: string)` and `conditionalGearBuffs(gear: GearData[], stacks?: Record<string, number>, characterName?: string)` — both existing exports, new 3rd parameter appended (backward compatible — every existing caller passing 2 args still compiles and behaves identically, since an omitted `characterName` only excludes buffs that ARE restricted, and no pre-existing data has that field set).
- Produces: a new module-local `mainSlotEchoId(gear)` helper (not exported — both functions are in the same file and share it).

**Why this task also needs a main-slot guard, not just `restrictedToCharacters`:** every entry in `WW_ECHO_SELF_BUFFS` (all 4, after Task 1) is a cost-4 echo — this table only ever models *main-slot* bonuses, by construction (Slot 1 is the only slot a cost-4 piece can occupy, and only Slot 1 unlocks the bonus). Task 4's `equipGear` change stops the equip *button* from creating a two-cost-4-echo state going forward, but doesn't retroactively fix a stale saved loadout (pre-dating this feature) or imported data that already has two. Without a guard here, `gearAutoBuffs`/`conditionalGearBuffs` would apply the bonus for *every* matching cost-4 piece present, not just one — this task adds that guard directly in the damage engine so the invariant holds regardless of how the equipped state got there, not only when it was reached via the equip button.

- [ ] **Step 1: Write the failing tests**

Add to `tests/renderer/selfBuffs.test.ts` (append a new `describe` block; the file already imports `conditionalGearBuffs` from `../../src/renderer/src/lib/selfBuffs` and `* as gameData` — add `gearAutoBuffs` to the existing import line):

```typescript
import { conditionalWeaponBuffs, conditionalCharacterBuffs, conditionalGearBuffs, gearAutoBuffs } from '../../src/renderer/src/lib/selfBuffs';
```

```typescript
describe('restrictedToCharacters forwarding', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('gearAutoBuffs includes a restricted buff when the character name matches', () => {
        jest.spyOn(gameData, 'gearSelfBuffs').mockReturnValue([
            { stat: 'critRate', label: 'Test', value: 15, conditional: false, restrictedToCharacters: ['Lucy', 'Rebecca'] } as never,
        ]);
        const gear = [{ id: 'g1', name: 'Test Echo' }];
        const result = gearAutoBuffs(gear as never, {}, 'Lucy');
        expect(result).toHaveLength(1);
        expect(result[0].value).toBe(15);
    });

    it('gearAutoBuffs excludes a restricted buff when the character name does not match', () => {
        jest.spyOn(gameData, 'gearSelfBuffs').mockReturnValue([
            { stat: 'critRate', label: 'Test', value: 15, conditional: false, restrictedToCharacters: ['Lucy', 'Rebecca'] } as never,
        ]);
        const gear = [{ id: 'g1', name: 'Test Echo' }];
        const result = gearAutoBuffs(gear as never, {}, 'Jinhsi');
        expect(result).toHaveLength(0);
    });

    it('gearAutoBuffs excludes a restricted buff when no character name is passed', () => {
        jest.spyOn(gameData, 'gearSelfBuffs').mockReturnValue([
            { stat: 'critRate', label: 'Test', value: 15, conditional: false, restrictedToCharacters: ['Lucy', 'Rebecca'] } as never,
        ]);
        const gear = [{ id: 'g1', name: 'Test Echo' }];
        expect(gearAutoBuffs(gear as never)).toHaveLength(0);
    });

    it('gearAutoBuffs keeps an unrestricted buff regardless of character name', () => {
        jest.spyOn(gameData, 'gearSelfBuffs').mockReturnValue([
            { stat: 'atk', label: 'Test', value: 5, conditional: false } as never,
        ]);
        const gear = [{ id: 'g1', name: 'Test Echo' }];
        expect(gearAutoBuffs(gear as never, {}, 'Anyone')).toHaveLength(1);
        expect(gearAutoBuffs(gear as never)).toHaveLength(1);
    });

    it('conditionalGearBuffs applies the same restriction', () => {
        jest.spyOn(gameData, 'gearSelfBuffs').mockReturnValue([
            { stat: 'dmgBonus', label: 'Test', value: 20, conditional: true, restrictedToCharacters: ['Lucy'] } as never,
        ]);
        const gear = [{ id: 'g1', name: 'Test Echo' }];
        expect(conditionalGearBuffs(gear as never, {}, 'Lucy')).toHaveLength(1);
        expect(conditionalGearBuffs(gear as never, {}, 'Rebecca')).toHaveLength(0);
    });
});

describe('main-slot (cost-4) exclusivity in gearAutoBuffs/conditionalGearBuffs', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('only the first cost-4 echo\'s buff applies when more than one is somehow equipped', () => {
        jest.spyOn(gameData, 'gearSelfBuffs').mockImplementation((g: { name: string }) => {
            if (g.name === 'Echo A') return [{ stat: 'critRate', label: 'A', value: 10, conditional: false }] as never;
            if (g.name === 'Echo B') return [{ stat: 'critRate', label: 'B', value: 20, conditional: false }] as never;
            return [];
        });
        const gear = [
            { id: 'g1', name: 'Echo A', cost: 4 },
            { id: 'g2', name: 'Echo B', cost: 4 },
        ];
        const result = gearAutoBuffs(gear as never);
        expect(result).toHaveLength(1);
        expect(result[0].source).toBe('Echo A');
    });

    it('a non-cost-4 echo\'s buff still applies alongside the main-slot one', () => {
        jest.spyOn(gameData, 'gearSelfBuffs').mockImplementation((g: { name: string }) => {
            if (g.name === 'Main Echo') return [{ stat: 'critRate', label: 'Main', value: 10, conditional: false }] as never;
            if (g.name === 'Side Echo') return [{ stat: 'atk', label: 'Side', value: 5, conditional: false }] as never;
            return [];
        });
        const gear = [
            { id: 'g1', name: 'Main Echo', cost: 4 },
            { id: 'g2', name: 'Side Echo', cost: 3 },
        ];
        const result = gearAutoBuffs(gear as never);
        expect(result).toHaveLength(2);
    });

    it('conditionalGearBuffs applies the same main-slot exclusivity', () => {
        jest.spyOn(gameData, 'gearSelfBuffs').mockImplementation((g: { name: string }) => {
            if (g.name === 'Echo A') return [{ stat: 'dmgBonus', label: 'A', value: 10, conditional: true }] as never;
            if (g.name === 'Echo B') return [{ stat: 'dmgBonus', label: 'B', value: 20, conditional: true }] as never;
            return [];
        });
        const gear = [
            { id: 'g1', name: 'Echo A', cost: 4 },
            { id: 'g2', name: 'Echo B', cost: 4 },
        ];
        const result = conditionalGearBuffs(gear as never);
        expect(result).toHaveLength(1);
        expect(result[0].source).toBe('Echo A');
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/renderer/selfBuffs.test.ts -t "restrictedToCharacters forwarding"`
Expected: FAIL — `gearAutoBuffs` doesn't accept a 3rd argument yet and doesn't filter on it, so the "excludes" cases will incorrectly include the buff.

Run: `npx jest tests/renderer/selfBuffs.test.ts -t "main-slot"`
Expected: FAIL — the "only the first cost-4 echo's buff applies" and "conditionalGearBuffs applies the same main-slot exclusivity" cases currently return 2 results, not 1 (no guard exists yet).

- [ ] **Step 3: Implement the filter and the main-slot guard**

In `src/renderer/src/lib/selfBuffs.ts`, find (lines 156-166):

```typescript
/** Unconditional self-buffs from specific named equipped gear pieces' own "Echo Skill" (WW) — always applied. Iterates every equipped piece, not just one. */
export function gearAutoBuffs(gear: GearData[], stacks: Record<string, number> = {}) {
    const out: Array<{ id: string; name: string; source: string; stat: string; value: number; appliesTo?: string[] }> = [];
    for (const g of gear) {
        gearSelfBuffs(g)
            .map((sb, i) => ({ sb, i }))
            .filter(({ sb }) => sb.conditional === false)
            .forEach(({ sb, i }) => { const id = gearBuffId(g.id, sb, i); out.push({ id, name: `${g.name} (Echo Skill)`, source: g.name, stat: sb.stat, value: resolveStackedValue(id, { value: sb.value }, stacks), ...(sb.appliesTo ? { appliesTo: sb.appliesTo } : {}) }); });
    }
    return out;
}
```

Replace with:

```typescript
/** The character's single "main slot" echo id, if any — WW's cost-4 pieces are the only ones that can occupy Slot 1, and only Slot 1 unlocks an echo's main-slot bonus. `calcStore`'s equip-time exclusivity (Task 4) keeps at most one cost-4 piece equipped going forward; this guards stale/imported loadouts that somehow have more than one, by treating only the first as active. */
function mainSlotEchoId(gear: GearData[]): string | undefined {
    return gear.find((g) => g.cost === 4)?.id;
}

/** Unconditional self-buffs from specific named equipped gear pieces' own "Echo Skill" (WW) — always applied. Iterates every equipped piece, not just one. `characterName` gates entries with `restrictedToCharacters` (e.g. a main-slot bonus restricted to specific wielders). Every entry in `WW_ECHO_SELF_BUFFS` is a main-slot (cost-4) bonus, so a cost-4 piece that isn't the (single) main-slot one is skipped entirely. */
export function gearAutoBuffs(gear: GearData[], stacks: Record<string, number> = {}, characterName?: string) {
    const out: Array<{ id: string; name: string; source: string; stat: string; value: number; appliesTo?: string[] }> = [];
    const mainSlotId = mainSlotEchoId(gear);
    for (const g of gear) {
        if (g.cost === 4 && g.id !== mainSlotId) continue;
        gearSelfBuffs(g)
            .map((sb, i) => ({ sb, i }))
            .filter(({ sb }) => sb.conditional === false && (!sb.restrictedToCharacters || sb.restrictedToCharacters.includes(characterName ?? '')))
            .forEach(({ sb, i }) => { const id = gearBuffId(g.id, sb, i); out.push({ id, name: `${g.name} (Echo Skill)`, source: g.name, stat: sb.stat, value: resolveStackedValue(id, { value: sb.value }, stacks), ...(sb.appliesTo ? { appliesTo: sb.appliesTo } : {}) }); });
    }
    return out;
}
```

Then find (lines 168-178):

```typescript
/** Conditional (opt-in) self-buffs from specific named equipped gear pieces' own "Echo Skill" — mirrors `gearAutoBuffs`. */
export function conditionalGearBuffs(gear: GearData[], stacks: Record<string, number> = {}) {
    const out: Array<{ id: string; name: string; source: string; stat: string; label?: string; value: number; appliesTo?: string[]; autoTrigger?: { skillIds: string[]; durationSeconds: number } }> = [];
    for (const g of gear) {
        gearSelfBuffs(g)
            .map((sb, i) => ({ sb, i }))
            .filter(({ sb }) => sb.conditional !== false)
            .forEach(({ sb, i }) => { const id = gearBuffId(g.id, sb, i); const autoTrigger = (sb as { autoTrigger?: { skillIds: string[]; durationSeconds: number } }).autoTrigger; out.push({ id, name: `${g.name} (Echo Skill)`, source: g.name, stat: sb.stat, label: sb.label, value: resolveStackedValue(id, { value: sb.value }, stacks), ...(sb.appliesTo ? { appliesTo: sb.appliesTo } : {}), ...(autoTrigger ? { autoTrigger } : {}) }); });
    }
    return out;
}
```

Replace with:

```typescript
/** Conditional (opt-in) self-buffs from specific named equipped gear pieces' own "Echo Skill" — mirrors `gearAutoBuffs`, including the same main-slot exclusivity guard. `characterName` gates entries with `restrictedToCharacters`. */
export function conditionalGearBuffs(gear: GearData[], stacks: Record<string, number> = {}, characterName?: string) {
    const out: Array<{ id: string; name: string; source: string; stat: string; label?: string; value: number; appliesTo?: string[]; autoTrigger?: { skillIds: string[]; durationSeconds: number } }> = [];
    const mainSlotId = mainSlotEchoId(gear);
    for (const g of gear) {
        if (g.cost === 4 && g.id !== mainSlotId) continue;
        gearSelfBuffs(g)
            .map((sb, i) => ({ sb, i }))
            .filter(({ sb }) => sb.conditional !== false && (!sb.restrictedToCharacters || sb.restrictedToCharacters.includes(characterName ?? '')))
            .forEach(({ sb, i }) => { const id = gearBuffId(g.id, sb, i); const autoTrigger = (sb as { autoTrigger?: { skillIds: string[]; durationSeconds: number } }).autoTrigger; out.push({ id, name: `${g.name} (Echo Skill)`, source: g.name, stat: sb.stat, label: sb.label, value: resolveStackedValue(id, { value: sb.value }, stacks), ...(sb.appliesTo ? { appliesTo: sb.appliesTo } : {}), ...(autoTrigger ? { autoTrigger } : {}) }); });
    }
    return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/renderer/selfBuffs.test.ts`
Expected: PASS (all tests in the file, including the pre-existing `autoTrigger forwarding` describe block, which must remain green).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/lib/selfBuffs.ts tests/renderer/selfBuffs.test.ts
git commit -m "feat: gearAutoBuffs/conditionalGearBuffs enforce restrictedToCharacters and main-slot exclusivity"
```

---

## Task 3: Wire character name through all 3 call sites

**Files:**
- Modify: `src/renderer/src/screens/CalculatorScreen.tsx:464`
- Modify: `src/renderer/src/screens/RotationScreen.tsx:46,79`

**Interfaces:**
- Consumes: `gearAutoBuffs`/`conditionalGearBuffs`'s new 3rd parameter from Task 2.

- [ ] **Step 1: `CalculatorScreen.tsx`**

Find (line 464, inside `CharacterSummary`, where `c: CharacterData` is already in scope — confirmed by the adjacent `setBonusBuffEntries(gear, data.setBonuses, c.name)` one line above already using this exact pattern):

```typescript
const allStatBuffs = [...stripAutoSkillTreeBuffs(buffs, c, skillTreeInvested), ...partyBuffs, ...setBuffs, ...weaponAutoBuffs(weapon, c, gear, data.statCatalog, {}, refineMultiplier), ...constellationAutoBuffs(c, sequence, gear, weapon, data.statCatalog), ...characterAutoBuffs(c, gear, weapon, data.statCatalog, {}, skillTreeInvested), ...gearAutoBuffs(gear)];
```

Replace with:

```typescript
const allStatBuffs = [...stripAutoSkillTreeBuffs(buffs, c, skillTreeInvested), ...partyBuffs, ...setBuffs, ...weaponAutoBuffs(weapon, c, gear, data.statCatalog, {}, refineMultiplier), ...constellationAutoBuffs(c, sequence, gear, weapon, data.statCatalog), ...characterAutoBuffs(c, gear, weapon, data.statCatalog, {}, skillTreeInvested), ...gearAutoBuffs(gear, {}, c.name)];
```

- [ ] **Step 2: `RotationScreen.tsx` — conditional candidates**

Find (line 46, inside `conditionalBuffCandidates`, where `member: PartyMemberResolved` is the function's parameter):

```typescript
        ...conditionalGearBuffs(member.gear),
```

Replace with:

```typescript
        ...conditionalGearBuffs(member.gear, {}, member.character.name),
```

- [ ] **Step 3: `RotationScreen.tsx` — step damage**

Find (line 79, inside `computeStepDamage`, where `member: PartyMemberResolved | undefined` is already null-checked above at line 70's `if (!member || !step.skillId) return { damage: 0 };`, so `member.character.name` is safe here):

```typescript
        ...gearAutoBuffs(member.gear),
```

Replace with:

```typescript
        ...gearAutoBuffs(member.gear, {}, member.character.name),
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p src/renderer/tsconfig.json`
Expected: PASS.

- [ ] **Step 5: Run full unit test suite**

Run: `npx jest`
Expected: PASS — no existing test relies on the old 2-arg call signature since these are call sites, not the functions under test.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/screens/CalculatorScreen.tsx src/renderer/src/screens/RotationScreen.tsx
git commit -m "feat: pass character name to gearAutoBuffs/conditionalGearBuffs call sites"
```

---

## Task 4: Equip-time cost-4 exclusivity

**Files:**
- Modify: `src/renderer/src/stores/calcStore.ts:162-181`

**Interfaces:**
- Consumes: `GearData.cost` (already exists), `gd.gearKind` (already exists, used one line above for the analogous GI rule).
- Produces: no new exports — behavioral change to the existing `equipGear` action only.

- [ ] **Step 1: Implement the rule**

Find (lines 162-181):

```typescript
    equipGear: (id) =>
        set((s) => {
            if (s.equipped.gearIds.includes(id)) return s;
            const gameId = useGameStore.getState().activeGameId;
            const gd = getGameData(gameId);
            const maxGear = gd.maxGear ?? DEFAULT_MAX_GEAR;
            const owned = useInventoryStore.getState().getInventory(gameId).gear;
            const resolve = (gid: string) => owned.find((g) => g.id === gid) ?? gd.gear.find((g) => g.id === gid);
            let gearIds = s.equipped.gearIds;
            // GI artifacts are one-per-slot: equipping a piece unequips whatever else
            // occupies the same slot (Flower/Plume/Sands/Goblet/Circlet). WuWa echoes
            // have no per-slot exclusivity (cost-budget), so this only applies to artifacts.
            const incoming = resolve(id);
            if (gd.gearKind === 'artifact' && incoming?.slot) {
                gearIds = gearIds.filter((gid) => resolve(gid)?.slot !== incoming.slot);
            }
            const equipped = { ...s.equipped, gearIds: [...gearIds, id].slice(-maxGear) };
            useLoadoutStore.getState().setLoadout(gameId, s.characterId, equipped);
            return { equipped };
        }),
```

Replace with:

```typescript
    equipGear: (id) =>
        set((s) => {
            if (s.equipped.gearIds.includes(id)) return s;
            const gameId = useGameStore.getState().activeGameId;
            const gd = getGameData(gameId);
            const maxGear = gd.maxGear ?? DEFAULT_MAX_GEAR;
            const owned = useInventoryStore.getState().getInventory(gameId).gear;
            const resolve = (gid: string) => owned.find((g) => g.id === gid) ?? gd.gear.find((g) => g.id === gid);
            let gearIds = s.equipped.gearIds;
            // GI artifacts are one-per-slot: equipping a piece unequips whatever else
            // occupies the same slot (Flower/Plume/Sands/Goblet/Circlet). WuWa echoes
            // have no per-slot exclusivity (cost-budget), so this only applies to artifacts.
            const incoming = resolve(id);
            if (gd.gearKind === 'artifact' && incoming?.slot) {
                gearIds = gearIds.filter((gid) => resolve(gid)?.slot !== incoming.slot);
            }
            // WuWa cost-4 echoes are one-per-character: Slot 1 (the only slot that
            // can hold one) is the "main slot" — equipping a 2nd cost-4 echo
            // auto-unequips the first, mirroring the GI artifact-slot rule above.
            if (gd.gearKind === 'echo' && incoming?.cost === 4) {
                gearIds = gearIds.filter((gid) => resolve(gid)?.cost !== 4);
            }
            const equipped = { ...s.equipped, gearIds: [...gearIds, id].slice(-maxGear) };
            useLoadoutStore.getState().setLoadout(gameId, s.characterId, equipped);
            return { equipped };
        }),
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p src/renderer/tsconfig.json`
Expected: PASS.

- [ ] **Step 3: Manual verification (no existing test harness covers `calcStore.equipGear`, including the pre-existing GI rule — this stays consistent with that, verified via CDP instead of a new mocking harness)**

Using the CDP verification technique already established for this app: launch the app, switch to a WW character, equip a cost-4 echo (e.g. any cost-4 piece in inventory), confirm it shows equipped; equip a *different* cost-4 echo; confirm the first is now unequipped and only the second remains in the equipped list. Equip a non-cost-4 echo alongside the remaining cost-4 one; confirm both stay equipped.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/stores/calcStore.ts
git commit -m "feat: equipping a 2nd cost-4 echo auto-unequips the first"
```

---

## Task 5: `GearCard` gains a "Main Slot" badge

**Files:**
- Modify: `src/renderer/src/components/GearCard.tsx:33-70`

**Interfaces:**
- Produces: `GearCard`'s prop list gains `mainSlot?: boolean` (optional, defaults to falsy/no badge — every existing caller not yet passing it keeps rendering exactly as before).

- [ ] **Step 1: Add the prop and render the badge**

Find (lines 33-45):

```typescript
export function GearCard({
    g, gameId, expanded, onToggleExpand, onClick, actions, highlight,
}: {
    g: GearData;
    gameId: string;
    expanded: boolean;
    onToggleExpand: () => void;
    /** Optional — clicking the card body (not the chevron/actions) inspects the item. */
    onClick?: () => void;
    actions?: React.ReactNode;
    /** Highlight ring, e.g. "currently equipped". */
    highlight?: boolean;
}) {
```

Replace with:

```typescript
export function GearCard({
    g, gameId, expanded, onToggleExpand, onClick, actions, highlight, mainSlot,
}: {
    g: GearData;
    gameId: string;
    expanded: boolean;
    onToggleExpand: () => void;
    /** Optional — clicking the card body (not the chevron/actions) inspects the item. */
    onClick?: () => void;
    actions?: React.ReactNode;
    /** Highlight ring, e.g. "currently equipped". */
    highlight?: boolean;
    /** WW only — true when this is the character's equipped cost-4 "main slot" echo. */
    mainSlot?: boolean;
}) {
```

Find (line 66):

```typescript
                            {g.cost != null ? <Badge variant="outline">Cost {g.cost}</Badge> : g.slot ? <Badge variant="outline">{g.slot}</Badge> : null}
```

Replace with:

```typescript
                            {g.cost != null ? <Badge variant="outline">Cost {g.cost}</Badge> : g.slot ? <Badge variant="outline">{g.slot}</Badge> : null}
                            {mainSlot && <Badge variant="secondary">Main Slot</Badge>}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p src/renderer/tsconfig.json`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/GearCard.tsx
git commit -m "feat: GearCard gains an optional Main Slot badge"
```

---

## Task 6: Show the badge in the Calculator's gear list and the Inventory screen

**Files:**
- Modify: `src/renderer/src/components/shell/InspectorPanel.tsx:397-418` (`GearPicker` — backs the Calculator's gear list)
- Modify: `src/renderer/src/screens/InventoryScreen.tsx:201-215`

**Interfaces:**
- Consumes: `GearCard`'s new `mainSlot` prop from Task 5.

- [ ] **Step 1: `GearPicker` (Calculator's gear list)**

In `src/renderer/src/components/shell/InspectorPanel.tsx`, find (inside `GearPicker`'s `ordered.map`, lines 393-419):

```typescript
                {ordered.map((g) => {
                    const here = equipped.gearIds.includes(g.id);
                    const owners = here ? [] : ownersOf(g.id);
                    return (
                        <GearCard
                            key={g.id}
                            g={g}
                            gameId={activeGameId}
                            highlight={here}
                            expanded={expanded.has(g.id)}
                            onToggleExpand={() => toggle(g.id)}
                            actions={
```

Replace with:

```typescript
                {ordered.map((g) => {
                    const here = equipped.gearIds.includes(g.id);
                    const owners = here ? [] : ownersOf(g.id);
                    return (
                        <GearCard
                            key={g.id}
                            g={g}
                            gameId={activeGameId}
                            highlight={here}
                            mainSlot={here && g.cost === 4}
                            expanded={expanded.has(g.id)}
                            onToggleExpand={() => toggle(g.id)}
                            actions={
```

(No other lines in this block change — the closing `actions={...}` JSX below is untouched.)

- [ ] **Step 2: `InventoryScreen.tsx` — add the equipped-anywhere lookup**

First, add the `useLoadoutStore` import. Find (line 13):

```typescript
import { useInventoryStore, useOwnedInventory } from '../stores/inventoryStore';
```

Replace with:

```typescript
import { useInventoryStore, useOwnedInventory } from '../stores/inventoryStore';
import { useLoadoutStore } from '../stores/loadoutStore';
```

Then, inside the `InventoryScreen` component, find (line 25):

```typescript
    const { removeCharacter, removeWeapon, removeGear } = useInventoryStore();
```

Add immediately after it:

```typescript
    const { removeCharacter, removeWeapon, removeGear } = useInventoryStore();
    // Reactive to every character's loadout, to know which owned cost-4 echo (if any) is someone's "main slot" piece.
    const gameLoadouts = useLoadoutStore((s) => s.byGame[activeGameId]) ?? {};
    const isEquippedAnywhere = (gearId: string) => Object.values(gameLoadouts).some((l) => l.gearIds.includes(gearId));
```

- [ ] **Step 3: `InventoryScreen.tsx` — pass the prop**

Find (lines 201-208):

```typescript
                                <GearCard
                                    key={g.id}
                                    g={g}
                                    gameId={activeGameId}
                                    highlight={selectedId === g.id}
                                    expanded={expandedGear.has(g.id)}
                                    onToggleExpand={() => toggleGear(g.id)}
                                    onClick={() => showItem(g)}
```

Replace with:

```typescript
                                <GearCard
                                    key={g.id}
                                    g={g}
                                    gameId={activeGameId}
                                    highlight={selectedId === g.id}
                                    mainSlot={g.cost === 4 && isEquippedAnywhere(g.id)}
                                    expanded={expandedGear.has(g.id)}
                                    onToggleExpand={() => toggleGear(g.id)}
                                    onClick={() => showItem(g)}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p src/renderer/tsconfig.json`
Expected: PASS.

- [ ] **Step 5: Manual CDP verification**

Equip the seeded "Reminiscence - Nightmare: Adam Smasher" echo (Task 1) onto Lucy or Rebecca (add the character to inventory first if not already owned). Confirm:
- The Calculator's gear list shows a "Main Slot" badge on it.
- The Inventory screen also shows "Main Slot" on that same echo.
- The Calculator's damage breakdown includes the +15% Crit Rate buff.
- Equipping that same echo piece onto a 3rd character who isn't Lucy/Rebecca (overriding the "already equipped elsewhere" warning, same as any other gear piece) still shows the "Main Slot" badge for that character too (it's about slot position, not who's wielding it) — but that character's damage breakdown does NOT include the +15% Crit Rate buff, confirming the character restriction is enforced independently of the slot-position badge.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/shell/InspectorPanel.tsx src/renderer/src/screens/InventoryScreen.tsx
git commit -m "feat: show Main Slot badge in Calculator gear list and Inventory screen"
```

---

## Task 7: Full cost-4 echo data-sourcing pass

**Files:**
- Modify: `shared/game-data/echo-set-names.ts:770-790ish` (`WW_ECHO_SELF_BUFFS`, appending remaining entries)

**Interfaces:**
- Consumes: the widened `WW_ECHO_SELF_BUFFS` type from Task 1.
- Produces: as many new sourced entries as real main-slot bonuses exist among the remaining 53 cost-4 catalog entries (some may correctly have no entry at all — a plain stat stick with no Echo Skill bonus text is not a gap).

- [ ] **Step 1: Enumerate every cost-4 catalog entry**

Run: `npx tsc --noEmit` is not needed for this step — instead, grep the full list to work from:

```bash
grep -oE "'[^']+':\s*\[4\]" shared/game-data/echo-set-names.ts
```

This returns all 54 entries (including the `'Reminiscence - Nightmare: Adam Smasher'` one already sourced in Task 1 — skip it here).

- [ ] **Step 2: Source each remaining entry**

For each of the other 53 echo names, look up `https://api.encore.moe/en/echo` (top-level key is `Echo`, an array — NOT `.data`/`.echoList`/`.roleList`, confirmed this session), find the matching `Name`, note its `Id`, then fetch `https://api.encore.moe/en/echo/<id>` and read `Skill.DescriptionEx` (or the equivalent bonus-text field) in full.

For each entry, determine:
- **No main-slot bonus text at all** (plain stat stick) → leave absent from `WW_ECHO_SELF_BUFFS`. Not a gap.
- **A flat stat bonus with no character restriction** → add an entry with `conditional: false` (if always-on once equipped in the main slot) and no `restrictedToCharacters`.
- **A flat stat bonus restricted to specific characters** → add `restrictedToCharacters: [...]` with those characters' exact `CharacterEntry.name` values (cross-check spelling against `adapters/game-definitions/wuthering-waves/characters.ts` or the equivalent roster file).
- **A stat bonus bundled with a "unlocks a new castable Echo Skill" clause** (Adam-Smasher-style) → record ONLY the stat portion, same as Task 1's seed entry. Add a one-line code comment noting the omitted move, matching Task 1's comment style.
- **Ambiguous or no source data found** → do not fabricate. Leave absent and note it in the Task 7 completion report (Step 5).

Cross-check every entry against a 2nd source (wuthering.gg or wutheringwaves.gg) before adding it.

- [ ] **Step 3: Add all sourced entries to `WW_ECHO_SELF_BUFFS`**

Append each new entry into the object literal in `shared/game-data/echo-set-names.ts`, following the exact same shape and comment style as the existing 4 entries (3 pre-existing + Task 1's Adam Smasher seed).

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p src/renderer/tsconfig.json` and `npx tsc --noEmit`
Expected: both PASS.

- [ ] **Step 5: Report**

Produce a short summary: how many of the 53 got a real entry, how many were confirmed plain stat sticks (no entry, by design), how many were character-restricted, how many had an omitted "unlocks new skill" clause, and any genuine gaps (no source data found) — matching the reporting discipline of every prior full-roster sourcing pass in this project.

- [ ] **Step 6: Commit**

```bash
git add shared/game-data/echo-set-names.ts
git commit -m "feat: source main-slot stat bonuses for the full cost-4 echo roster"
```

---

## Task 8: Full regression pass

**Files:** none (verification only)

- [ ] **Step 1: Full unit test suite**

Run: `npx jest`
Expected: PASS, including every new test from Task 2 and every pre-existing test.

- [ ] **Step 2: Both typecheck configs**

Run: `npx tsc --noEmit -p src/renderer/tsconfig.json`
Run: `npx tsc --noEmit`
Expected: both PASS (per this project's established gotcha — the root config catches `shared/`-consumed-by-`adapters/` type issues the renderer-scoped one misses).

- [ ] **Step 3: Both builds**

Run: `npm run build:main`
Run: `npm run build:renderer`
Expected: both succeed.

- [ ] **Step 4: End-to-end CDP walkthrough**

Repeat Task 6 Step 5's manual verification once more against the fully-sourced table (Task 7), spot-checking 2-3 additional newly-sourced echoes beyond just Adam Smasher: equip each, confirm its buff appears in the damage breakdown and its badge appears in both UI locations; confirm equipping a 2nd cost-4 echo still correctly swaps out the first.

- [ ] **Step 5: No commit for this task** — it's verification-only. If any step fails, fix forward with a new commit and re-run this task's steps.
