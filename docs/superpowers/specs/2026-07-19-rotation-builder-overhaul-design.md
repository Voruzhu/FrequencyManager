# Rotation Builder Overhaul

## Context

The Rotation Builder (`RotationScreen.tsx`) already lets you sequence
per-character skill "steps" and see real computed damage. But it's gated on
the Calculator's currently-selected active character (`!activeChar` → empty
state) and reuses that character's ad-hoc teammate list (`partyStore.ts`) —
there's no reusable, named party you can build once and reuse across
rotations. Skill "duration" is a manually-typed number with no real timing
data behind it. Team buffs already auto-apply every step; self-buffs are a
flat per-rotation manual toggle. Enemies are a single static def/res target
with no HP, no multi-wave concept, and no boss-vs-adds distinction.

This spec covers four subsystems, requested and approved together as one
project (explicitly not split into separate specs):

1. A new, named, reusable party system — independent of the Calculator's
   existing per-character teammate setup, which stays untouched.
2. Real per-skill Cooldown data (sourced) alongside the existing manual
   duration field, plus a non-blocking reuse-too-early warning.
3. A temporal buff/debuff auto-uptime engine for the common "N seconds
   after casting skill X" trigger pattern, layered on top of (not
   replacing) today's manual self-buff toggles for buffs that don't fit
   that pattern.
4. Enemy HP pools with a Waves mode (per-wave subtotals, overkill discarded
   at each wave boundary, per-step granularity) and a Boss mode (single
   target, HP optional).

Two of these were explicitly re-confirmed as "build the real, expensive
version" after the cost was surfaced (per-skill real cast-TIME data was
investigated and found to have no viable source at all — see Section 2 —
so that one alone stayed scoped down; Cooldown, the buff engine, and HP/
waves all went with the full option).

## Section 1: Named Party System

**Scope:** Rotation Builder only. The Calculator's existing per-active-
character teammate system (`partyStore.ts`, `Teammate`, buff-toggle UI) is
untouched — this is a new, independent concept, not a replacement.

**New store** `src/renderer/src/stores/namedPartyStore.ts`:
```ts
export interface NamedParty {
    id: string;
    name: string;
    memberCharacterIds: string[]; // up to 3; can be saved with fewer
}
interface NamedPartyState {
    byGame: Record<string, Record<string, NamedParty>>; // byGame[gameId][partyId]
    save: (gameId: string, party: NamedParty) => void;
    remove: (gameId: string, partyId: string) => void;
    list: (gameId: string) => NamedParty[];
}
```
Same shape convention as `rotationStore.ts`. No loadout/gear/weapon stored
on the party — a member always resolves from their OWN current loadout and
Sequence level, exactly like today's `Teammate` (see `lib/party.ts`'s
`resolveParty`/`PartyMemberResolved`, reused as-is for named-party members).
Cap of 3 enforced on add (WW team size); 1 or 2 members can still be saved.

**UI:** `RotationScreen` gets a "Party" button opening a popup window
(`PartyPickerWindow`, follows the existing `useWindowStore.openWindow`
pattern used throughout this app) listing saved named parties for the
active game (name, member avatars/count) plus a "Create Party" button.
Create opens a second window (`CreatePartyWindow`): name input + a
full-roster character picker capped at 3. Selecting a party from the list
sets it as the active party for the CURRENT in-progress rotation (not
persisted until the rotation itself is saved).

**Architecture change:** `RotationScreen` no longer gates on the
Calculator's active character. `SavedRotation.anchorCharacterId` (today
already just informational — steps carry their own `characterId`) is
replaced with `partyId: string | undefined`. A rotation saved before this
change (no `partyId`) still loads fine — it just has no party restriction
on its turn-picker until the user explicitly assigns one, matching this
project's established "old data still loads, just without the new field's
behavior" migration convention (e.g. `calcStore`'s existing migrations).

**Turn/character picker restriction:** once a party is selected, adding a
rotation step only offers that party's (up to 3) members — no full-roster
search override. If no party is selected yet, the picker falls back to
today's full-roster behavior (nothing to restrict to).

## Section 2: Skill Timing — Manual Duration + Real Cooldown

**Investigated and rejected:** real per-skill cast/animation-time. Checked
this project's primary data source (`api.encore.moe`) directly — a skill
object has no cast-time or animation-length field at all (confirmed via a
live fetch: `SkillId/SkillType/SkillName/SkillDescribe/SkillMedia/Icon/
SkillAttributes/SkillDetailNum/Consumes/DamageList`, nothing timing-related
except `Cooldown`, a different stat). No structured source exists across
the roster; the only alternatives (manually watching `SkillMedia` clip
lengths, or trusting inconsistent community frame-data wikis that only
cover a handful of popular characters) would mean either fabricating a
number dressed up as sourced data, or wildly inconsistent roster coverage.
**Decision: duration stays exactly as it is today** — a manual per-step
number input, no new data claimed.

**Real, sourceable, and in scope: Cooldown.** `api.encore.moe`'s
`SkillAttributes` array has a genuine `Cooldown` entry (confirmed present,
e.g. Jinhsi's Resonance Skill: `values: ["3", "3"]` — flat, not a 10-level
scaling table like damage multipliers; per-skill verification during the
sourcing pass will confirm whether any skill's cooldown does vary and
capture that if so, otherwise treat as a single flat number).

- New optional field on the skill definition type (`shared/types/
  game-bundle.ts`'s skill shape): `cooldown?: number` (seconds). Skills
  with no real cooldown (most Basic Attacks) leave it `undefined`.
- Sourcing pass: WW roster only, populate `cooldown` in `adapters/
  game-definitions/wuthering-waves/skills.ts` from encore.moe's
  `Cooldown` attribute, per character, same rigor as this session's
  earlier full-roster audits (cross-check against a second source when a
  value looks surprising).
- Step card UI: shows a "CD Ns" badge next to the skill name when
  `cooldown` is present.
- Rotation engine: tracks, per (characterId, skillId) pair, the elapsed
  time (sum of prior step durations) at each use. If a step reuses a
  skill before `cooldown` seconds have elapsed since its last use in this
  rotation, show a non-blocking warning badge on that step ("⚠ CD not
  up — Ns left") — informational only, matches this app's universal
  warn-don't-block convention (same as "needs review" elsewhere). Doesn't
  prevent adding or running the step.

## Section 3: Buff/Debuff Auto-Apply

**What stays true today, unchanged:** team-wide buffs already apply to
every step automatically (no toggle needed) — that doesn't change.
Self-buffs are currently a flat manual per-rotation toggle (set once,
applies to every step for that character) — that mechanism is NOT removed,
only supplemented for the subset of buffs described below.

**New optional field**, added wherever a `conditional: true` buff entry
exists today (character passives, Sequence overrides, weapon self-buffs,
gear self-buffs):
```ts
autoTrigger?: { skillIds: string[]; durationSeconds: number }
```

**Explicit scope of the sourcing pass** (stated for sign-off, not
assumed): only buffs matching the clean "N seconds after casting skill X"
pattern get this field populated. A large share of existing conditional
buffs already spell this out in plain-English label text today (e.g.
"ATK +18%, 27s after Res. Skill" — seen throughout this project's existing
data), so this is a real, bounded, sourceable data-entry pass over
already-known information, not new research. Explicitly OUT of scope for
`autoTrigger` (these keep today's manual toggle, permanently, not as a
placeholder):
- Stance/state-gated buffs ("while in X state") — no stance-tracking state
  machine exists or is being built here.
- Stack-accumulating buffs ("+N% per cast, up to M stacks") — no stack
  simulation exists or is being built here.
- Non-time conditions (HP threshold, resource/energy threshold) — this app
  has no HP or resource simulation (Section 4 adds enemy HP, not character
  HP/resources), so these can never be automated from rotation timing
  alone.

A buff without `autoTrigger` behaves EXACTLY as today (manual toggle chip).
A buff with it moves to an "Auto" badge (non-interactive, shows when it's
computed as active) instead of a clickable toggle.

**Engine:** each rotation step already has a derivable cumulative elapsed
time (running sum of prior steps' `duration`). For step *i* (character
*C*, elapsed time `t_i`): a self-buff belonging to *C* with `autoTrigger`
is active on step *i* if there exists an earlier step *j* (`j < i`) where
`step_j.characterId === C`, `step_j.skillId ∈ autoTrigger.skillIds`, and
`t_i − t_j ≤ autoTrigger.durationSeconds`. Team-wide auto-trigger buffs
(e.g. an Outro-skill team DMG amp) use the same window/lookup but are NOT
restricted to `step_j.characterId === C` — any party member's step within
the window benefits, matching how team buffs already reach every member.

Per-step damage computation (`computeStepDamage` today) gains the
resolved set of currently-active auto-triggered buffs as an additional
buff source, alongside team buffs and the still-manual toggled self-buffs.

## Section 4: Enemy HP, Waves, and Boss Mode

**New rotation-scoped config** (not added to the shared `EnemyEntry`
catalog type — this is specific to a rotation's simulation, not a general
damage-calculator concept):
```ts
interface WaveConfig {
    enemyId: string; // from getEnemies(gameId) — same catalog/picker the Calculator already uses
    hp?: number;      // undefined = no overflow tracking for this wave (see Boss mode)
}
```
`SavedRotation` gains `mode: 'boss' | 'waves'` and `waves: WaveConfig[]`.

**Boss mode:** `waves` has exactly one entry. `hp` is optional — if
omitted, the rotation behaves exactly like today's plain single-target
damage calculation (no HP tracking, nothing to discard, just a number).

**Waves mode:** `waves` has 2+ entries, each naming its own enemy (waves
can be different enemy types/tankiness). HP is optional per wave, same as
Boss mode — a wave with no HP set never triggers an overflow/transition
from ITS side (damage just applies with nothing to discard), which is a
valid, if unusual, way to configure a wave. The UI reuses the existing
enemy-picker dropdown pattern (`getEnemies(gameId)`) per wave, plus an
optional HP number input.

**Engine — stated simplification, not fudged:** the damage engine
(`skillDamage()`) computes one aggregate number per skill cast today, not
a breakdown of individual hits within a multi-hit combo. Overflow
detection therefore happens at STEP granularity, not sub-hit granularity —
"the instance that doesn't carry over" is the whole skill-cast step, not
its 5th individual hit specifically. This is a real, disclosed ceiling
(documented in code as such), not a silent approximation.

Simulation: maintain `currentWaveIndex` and `currentWaveRemainingHp`
(initialized to `waves[0].hp`). For each step in order: compute its damage
as today; if `waves[currentWaveIndex].hp` is defined, subtract the step's
damage from `currentWaveRemainingHp`. If that would go below 0:
- The overflow (amount below 0) is discarded, not applied to the next wave.
- `currentWaveIndex` advances; `currentWaveRemainingHp` resets to the next
  wave's `hp` (if a next wave exists and has an `hp` value).
- If no next wave exists, remaining steps just deal full damage with no
  further tracking (nothing left to discard against).

**Results UI additions:** a per-wave subtotal breakdown (Wave 1: X dmg,
Wave 2: Y dmg, ...) alongside the existing total/DPS/per-character/
per-step breakdowns, plus a visible "damage discarded to overkill" total
so the simplification's effect is transparent, not hidden.

## Out of scope (explicitly, not deferred silently)

- Real per-skill cast/animation-time data (Section 2) — no viable source
  exists; revisit only if a new data source appears.
- Stance/stack/HP-threshold-triggered buff automation (Section 3) — stays
  manual indefinitely, not a "phase 2."
- Sub-hit-granularity overflow detection (Section 4) — per-step is the
  permanent granularity for this feature, not a placeholder for finer
  tracking later.
- Genshin Impact equivalents of any of this — this spec is WW-only
  throughout (party size 3, WW skill data, WW roster sourcing passes).
  A GI pass would be a separate future spec following the same pattern.
- Character HP/shield/survivability simulation — still explicitly out of
  scope per this project's existing ROADMAP.md stance; Section 4 adds
  ENEMY HP only, never the player's.

## Testing

- `namedPartyStore.ts`: unit tests for save/remove/list, 3-member cap,
  under-3 saves allowed (mirrors `partyStore.ts`'s own existing test
  coverage pattern, if any — otherwise a fresh small suite).
- Cooldown-reuse-warning logic: pure function, unit-testable in isolation
  (given a step list + skill cooldowns, returns which steps are flagged).
- `autoTrigger` window-resolution logic: pure function, unit-testable —
  given steps + buff definitions + elapsed times, returns the active set
  per step. Cases: trigger then within-window step (active), trigger then
  past-window step (inactive), team-wide trigger reaching a different
  character's step, no trigger cast yet (inactive).
- Wave/overflow simulation: pure function, unit-testable — cases: damage
  under remaining HP (no transition), damage exceeds remaining HP
  (overflow discarded, wave advances), final wave exhausted (no further
  tracking, full damage continues).
- No dedicated `RotationScreen` component test exists today (this
  project's convention: UI wiring verified manually via CDP, not
  component tests) — same approach here for the screen-level wiring
  (party popup, wave config UI, badges).
