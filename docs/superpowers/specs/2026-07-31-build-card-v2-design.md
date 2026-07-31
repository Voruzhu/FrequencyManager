# Build Card v2 — Design Spec

> **SUPERSEDED (2026-07-31, same day, post-ship):** the "fetch live, never
> bundle" decision below was reversed after shipping — the wiki's own "Card"
> file per character turned out to be small enough (~330KB avg, 59MB total
> for all 177) that bundling was practical after all, and a live third-party
> fetch was a real reliability/security concern the user raised (an
> uncontrolled external dependency, tamperable if the source were ever
> compromised). All 177 characters' art is now downloaded once and committed
> under `icons/characters-card/`, served through the exact same mechanism
> every other icon already uses — see the icons/README.md in each game's
> folder and `scripts/download-character-wiki-art.cjs`. The sourcing/
> verification work below (which wiki file, confirmed against each
> character's own page) still stands and fed directly into the download.

## Context

The just-shipped build-card PNG export (Calculator's "Build card" button, `src/renderer/src/lib/buildCard.ts` + `BuildCardWindow.tsx`) draws a minimal canvas card: character name/element/weapon, hero skill damage, an 8-stat grid, and a weapon/set footer line. Two mockup directions were shown as an artifact before building; the shipped version deliberately used the app's single existing accent color (no per-element palette exists anywhere else in the app) and no character art (only small 256×256 icons exist in the data, no portrait/splash assets).

The user wants a substantially richer card: a real character reference image, full loadout display (weapon + gear with icons), Sequence/Constellation level, per-gear stat breakdown, kit-aware color grading of stats, and both an accent-color picker and a custom-image override.

## Research findings (already verified live, not assumptions)

**Character art sourcing** — the biggest open question. Confirmed via real API calls during this session:

- **Genshin Impact**: `https://genshin-impact.fandom.com/api.php?action=query&titles=File:{Name}%20Card.png&prop=imageinfo&iiprop=url` resolves to a real CDN URL (verified with Hu Tao). Convention: `File:{DisplayName} Card.png`.
- **Wuthering Waves**: same pattern on `wutheringwaves.fandom.com`, convention `File:{DisplayName} Splash Art.png` (verified with Jinhsi — resolved to a real 2048×2048 image).
- **CORS**: both wikis' CDN host (`static.wikia.nocookie.net`) sends `access-control-allow-origin: *` on these image responses (verified via `curl -I` against both hosts) — canvas `drawImage`+`toBlob` will NOT taint, so the PNG export path stays intact.
- **Coverage caveat**: the `{DisplayName}` in the wiki's file title is usually the character's plain display name, but not guaranteed to match 100% of this project's 297 character entries verbatim (naming edge cases: Travelers, alternate-element variants, punctuation). The implementation task includes a verification pass with a documented list of any per-character title overrides needed — not a blind assumption of 100% hit rate.
- **Rejected alternatives**: a GitHub UI-resource datamine repo (`TomyJan/WutheringWaves-UIResources`) has real per-character art but only for whichever characters are in the *current* gacha rotation (6 files found in the latest branch) — not a full-roster source. The official Kuro guide site is a JS SPA that a plain fetch can't inspect. Fandom is the only source confirmed to cover the full historical roster.

**Why fetch live, not bundle**: 297 characters × ~1-4MB each is roughly 1GB — bundling this into the repo/installer is the wrong call. Art is fetched from the wiki CDN at card-render time (same live-fetch pattern already used for endgame presets and the hotfix channel), cached long-term client-side (art never changes, unlike balance data), and falls back to the existing small icon on any failure — never blocks or breaks the export.

## Architecture

### New files

- **`shared/game-data/character-wiki-art.ts`** — `Record<characterId, { wiki: 'genshin-impact.fandom.com' | 'wutheringwaves.fandom.com'; fileTitle: string }>` for all 297 characters, generated from the existing `characters.ts` display names with the `{Name} Card.png` / `{Name} Splash Art.png` convention, plus a short list of manual overrides for names that don't match the convention directly (found during the verification pass in Task 1 of the implementation plan).
- **`src/renderer/src/lib/characterArt.ts`** — `fetchCharacterArtUrl(characterId): Promise<string | undefined>`. Calls the wiki's `imageinfo` API, caches the resolved CDN URL in `userStorage` (no expiry — art doesn't change; a manual "Data > Clear caches" style action, if ever needed, is out of scope here), returns `undefined` on any failure (network error, 404, malformed response) so the caller falls back to the small icon. Mirrors `fetchHotfixes`/`fetchEndgamePresets`'s never-throws shape.
- **`src/renderer/src/lib/statRelevance.ts`** — `statRelevance(character: CharacterData, statKey: string): 'low' | 'medium' | 'high'`, a pure function deriving relevance from data already in the bundle:
  - `high` if `statKey` is `elemDmg`/the character's own element-DMG stat and matches `character.element`.
  - `high` if `statKey` matches the character's own primary scaling stat, read from the MOST COMMON `scaling` value across `character.skills` (defaults to `atk` when skills don't specify, matching the engine's own default elsewhere).
  - `high` for `critRate`/`critDmg` UNLESS every one of the character's skills has a zero or near-zero multiplier (a proxy for "pure support/healer, no offensive kit" — checked: no dedicated "healer" flag exists anywhere in `SkillDef`, so this multiplier check is the real, available signal, not an assumed one).
  - `high` for `elementalMastery` ONLY if any of `character.selfBuffs`/`teamBuffs`/skills reference `scaleOff.sourceStat === 'elementalMastery'`.
  - `high` for `healingBonus` ONLY when that same "no offensive skills" signal is true (the one no-dedicated-flag proxy above, reused rather than inventing a second one) — i.e. a kit with no real damage skills is exactly the case where Healing Bonus becomes the relevant stat instead of Crit.
  - Everything else defaults to `medium`; stats that plainly can't apply to this character (e.g. an off-element DMG bonus) are `low`.
  - Documented as a heuristic in the file's own header comment — real, derived, non-fabricated data, but not perfect game-knowledge.
- **`src/renderer/src/stores/buildCardPrefsStore.ts`** — small persisted store: `customImageByCharacter: Record<gameId, Record<characterId, string /* data URL */>>` and `lastAccentColor?: string`. Follows the exact `byGame` keying convention every other per-character store in this app already uses.

### Modified files

- **`src/renderer/src/lib/buildCard.ts`** — `BuildCardData` gains: `imageUrl?: string` (character art or custom override, drawn as a cover-fit background behind the header), `sequenceLabel?: string` + `sequenceValue?: number` + `sequenceMax` (badge), `gearPieces: Array<{ iconUrl?: string; setName: string; mainStat: {label,value}; subStats: Array<{label,value}> }>` (replaces the current single weapon/set line), and `stats: Array<{ label, value, relevance: 'low'|'medium'|'high' }>` (relevance drives the fill color per row instead of one flat text color). `drawBuildCard` becomes `async` (loading character/gear images via `Image()` before drawing) — every existing caller awaits it.
- **`src/renderer/src/components/BuildCardWindow.tsx`** — assembles the richer `BuildCardData` (sequence from `useSequenceStore`, per-gear stats from the equipped `GearData[]`, relevance via `statRelevance`), adds a color `<input type="color">` for the accent (defaulting to `lastAccentColor` or the theme accent) and an "Upload image" file input wired to `buildCardPrefsStore`. Shows a loading state while images resolve (network fetch is no longer instant).

### Data flow for one export

1. Window opens → reads `buildCardPrefsStore` for a custom image; if none, calls `fetchCharacterArtUrl` (cached after first use).
2. Assembles `BuildCardData` from already-resolved build stats/skillDamage (Item 3's `computeForLoadout` — unchanged), equipped gear/weapon, `useSequenceStore`, and `statRelevance` per stat.
3. `drawBuildCard` loads the character image + each gear piece's icon (parallel `Promise.all`, each individually falls back to "no image" rather than blocking the whole card on one broken icon), then draws.
4. Download button unchanged (`canvas.toBlob` → `downloadBlob`).

## Testing

- `statRelevance.ts`: pure function, fully unit-testable — one test per rule (element match, scaling-stat match, crit-stat support-kit exception, EM/healing gating), using synthetic `CharacterEntry` fixtures (same pattern as `tests/renderer/party.test.ts`'s `makeChar` helper).
- `characterArt.ts`: mirrors `tests/renderer/hotfixes.test.ts`'s mocked-fetch pattern (success, 404, malformed response, cache hit).
- `buildCard.ts`'s new drawing logic: covered by a live CDP verification pass (same technique used for every UI feature this session) rather than pixel-diff unit tests, consistent with how the rest of this canvas-drawing module was verified.

## Explicitly out of scope for this pass

- Bundling/committing any character art into this repo (see "why fetch live" above).
- A generic multi-element accent *palette* system for the rest of the app (the user confirmed "accent color only" scope — this stays local to the build card).
- Automating the WW Fandom name-mapping with zero manual review — the verification pass in the plan will surface a short override list rather than assume perfection.
