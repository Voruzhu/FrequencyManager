# Echo Skill castable-move damage — Lucy/Rebecca via Adam Smasher

## Context

A handful of WW echoes, when equipped in a specific character's Main Slot,
replace that echo's generic Echo Skill (the button-press active every echo
has) with a unique, character-locked move dealing real damage. This was
explicitly deferred during the 2026-07-21 main-slot-bonus work ("stat-only
scope for now") — see project memory `echo-main-slot-bonus-2026-07-21`,
which named 4 known cases: **Reminiscence - Nightmare: Adam Smasher**
(→ Lucy/Rebecca), **The False Sovereign**, **Nightmare: Kelpie**, and
**Nightmare: Hecate's proc**.

The engine already has an `'echo'` `appliesTo` scope category
(`shared/calc/optimizer.ts`'s `canonScope`) — several existing
`WW_ECHO_SELF_BUFFS` entries (Nightmare: Hecate, Nameless Explorer,
Corrosaurus, Forbidden Bastion) already grant `+20% Echo Skill DMG Bonus
(Main Slot)` scoped to `['echo']`, but there is currently no skill anywhere
in the roster with that scope for the bonus to ever match — dead weight.
Adding a real Echo Skill damage instance for Lucy/Rebecca makes at least
Nightmare: Hecate's own `+20%` bonus meaningful for the first time too
(confirm during implementation whether Hecate's bonus is meant to stack
with this specific move or is unrelated — check the source text).

**Verified real numbers** (WebSearch, cross-referenced against
wuthering.gg / game8.co / an in-game text screenshot posted by
@WuWa_Ani_Info): Lucy's Echo Skill (Tap) deals **273.60% ATK Spectro DMG**
to nearby enemies (Hold does the same DMG plus a movement/slow utility
effect not modeled — this app doesn't simulate movement). Rebecca's fires
missiles: **16 instances × 17.10% ATK Electro DMG** each.

## Scope

**This pass:** Lucy + Rebecca via Reminiscence - Nightmare: Adam Smasher
only — the one case with verified real numbers. **Follow-up, not this
pass:** The False Sovereign / Nightmare: Kelpie / Nightmare: Hecate's proc
— same shape, needs the same WebSearch-and-verify treatment before any
numbers go in, done as a separate change once this one is confirmed
working end-to-end.

## Design

### Data
Add one `SkillDef` each to Lucy's and Rebecca's `skills` array
(`adapters/game-definitions/wuthering-waves/characters.ts` or wherever
their skills currently live — confirm exact file at implementation time):
- Lucy: `{ id: 'echo-skill-adam-smasher', name: 'Echo Skill (Reminiscence - Nightmare: Adam Smasher)', type: 'echo', multiplier: 2.736, scaling: 'atk' }` (single hit, 273.60%).
- Rebecca: `{ id: 'echo-skill-adam-smasher', name: 'Echo Skill (Reminiscence - Nightmare: Adam Smasher)', type: 'echo', multiplier: 0.171, scaling: 'atk', hits: 16 }` — confirm the exact multi-hit field name this codebase's `SkillDef` actually uses for repeated-instance skills (grep for an existing 16-hit-style skill, e.g. Adam Smasher's own generic 16-hit description, for the right shape) rather than inventing a new field.

Both entries' `name` explicitly names the required echo — this app already
relies on a skill/buff's own label to carry a manual-judgment condition
(see Phoebe's S2 fix earlier this session), so this is consistent, not a
new pattern.

### UI — manual toggle (per explicit user direction, no auto-detection off `mainSlotGearId`)
The Calculator's SKILLS list already shows every skill's computed damage
unconditionally — these two entries would just appear there like any
other skill, which is wrong when the player doesn't actually have Adam
Smasher in their Main Slot. Add a small checkbox/switch specifically on
this skill's row (only rendered for skills of `type: 'echo'`, so it costs
nothing for every other character/skill): unchecked by default, hides the
row entirely from damage totals when off, includes it normally when on.
Persisted the same way other per-character Calculator toggles already are
(`calcStore` — check the existing pattern for a comparable opt-in, e.g.
`skillTreeInvested` or a conditional-buff toggle set, and match it rather
than inventing new persisted state shape).

## Testing
- `tests/shared/`: a focused test asserting Lucy's/Rebecca's new skill
  computes the expected raw multiplier × ATK when toggled on, absent from
  totals when off — mirrors existing skill-damage tests' shape.
- Live verification: Calculator screen, Lucy active, toggle the new skill
  row on/off, confirm the SKILLS list shows/hides it and the number
  matches `273.60% × ATK` by hand-checking one example.

## Files touched
- `adapters/game-definitions/wuthering-waves/characters.ts` (or the real
  skills-source file — confirm at implementation time) — 2 new `SkillDef`s
- `src/renderer/src/screens/CalculatorScreen.tsx` — the new toggle UI + persisted state
- `src/renderer/src/stores/calcStore.ts` — new toggle state, following the nearest existing precedent
- `tests/shared/` — new focused test
