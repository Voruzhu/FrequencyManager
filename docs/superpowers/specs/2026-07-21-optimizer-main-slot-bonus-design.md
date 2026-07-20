# Optimizer awareness of echo "main slot" bonuses

## Context

The echo main-slot bonus feature (`docs/superpowers/specs/2026-07-20-echo-main-slot-bonus-design.md`)
made the Calculator and Rotation screens correctly apply a cost-4 echo's
main-slot stat bonus. The gear Optimizer (`shared/calc/optimizer.ts`) was
explicitly left untouched by that feature and flagged as a follow-up: it
never calls `gearAutoBuffs` at all, so main-slot bonuses (now 25 entries)
don't influence which combo the Optimizer recommends.

Investigating this surfaced a second, more fundamental gap in the same
area: the Optimizer's only gear-combo legality check,
`withinCostBudget` (`optimizer.ts:718`), verifies total cost ≤ `maxTotalCost`
(12) but never checks the real per-slot cost ceiling. WW's 5 echo slots are
capped at `[4, 3, 3, 1, 1]`, and only one slot can ever hold a cost-4
piece. A combo with two cost-4 pieces plus three cost-1 pieces sums to 11
(under budget) but is physically impossible to equip — there's nowhere for
a second cost-4 piece to go. (Cost-3 and cost-1 pieces don't need an
equivalent check: the existing sum≤12 constraint already rules out any
combo that would over-fill those slot tiers, confirmed by direct
arithmetic — cost-4 is the only tier where "sum fits" and "physically
equippable" can diverge.)

Both gaps are fixed together here, since applying a main-slot bonus is only
unambiguous once at most one cost-4 piece can ever be in a combo.

## A. Combo legality — widen `withinCostBudget`

`shared/calc/optimizer.ts:718`, current:

```typescript
export function withinCostBudget(combo: GearEntry[], maxTotalCost: number | undefined): boolean {
    if (maxTotalCost == null) return true;
    let total = 0;
    for (const g of combo) total += g.cost ?? 0;
    return total <= maxTotalCost;
}
```

New:

```typescript
export function withinCostBudget(combo: GearEntry[], maxTotalCost: number | undefined): boolean {
    // At most one cost-4 echo can ever be equipped — Slot 1 is the only
    // slot with a high enough cost ceiling to hold one. This check applies
    // regardless of maxTotalCost (it's a slot-shape constraint, not a
    // budget one) — a combo with 2 cost-4 pieces is illegal even if the
    // game had no total-cost cap at all.
    if (combo.filter((g) => g.cost === 4).length > 1) return false;
    if (maxTotalCost == null) return true;
    let total = 0;
    for (const g of combo) total += g.cost ?? 0;
    return total <= maxTotalCost;
}
```

Name kept as-is (its two existing call sites — `optimizer.ts:846`'s
single-threaded path and `optimizerWorker.ts:69`'s worker-pool path — both
already treat it as "the" combo-legality gate; broadening its doc comment
is enough, a rename would only add ripple for no reader benefit). Both
call sites get the new constraint with no code change of their own, since
both already just call this one function.

This check runs unconditionally (not gated behind `maxTotalCost != null`)
so it also applies for game modules that don't set a total-cost cap at all
— the "only one cost-4 slot" constraint is about WW's slot shape, not its
budget number, and GI combos (which have no `cost` field on any piece)
pass trivially since `g.cost === 4` is never true for `undefined`.

## B. New `mainSlotEchoBuffs` function

`shared/calc/optimizer.ts` gains a new export, alongside the existing
`gearScopedBuffs`/`setBonusBuffEntries` (the two other "derive buffs from
this specific gear combo" functions it already has):

```typescript
import { WW_ECHO_SELF_BUFFS } from '../game-data/echo-set-names';

/**
 * A gear combo's main-slot echo bonus (WW only) — the UNCONDITIONAL
 * (`conditional:false`) portion of `WW_ECHO_SELF_BUFFS` for whichever cost-4
 * echo is in this combo, gated by `restrictedToCharacters`. Conditional
 * (opt-in) entries are NOT included here — those already reach the
 * Optimizer via the caller's own manually-toggled buff list
 * (`OptimizeConfig.buffs`), the same way conditional weapon/character
 * buffs do; only two entries are currently conditional (Fallacy of No
 * Return, Jué) and neither needs new plumbing.
 *
 * Must be computed PER COMBO (unlike kit/weapon buffs, which are the same
 * across every combo during a search) since which echo (if any) occupies
 * the combo's own cost-4 slot varies per combo — see `computeBaseLoadouts`,
 * the one caller. `withinCostBudget`'s at-most-one-cost-4-piece rule (see
 * above) guarantees `gear.find` below resolves at most one match, so no
 * separate "which one is the real main slot" tie-break is needed here
 * (contrast the renderer's `mainSlotEchoId`, which defends against
 * stale/imported data that predates that constraint).
 *
 * Directly imports `WW_ECHO_SELF_BUFFS` rather than threading it through
 * `OptimizeConfig` as a generic parameter — this matches the renderer's own
 * existing `gearSelfBuffs` (`src/renderer/src/data/gameData.ts`), which
 * hardcodes the same WW-only table rather than generalizing it; GI has no
 * equivalent mechanic (see the original feature's spec, "Out of scope").
 */
export function mainSlotEchoBuffs(gear: GearEntry[], characterName?: string): BuffEntry[] {
    const mainSlot = gear.find((g) => g.cost === 4);
    if (!mainSlot) return [];
    return (WW_ECHO_SELF_BUFFS[mainSlot.name] ?? [])
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

The `id` format matches the renderer's own `gearBuffId` convention
(`gear-${gearId}-${stat}-${appliesTo}-${i}`) for readability/consistency,
though the two are independent functions, not a shared call — see "Out of
scope" below for why they aren't unified.

## C. Wire it into `computeBaseLoadouts`

`shared/calc/optimizer.ts:749-761`, current:

```typescript
return combos.map((gear, idx) => {
    const comboSetBuffs = config.setBonuses ? setBonusBuffEntries(gear, config.setBonuses, c.name) : [];
    const allBuffs = [...config.buffs, ...comboSetBuffs];
    const stats = computeBuildStats(c, gear, allBuffs, config.weapon, config.catalog);
    const comboScopedBuffs = [...kitScopedBuffs, ...comboSetBuffs.filter(isScopedBuff), ...gearScopedBuffs(gear)];
    ...
```

New (one new line, two call sites extended — mirrors `comboSetBuffs`
exactly):

```typescript
return combos.map((gear, idx) => {
    const comboSetBuffs = config.setBonuses ? setBonusBuffEntries(gear, config.setBonuses, c.name) : [];
    const comboGearBuffs = mainSlotEchoBuffs(gear, c.name);
    const allBuffs = [...config.buffs, ...comboSetBuffs, ...comboGearBuffs];
    const stats = computeBuildStats(c, gear, allBuffs, config.weapon, config.catalog);
    const comboScopedBuffs = [...kitScopedBuffs, ...comboSetBuffs.filter(isScopedBuff), ...comboGearBuffs.filter(isScopedBuff), ...gearScopedBuffs(gear)];
    ...
```

`computeBaseLoadouts` is the single function shared by both the
single-threaded `optimize()` path and every worker's per-slice call (per
its own existing doc comment) — this one change covers both paths for the
buff-application half; only the combo-filtering half (part A) needed
duplicating across the 2 `withinCostBudget` call sites, and that's already
handled by widening the one shared function.

## Out of scope

- **Not unifying `mainSlotEchoBuffs` with the renderer's `gearAutoBuffs`.**
  The two serve different callers with different real requirements:
  `gearAutoBuffs` supports buff-stacking (`stacks` parameter) for the live
  Calculator/Rotation UI; the Optimizer has no equivalent per-combo stack
  input today (no current main-slot entry has `stacksMax` set, so this
  isn't a live gap, just a reason not to force a shared abstraction).
  `gearAutoBuffs` also defends against stale multi-cost-4-piece data via
  `mainSlotEchoId`, a concern that doesn't apply to Optimizer combos, which
  are freshly generated from the pool and always satisfy part A's
  constraint by construction. A few lines of "find the cost-4 piece,
  filter conditional+restriction" overlap between two small,
  independently-correct, independently-tested functions is preferred here
  over one function serving two contexts with different needs.
- **GI is unaffected.** `WW_ECHO_SELF_BUFFS` is keyed by WW echo names only;
  `mainSlotEchoBuffs` returns `[]` for any GI gear combo since no GI
  artifact name ever matches a key in that table, and `withinCostBudget`'s
  new check is a no-op for GI (no GI piece ever has `cost === 4`, since GI
  artifacts use `slot`, not `cost`).
- **No UI change.** This is purely an Optimizer-scoring correctness fix —
  the Optimizer's results panel already displays whatever `stats`/
  `skillDamage` a `Loadout` carries; no new display logic is needed for the
  main-slot bonus's contribution to show up in an already-recommended
  build's numbers.

## Testing

`tests/shared/optimizer.test.ts` (existing file, gains new cases):
- `withinCostBudget`: a combo with 2 cost-4 pieces is rejected regardless
  of total cost; a combo with exactly 1 cost-4 piece and a valid total is
  accepted; a GI-style combo (no piece has a `cost` field) is unaffected
  by the new check.
- `mainSlotEchoBuffs`: returns the cost-4 piece's unconditional buff when
  present; returns `[]` when no cost-4 piece is in the combo; excludes a
  `restrictedToCharacters`-gated buff for a non-qualifying `characterName`
  and includes it for a qualifying one; excludes a `conditional:true`
  entry (e.g. a Jué-shaped stub) since those are out of this function's
  scope by design.
- `computeBaseLoadouts` (or a focused integration case): a combo containing
  a main-slot-bonus-bearing echo produces higher relevant stats than an
  otherwise-identical combo without one, confirming the buff actually
  reaches `computeBuildStats`, not just that the buff object is
  constructed correctly in isolation.
