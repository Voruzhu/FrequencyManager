# End-Game Mode Comparison (Rotation Builder)

## Context

The Rotation Builder (`RotationScreen.tsx`) already computes real DPS —
`totalDamage / totalDuration`, where `totalDuration` is the sum of the
user's own placed step durations — and already supports a `waves` mode
(`WaveConfig[]`: `{ enemyId, hp?, level?, def?, res? }` per wave, sequential
HP pools, `applyWaveTransition` in `lib/rotationEngine.ts`). WW's enemy
catalog already has 42 real, sourced bosses with per-element RES.

None of that is tied to any real end-game mode's actual rules. The piece
that's genuinely missing — the thing that makes Tower of Adversity floors,
Spiral Abyss halves, and Imaginarium Theater rounds *comparable to each
other and to your own rotation* — is a **fixed time budget**. Right now
"DPS" only ever means "however long your own steps summed to," never "did
this clear before the real clock ran out."

This spec covers:
1. A `timeLimitSeconds` field any rotation can carry (manually set, or
   filled in by a preset) — the results view compares your rotation's
   actual duration against it.
2. A small, per-game, auto-delivered library of curated real end-game-mode
   presets (enemy waves + time limit + a plain-text special-rule note),
   fetched at runtime so updating them never requires a new app release.

**Explicitly out of scope**, and why: auto-*discovering* the current Abyss/
Theater cycle from a live source (no public API for this is known to
exist — HoYoLAB's public API covers check-ins/codes, not cycle configs);
auto-*simulating* a floor's Ley Line Disorder / special rule as an applied
buff (arbitrary variety, low value vs. just showing the text and letting
the user toggle the closest existing manual buff, same as they already do
for every other conditional effect in this app).

## Section 1: Time budget on any rotation

**`SavedRotation`** (`rotationStore.ts`) gains one new optional field:
```ts
export interface SavedRotation {
    // ...existing fields unchanged...
    /** Real time budget to compare this rotation's actual duration against
     * (e.g. a floor's clear-time limit). Undefined = no comparison shown —
     * every rotation saved before this field existed keeps working exactly
     * as today. Independent of `mode`/`waves` — settable on a plain Boss-
     * mode rotation too, for "I know my target's time limit, just check me
     * against it" without needing a curated preset at all. */
    timeLimitSeconds?: number;
}
```

**UI**: a new optional numeric input next to the existing duration/DPS
display in `RotationScreen.tsx` ("Time limit (s): ___", blank = no
comparison). When set, the results view adds one line under the existing
total-duration/DPS readout:
- Under budget: `"42.3s / 90s — 47.7s to spare"` (neutral/positive style).
- Over budget: `"96.1s / 90s — 6.1s over, would not clear in time"` (warning
  style, reusing whatever badge/warning visual the existing "cooldown not
  up yet" step badges already use, for visual consistency).

No engine change needed — this is pure display math over numbers the
Rotation screen already has (`totalDuration` already computed).

## Section 2: Curated end-game-mode presets, auto-delivered

**New data files**, one per game, in the main repo (not game-module
packages — see delivery mechanism below for why):
```
shared/game-data/endgame-presets/wuthering-waves.json
shared/game-data/endgame-presets/genshin-impact.json
```
Shape:
```ts
interface EndgameModePreset {
    id: string;                // stable, e.g. "gi-abyss-f12h1-2026-07b"
    category: 'tower-of-adversity' | 'spiral-abyss' | 'imaginarium-theater' | 'trounce-domain';
    displayName: string;       // "Spiral Abyss — Floor 12, Half 1"
    cycleLabel?: string;       // "2026-07-16 to 2026-08-01" — rotating content only; absent for Trounce Domain (permanent)
    waves: WaveConfig[];       // reuses the EXACT existing type from lib/rotationEngine.ts, no new shape
    timeLimitSeconds?: number; // undefined for untimed content — confirmed Trounce Domains have no real in-combat clock, only a weekly reward-collection reset, unlike Abyss/Theater/ToA's real per-run timer
    specialRuleNote?: string;  // plain text, e.g. the Ley Line Disorder description — never auto-applied, see Context
    sourceNote?: string;       // attribution, e.g. "HoYoLAB patch notes, 2026-07-16"
}
interface EndgamePresetManifest {
    schemaVersion: string;
    generatedAt: string;       // ISO date the file was last edited — shown in the UI so stale-looking data is never silent
    presets: EndgameModePreset[];
}
```

**Delivery mechanism** — reuses the pattern this codebase already uses for
web-build icons (`lib/icons.ts`'s jsDelivr fetch), adapted for this specific
payload:
- Plain `fetch('https://raw.githubusercontent.com/Voruzhu/FrequencyManager/main/shared/game-data/endgame-presets/<gameId>.json')`
  (`<gameId>` is the one real variable — `wuthering-waves` or `genshin-impact`).
  `raw.githubusercontent.com` (not jsDelivr) deliberately — jsDelivr's CDN
  caching is worth it for many small icon requests, but actively wrong
  here: it can take up to a day to reflect a fresh commit, exactly the
  "stale until next release" problem this feature exists to solve. A
  single small JSON file has no need for CDN caching; always-fresh matters
  more.
  no auth needed (public repo), works identically on Electron and Web —
  no IPC, no main-process involvement, one code path.
- **New shared helper** `src/renderer/src/lib/endgamePresets.ts`:
  - `fetchEndgamePresets(gameId): Promise<EndgameModePreset[]>` — fetches,
    falls back to cache on any failure (network error, malformed JSON,
    schema-version mismatch), falls back further to a bundled static
    snapshot (checked into the repo, imported directly — same file
    content as what's committed to `shared/game-data/endgame-presets/`,
    guaranteed non-empty on first-ever load / total offline).
  - Cached via the existing `userStorage` (same abstraction every other
    store already persists through) with a fetch timestamp; reused as-is
    for 6 hours before attempting a refetch, so the app isn't hitting
    GitHub on every single boot.
  - Fetch triggered once per session, on first Rotation Builder screen
    visit (not on app boot generally — this data is only relevant there).
- **Why not the existing game-module/manifest-poll systems**: the
  GitHub-Releases zip installer is tied to app release tags (defeats the
  entire point — these presets need to update on their own cadence,
  independent of app versions) and requires a restart on update. The
  update-checker's manifest-poll mechanism is closer in shape but is
  currently dormant (unpublished placeholder manifest URL, empty in
  Settings by default) and app-update-focused. A dedicated small fetch,
  reusing the *pattern* proven by the icon loader rather than either
  existing *mechanism*, is the smallest, most direct fit.

**Rotation Builder UI**:
- New "Load end-game preset ▾" control, grouped by `category`, filtered to
  the active game (via `fetchEndgamePresets(activeGameId)`).
- Selecting one sets `mode`/`waves` (existing fields, unchanged shape) and
  the new `timeLimitSeconds` (Section 1).
- If `specialRuleNote` is present, shows as a dismissible info callout
  above the buff picker: *"This floor's Ley Line Disorder: {note} — toggle
  a matching buff manually if relevant."*
- `cycleLabel` / `sourceNote` / the manifest's `generatedAt` shown small
  near the preset name, so it's never ambiguous which cycle you compared
  against or how fresh the data is.
- Saving a rotation snapshots the preset's resolved `waves`/
  `timeLimitSeconds` values at save time (already true of every other
  Rotation Builder field) — reopening a saved rotation later shows exactly
  what you compared against then, even after live presets have rotated
  away from it. No new field needed for this — it falls out of Section 1's
  plain `timeLimitSeconds` plus the existing `waves`.

## Section 3: Initial preset data

Shipped presets at launch, sourced (not fabricated) before implementation
is considered done:
- **Trounce Domain** (GI): permanent, no `cycleLabel` needed — lowest
  maintenance, do these first. Reuses the same 42-boss-catalog sourcing
  discipline already established for WW's enemy list.
- **Tower of Adversity** (WW): current season's floor set + time limits.
- **Spiral Abyss** (GI): current cycle's Floor 9-12 configs + Ley Line
  Disorder notes + the fixed per-half time limit.
- **Imaginarium Theater** (GI): current month's enemy set + time limit +
  blessing note.

Rotating categories (Abyss/Theater/ToA-seasonal) will go stale between
sourcing passes — that's expected and handled by `cycleLabel`/`sourceNote`/
`generatedAt` making staleness visible, not silent, never by trying to
auto-detect it.

## Testing

- `endgamePresets.ts`: mock `fetch` — successful fetch, network failure
  (falls back to cache), malformed JSON (falls back to cache), no cache
  yet + fetch fails (falls back to bundled snapshot), cache within 6h
  (skips refetch), cache older than 6h (refetches).
- Time-budget comparison math (Section 1): under budget, over budget,
  exactly at budget, no `timeLimitSeconds` set (no comparison shown).
- Preset selection: choosing a preset correctly populates `mode`/`waves`/
  `timeLimitSeconds`; saving then reloading a rotation preserves the
  snapshotted values even with a stubbed-different live manifest.
