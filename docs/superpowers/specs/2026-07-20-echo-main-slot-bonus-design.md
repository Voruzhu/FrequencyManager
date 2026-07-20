# Echo "Main Slot" bonuses

## Context

WuWa characters have 5 fixed-cost echo slots (Slot 1 ≤ cost 4, Slots 2-3 ≤
cost 3, Slots 4-5 ≤ cost 1). Only the echo physically in Slot 1 can have its
"Echo Skill" cast in combat, and only that slot unlocks the echo's "main
slot" bonus, if it has one. Since Slot 1 is the only slot that can ever hold
a cost-4 piece, cost-4 echoes are effectively the ones that carry this
mechanic.

Two problems exist today:
- `WW_ECHO_SELF_BUFFS` (`shared/game-data/echo-set-names.ts`) has only 3
  entries populated (`Lady of the Sea`, `Fallacy of No Return`, `Jué`) out of
  ~54 cost-4 catalog entries — most main-slot bonuses are simply missing
  from the damage calculator.
- Nothing stops equipping two cost-4 echoes on one character simultaneously,
  which is impossible in the real game, and nothing indicates in the UI
  which equipped echo is "the" main-slot one.

Some cost-4 echoes (e.g. "Reminiscence - Nightmare: Adam Smasher") grant
**both** a flat stat buff *and* unlock a whole new castable Echo Skill move,
gated to specific characters (Lucy/Rebecca only, in that example) — verified
directly against `api.encore.moe/en/echo/6000201`'s raw `Skill.DescriptionEx`
text. This spec covers **the stat-buff portion only**. The "unlocks a new
castable move" portion is a materially bigger feature (modeling an entirely
new skill, not a buff) and is explicitly deferred, not built here.

## Data model change

Add one field to the existing `ConditionalSelfBuff` type
(`shared/types/game-bundle.ts:114`), mirroring the Set-bonus system's own
`restrictedToCharacters` field name and semantics exactly (see
`shared/calc/optimizer.ts:384` for the existing analogous check):

```typescript
export interface ConditionalSelfBuff {
    stat: string;
    label: string;
    value: number;
    conditional?: boolean;
    appliesTo?: string[];
    scaleOff?: BuffEntry['scaleOff'];
    stacksMax?: number;
    autoTrigger?: { skillIds: string[]; durationSeconds: number };
    /**
     * Restricts this buff to specific wielders (`CharacterEntry.name` exact
     * match) — e.g. an echo's main-slot bonus that only applies to certain
     * characters. Absent = applies to any wielder.
     */
    restrictedToCharacters?: string[];
}
```

This is consumed identically everywhere `ConditionalSelfBuff` already flows
(constellation/sequence nodes, character/weapon/gear self-buffs) — no
per-source special-casing. For this feature specifically, it gates entries
in `WW_ECHO_SELF_BUFFS`.

## Equip-time exclusivity

`src/renderer/src/stores/calcStore.ts`'s `equipGear` already has a GI rule
that unequips whatever else occupies the same artifact slot. Immediately
after that block, add the WW equivalent for cost-4 echoes:

```typescript
const incoming = resolve(id);
if (gd.gearKind === 'artifact' && incoming?.slot) {
    gearIds = gearIds.filter((gid) => resolve(gid)?.slot !== incoming.slot);
}
// WuWa cost-4 echoes are one-per-character: Slot 1 is the only slot that
// can hold one, so equipping a 2nd auto-unequips the first (mirrors the
// GI artifact-slot rule above).
if (gd.gearKind === 'echo' && incoming?.cost === 4) {
    gearIds = gearIds.filter((gid) => resolve(gid)?.cost !== 4);
}
```

This guarantees at most one cost-4 echo is ever equipped on a character at
once, which both fixes the real-game accuracy gap and lets the UI badge
(below) use a simple `cost === 4` check with no separate "which slot"
tracking.

## Damage-calc wiring

`src/renderer/src/lib/selfBuffs.ts`'s `gearAutoBuffs` (line 157) and
`conditionalGearBuffs` (line 169) each gain a new parameter:

```typescript
export function gearAutoBuffs(gear: GearData[], stacks: Record<string, number> = {}, characterName?: string) {
export function conditionalGearBuffs(gear: GearData[], stacks: Record<string, number> = {}, characterName?: string) {
```

Inside both, when iterating a gear piece's `gearSelfBuffs(g)` entries, skip
any entry where `sb.restrictedToCharacters` is set and doesn't include
`characterName` — same shape as `optimizer.ts:384`'s existing check.

Call sites (all 3, confirmed via full-codebase grep — no others exist):
- `src/renderer/src/screens/CalculatorScreen.tsx:464` —
  `...gearAutoBuffs(gear)` becomes `...gearAutoBuffs(gear, {}, c.name)`
  (`c` is already the character in scope here).
- `src/renderer/src/screens/RotationScreen.tsx:46` —
  `...conditionalGearBuffs(member.gear)` becomes
  `...conditionalGearBuffs(member.gear, {}, member.character.name)`.
- `src/renderer/src/screens/RotationScreen.tsx:79` —
  `...gearAutoBuffs(member.gear)` becomes
  `...gearAutoBuffs(member.gear, {}, member.character.name)`.

## UI: "Main Slot" badge

Both requested display locations — the Calculator's equipped-gear list and
the Inventory screen — render through the same shared `GearCard` component
(`src/renderer/src/components/GearCard.tsx:33`), which already shows a
Cost/slot/Rarity badge row (line 66). `GearCard` gains one new optional
prop:

```typescript
/** True when this piece is the character's cost-4 "main slot" echo. */
mainSlot?: boolean;
```

Rendered as an additional `<Badge variant="outline">Main Slot</Badge>`
alongside the existing Cost badge when `mainSlot` is true.

Callers compute it themselves — no change to `GearData`/`GearEntry` itself:

- **`GearPicker`** (`src/renderer/src/components/shell/InspectorPanel.tsx:397`
  — this is the actual component backing the Calculator's gear list: it
  shows all owned gear, equipped-first, with Equip/Unequip actions). Each
  card already computes `here = equipped.gearIds.includes(g.id)`; pass
  `mainSlot={here && g.cost === 4}`. Equip-time exclusivity (above)
  guarantees this is unambiguous.
- **`InventoryScreen.tsx`** (line 201's `GearCard` usage): needs a new
  "is this gear piece equipped by any character" lookup, since Inventory
  shows all owned gear regardless of equip state. Mirror `GearPicker`'s
  existing `ownersOf` pattern against `useLoadoutStore`'s `gameLoadouts`,
  simplified to a boolean:
  ```typescript
  const gameLoadouts = useLoadoutStore((s) => s.byGame[activeGameId]) ?? {};
  const isEquippedAnywhere = (gearId: string) =>
      Object.values(gameLoadouts).some((l) => l.gearIds.includes(gearId));
  ```
  Pass `mainSlot={g.cost === 4 && isEquippedAnywhere(g.id)}`.

The gear picker's "Already equipped" cross-character warning window
(`AlreadyEquippedWindow`, `InspectorPanel.tsx:427`) is left unchanged — not
one of the two requested locations.

## Data-sourcing pass

Source main-slot stat bonuses for the full cost-4 roster: **54 raw entries**
in `WW_ECHO_COSTS` (confirmed by direct count, not estimated). Several share
a `Nightmare:`/`Reminiscence:`/`Reminiscence -`-prefixed name with what looks
like a base echo (e.g. `Thundering Mephis` / `Nightmare: Thundering Mephis`),
but this is **not** confirmed to be a simple cosmetic reskin sharing
identical bonus text — some prefixed entries (e.g. `Nightmare: Kelpie`) have
no visible base-name counterpart in the cost-4 list at all, and the
`Reminiscence:` tier looks like it may be its own distinct set of echoes
rather than reskins. Do not assume any two entries share bonus data going
in — look up **all 54 entries independently** and let the source data show
whether any turn out identical.

For each of the 54:

- Verify against `api.encore.moe/en/echo/<id>` (`Skill.DescriptionEx`) as
  primary source, cross-checked against a 2nd source (wuthering.gg or
  wutheringwaves.gg) per this project's established sourcing standard.
- Record **only** the flat stat-buff portion in `WW_ECHO_SELF_BUFFS`. Where
  an echo's text also unlocks a new castable move (Adam Smasher-style),
  omit that portion — do not fabricate a stand-in stat for it.
- Populate `restrictedToCharacters` for any echo whose bonus text is
  character-gated (e.g. Adam Smasher → `['Lucy', 'Rebecca']`); leave it
  unset for universal (any-wielder) bonuses, matching the 3 existing entries.
- Echoes with no main-slot bonus text at all (many cost-4 echoes are plain
  stat sticks with no special Echo Skill effect) are correctly left absent
  from the table — not an error, not a gap to report.
- If two entries' source text turns out to be genuinely identical
  (confirmed, not assumed), that's fine to note, but each must still be
  independently verified rather than inferred from its name.
- Report explicit gaps (no source data found, ambiguous text) rather than
  guessing, matching every prior full-roster sourcing pass this project has
  done.

## Out of scope

- The "unlocks a new castable Echo Skill move" portion of dual-bonus echoes
  (Adam Smasher and any others sharing this pattern) — a separate, larger
  feature (modeling a new skill, not a buff), deferred.
- Genshin Impact: this entire mechanic (fixed-cost slots, a Slot-1-only
  bonus) doesn't exist in GI's artifact system — `GearEntry.slot` there
  already models GI's actual (different) one-per-slot rule, untouched by
  this change.
- The gear picker's cross-character "Already equipped" warning window —
  unchanged.
- No new explicit 1-5 slot-position tracking — equip-time cost-4
  exclusivity makes "is this cost-4 echo the main slot one" unambiguous
  without needing to model physical slot positions 1-5.

## Testing

- `selfBuffs.test.ts` (or wherever `gearAutoBuffs`/`conditionalGearBuffs`
  are currently tested): a case where a `restrictedToCharacters`-gated echo
  buff applies for a matching character name and is skipped for a
  non-matching one; existing (unrestricted) cases continue to pass with no
  character name / a non-matching one, confirming the new parameter is
  backward compatible.
- `calcStore` equip logic: equipping a 2nd cost-4 echo unequips the first;
  equipping a non-cost-4 echo alongside an existing cost-4 one leaves both
  equipped.
- Manual CDP verification (matching this session's established technique):
  equip a sourced cost-4 echo, confirm its buff appears in the Calculator's
  damage breakdown; confirm the "Main Slot" badge shows in both the
  Calculator's gear list and the Inventory screen; confirm equipping a 2nd
  cost-4 echo auto-unequips the first in the UI.
