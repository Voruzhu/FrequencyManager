# Changelog

All notable changes to **FrequencyManager** are documented in this file. The
format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to [Semantic Versioning](https://semver.org/).

---

## [1.0.0] - 2026-07-17

### Fixed
- **Full roster-wide re-audit (2026-07-16)** — 7 parallel research passes
  cross-checked every WW character's kit/sequences, every weapon's
  passive/stats, and every Sonata Set/echo-catalog table against 2+
  independent sources. Highlights (not exhaustive — see commit history for
  the full per-character list):
  - **Taoqi** was scaling her Skill/Liberation/Forte off ATK instead of DEF —
    she's the game's only DEF-scaling damage dealer; with her real stat
    spread this under-computed her 3 main damage sources by roughly 7x.
  - **Jiyan**'s Resonance Liberation had a copy-paste duplicate of his Lance
    of Qingloong Stage 1 multipliers, double-counting damage if a rotation
    used both moves (the real Liberation cast deals no damage itself).
  - Several characters had a move mistagged to the wrong attack-type
    category, silently breaking any buff scoped to the correct one:
    Changli's/Camellya's Forte moves, Xiangli Yao's Pivot-Impale (Basic→Skill)
    and Revamp (Skill→Ultimate), Lingyang's Feral Gyrate/Stormy Kicks/Tail
    Strike (Basic→Forte), Galbrena's Seraphic Execution Stage 4 (missing
    Echo Skill scope), Encore's Cosmos Rave moves (missing Ultimate scope so
    her own Inherent I never reached them).
  - Several sequence/passive bonuses were flat, uncapped values where the
    real effect scales off Energy Regen — Mornye's S2 and her previously-
    unmodeled base-kit ult self-buff, Sigrika's and Suisui's Inherent Skills
    — all now wired through `scaleOff` with the real ratio/offset/cap.
  - A handful of `conditional:false` (auto-applied) buffs were actually
    trigger-gated and should have been toggleable: Wildfire Mark's weapon
    passive, Rebecca's S5, both Rover variants' Dark-Surge/Apex-Resonance
    Crit buffs.
  - Several real moves were missing from the data entirely: Lingyang's Feral
    Gyrate Stage 1 and Basic Attack Stage 5, Yuanwu's Thunderweaver, Zani's
    Outro damage instance, Lupa's enhanced "Nowhere to Run!" Intro, Phrolova's
    Scarlet Coda, and Luuk Herssen's entire Outro Skill (his own Sequence 5
    already expected an outro-tagged move to exist). Levels 2-10 for these
    were derived from a same-character sibling move's confirmed curve shape
    where no per-level source existed beyond the base value.
  - ~10 weapons (mostly 5★ signature weapons — Blazing Brilliance/Justice,
    Emerald Sentence, Lethean Elegy, Lux & Umbra, Starfield Calibrator, The
    Last Dance, Tragicomedy, Rime-Draped Sprouts, Spectrum Blaster,
    Stringmaster) were missing a real secondary/stacking buff component
    their passive text describes, plus a handful of smaller text-typo and
    scope fixes (Guardian Broadblade, Spectral Trigger).
  - 5 Sonata Set bonuses had the wrong stat entirely or a missing component
    (Void Thunder, Rejuvenating Glow, Frosty Resolve, Eternal Radiance,
    Flaming Clawprint), and 2 echoes (Dreamless, Feilian Beringal) were
    wrongly listed as multi-set-ambiguous when they're actually fixed to one
    set each.
  - Fixed a real templating artifact (`{Cus:Sap,...}` raw placeholder syntax)
    left in 5 weapon and 14 sequence passive-description strings.
  - Where a real bonus targets specific NAMED moves that share an
    attack-type category with other moves it shouldn't affect (e.g.
    Cantarella's S1/S2/S6, Zani's S5/S6, Buling's S1), it's documented as a
    genuine schema limitation rather than force-fit into an over-broad
    `appliesTo` scope that would buff the wrong moves too.
  - **Cartethyia/Augusta/Iuno** (the last group from this sweep to report):
    two Cartethyia Fleurdelys moves wrongly tagged Spectro instead of Aero;
    her Heavy Attack/Enhanced Heavy Attack/Upward Cut missing "considered
    Basic Attack DMG" scope; her Forte Circuit entry (really Fleurdelys Basic
    Attack Stage 1) and Upward Cut both wrongly ATK- instead of HP-scaled;
    her Fleurdelys-form Dodge Counter was missing entirely; her Inherent II
    DMG-amp was coded at an unreachable 60% (real base-kit ceiling is 30%,
    60% needs Sequence 2); her S3 Liberation-DMG buff was unmodeled. Augusta
    had 4 moves (Sublime is the Sun ×2, Undying Sunlight: Leap/Plunge)
    wrongly tagged Fusion instead of her actual Electro element, the Sublime
    moves also missing "considered Heavy Attack DMG" scope; her Dodge
    Counter - Strike move and base-kit Crown of Wills passive (+15% Electro
    DMG) were missing entirely; her S3 Liberation-scoped DMG buff and S4 team
    ATK buff were unmodeled. Iuno's entire Moonbow/Enhanced-Moonbow/Arc Beyond
    the Edge move family was missing "considered Resonance Liberation DMG"
    scope; her base-kit team-wide "Blessing of the Wan Light" DMG amplifier
    (4%/stack, up to 10 stacks) had no entry anywhere, separate from the
    Sequence 2 bonus that stacks on top of it. New moves' missing level
    curves derived from a same-character sibling's confirmed growth shape,
    per this sweep's established convention.
- **The Enemy "Target has: Frazzle/Erosion/..." row now actually gates buffs**,
  instead of being a passive reference only. New `BuffEntry.requiresTargetStatus`
  field (distinct from `appliesTo`, which scopes by the ATTACKER's move type —
  this scopes by the TARGET's current status instead; a buff can need both, e.g.
  Phoebe's S2 needs an Outro hit AND a Frazzled target). Wired through
  `resolveParty`/`enabledPartyBuffs` into both the Calculator and Rotation
  Builder. Retrofitted onto the 3 real buffs that needed it: Cartethyia's Outro
  (any Negative Status), Hiyuki's Outro (Glacio Chafe specifically), and
  Phoebe's Sequence 2 (Spectro Frazzle) — previously all three were either
  always-on regardless of target state, or (Phoebe) left as pure unstated
  manual judgment. Backward compatible: a buff with no `requiresTargetStatus`
  is completely unaffected, and a caller with no `targetStatuses` (e.g. GI)
  defaults every status to "assumed active," same as the row's own default.
- **Real per-echo item icons** (178 of 190 catalogued echoes) — gear now
  shows the specific echo's own art as its main icon with the Sonata Set
  badge overlaid in the corner, instead of just the Set icon alone.
  Sourced from game8.co (encore.moe's echo API was tried first but reused
  identical icons for several genuinely different echoes, e.g. Hecate and
  Tempest Mephis — confirmed via a zero-duplicate-URL check before
  switching sources). 12 "Illusive" echoes named after playable characters
  (Jinhsi, Phoebe, Roccia, etc.) have no confirmed distinct art anywhere
  and still fall back to the Set icon only, same as before.

### Fixed
- **Phoebe's Sequence 2 team buff wasn't modeled at all** — it amplifies
  Outro-Skill DMG against a Spectro-Frazzled target by 120% (same value in
  both Absolution and Confession stances, so no stance-toggle is needed for
  the number itself). Added as a toggleable Team effect scoped to `outro`;
  the Frazzle-target half of the condition is left as the user's own call
  (same manual-toggle model as the Enemy "Target has: Frazzle" row), since
  `appliesTo` can't express the exact AND of both conditions at once.
- **Gear icon showed its Set icon twice** (once as the main icon, once as
  the corner badge) — every gear entry had `icon` wrongly pre-filled with
  its Set's own icon at creation time (no per-item icon art exists in this
  app at all yet), which made the badge condition ("show a badge only when
  a distinct item icon is known") always true with the same image on both.
  Stopped setting it; a migration also clears it from already-owned gear.
  The set icon now renders once, as the main icon, with no badge — until
  real per-echo art is added later, at which point this field is ready to
  hold it.
- **Character/weapon rarity border colors didn't match the standard gacha
  quality scheme** — 4★ now Epic purple, 3★ blue, 2★ green (was: 4★ a
  generic blue-ish "primary", 3★ green, 2★ no color at all). 5★ (gold) and
  1★ (plain border) unchanged.
- **Add Character / Add Weapon lists weren't sorted by rarity** — some 5★
  weapons appeared below lower-rarity ones. Both now sort highest-rarity
  first by default (alphabetical within the same rarity), matching the
  Rotation Builder's character picker, which already did this.
- **OCR-scanned echo name was often wrong or blank** — the set-filter chip
  crop region (added 2026-07-13) puts its own text directly before the real
  echo name in the raw OCR blob (e.g. "Void Thunder Y Phantom: Thundering
  Mephis +25"), and the old `^`-anchored name regex greedily grabbed
  whatever Title-Case run started at position 0 — usually the SET name (or
  set name + a garbled icon glyph that happened to fake-match a Title-Case
  word), not the actual echo name. Fixed by requiring the captured name to
  sit immediately before the "+&lt;level&gt;" that always follows a real echo
  name, and tightening the word pattern to need 2+ lowercase letters (real
  names are always 3+ letters; short icon-glyph misreads like "Ag"/"hg"
  aren't). Confirmed against 7 real screenshots the user provided.
- **OCR-scanned set name missed when the set-filter chip's space was
  dropped** (e.g. "RejuvenatingGlow" for "Rejuvenating Glow") — the known
  set-name list was matched as a literal substring, space and all, so a
  merged reading silently failed to resolve at all (worse for an
  ambiguous-set echo like Bell-Borne Geochelone, where that chip text is
  the ONLY signal that can pick the right one of several possible sets).
  Each known name is now matched with its internal spaces loosened to
  optional whitespace, still returning the canonical spelling.

### Added
- **OCR Scanner's "Browse…" now multi-selects images** and processes them
  one at a time (sequential OCR, not parallel) — each finished scan lands
  in history as it completes, with a single summary toast at the end
  instead of one per image.
- **Install game packages straight from a GitHub repo**, no separate
  manifest.json needed — paste "owner/name", fetch the `.zip` assets on its
  latest release, install with one click. Shown on first launch (replaces the
  old "drop a JSON file in game-modules and restart" instructions) and in
  Settings → Updates. A brand-new game installs live, no restart; updating an
  already-installed one downloads immediately but needs a restart to take
  effect (the in-memory game registry can't hot-replace an existing entry).
  Reuses the existing "App GitHub repo" field, since the app and its game
  packages are published from the same repo/release in practice. Also added
  a working "Update" button to the older manifest-based game-updates table,
  which previously only showed a static "Update available" badge with no way
  to act on it.
- **Team/kit effects (incl. Outro buffs) now toggle inline in the Calculator**,
  same on/off model as weapon/character/gear passives, instead of only being
  reachable through the separate Party Setup window. Also fixed a real gap
  found along the way: the Calculator's live stat summary wasn't factoring
  team buffs in at all (only self-buffs), so it undercounted whenever a
  teammate or the character's own kit provided one.
- **Enemy target-status reference row** ("Target has: Frazzle / Erosion /
  Chafe / Flare / Bane / Fusion Burst") next to the Enemy picker (WW only) —
  a shared toggle to track which reaction debuffs you're assuming are up,
  for deciding whether to also flip the matching conditional-buff chip
  elsewhere. Not auto-wired to any buff yet — a reference, not a gate.
- **Full roster-wide re-check of the Forte-Circuit-vs-buff-scope divergence bug**
  found on Rover (Spectro) — the same 6 characters flagged as unverified risk
  (Jinhsi, Jiyan, Zani, Lupa, Yuanwu, Lumi) all turned out to have the exact
  same issue: every one of their 30 Skill/Basic/Ultimate→Forte retyped moves
  had its own real buff-scope silently broken. All 30 fixed via the `scope`
  override field.
- **5 characters' kit moves that deal their own "Echo Skill DMG" now correctly
  scoped** (Sigrika, Qiuyuan, Galbrena, Phrolova via `scope: 'echo'`) — these
  are real character-kit abilities the game reclassifies to Echo Skill DMG,
  not the generic per-equipped-echo mechanic (still out of scope). Lucilla's
  equivalent case is genuinely mode-conditional (Glacio Chafe vs. Echo
  Resonance Mode) and needs a stance-toggle primitive this engine doesn't
  have yet — documented, not guessed.
- **Named echoes can now carry their own "Echo Skill" self-buff**, separate
  from their Sonata Set bonus (`GearEntry.selfBuffs`, mirroring
  `WeaponEntry.selfBuffs`) — surfaced as toggleable "Echo passives" chips in
  the Calculator, same as weapon passives. Seeded with 2 confirmed examples
  (Lady of the Sea, Jué); research estimated ~25-33 of the ~167 cataloged
  echoes have this mechanic, but only these 2 had a confirmed exact
  percentage — the rest need a dedicated sourcing pass before being added.
- **Reaction/Negative-Status DMG scopes** (`appliesTo: ['frazzle'|'erosion'|'chafe'|'flare'|'bane'|'fusionburst']`)
  — unblocks Phoebe's and Ciaccona's Outro Skill DMG amps (Spectro Frazzle
  / Aero Erosion specifically), previously deferred for the same
  "no matching scope" reason as Echo Skill DMG below.
- **`scaleOff` can now scale off `critRate`/`critDmg`**, not just
  ATK/EM/ER/HP/DEF — unblocks Roccia's team flat-ATK buff ("+1 ATK per
  0.1% of her own Crit Rate over 50%, up to 200"), previously undeployable.
- **A second pass re-verified every skill-type fix the full-roster sweep
  (below) had left as "suspected but unconfirmed"** — fresh encore.moe reads
  confirmed real bugs on Shorekeeper (`transmutation`: Skill→Basic), Iuno
  (3 Heavy-named moves that are actually Forte-Circuit-housed and Liberation-
  scoped for buffs), Augusta (`undying-leap`/`undying-plunge`: Forte→Skill/
  Heavy), and Lingyang (`stormy-kicks`: Forte→Basic) — while Yinlin, Encore,
  and Calcharo's existing typings turned out to already be correct. Also
  found and fixed a subtler regression: 3 of Rover (Spectro)'s Forte-Circuit
  combo hits (retyped Skill/Basic→Forte in the original sweep, correctly,
  for Talents-window grouping) had silently lost their real buff-scope
  matching in the process, since that fix predated the `scope` override
  field below — restored via `scope`.
- **"Echo Skill DMG" is now a real buff scope** (`appliesTo: ['echo']`,
  `shared/calc/optimizer.ts`'s `canonScope()` + a new `echoSkillDmg` set-bonus
  key) — unblocks ~10 previously-documented-but-unmodeled buffs (Qiuyuan's
  and Lucilla's Outros, Sigrika's whole kit, Qiuyuan's own Sequence 2, and
  the "Dream of the Lost" Sonata set). Echo Skill's own damage still isn't
  computed anywhere (it depends on the specific equipped Echo, out of scope
  for this pass), so these buffs are correctly modeled but currently inert —
  shovel-ready for whenever that gets built.
- **Stack-scaled self-buffs** — a new `stacksMax` field on self/party buffs
  (alongside the existing skill-level `stackMax`) lets a buff's value scale
  with a user-configurable in-combat stack count instead of only storing a
  flat per-stack rate. Adds a stack stepper next to the Calculator's
  conditional-buff toggle chips (mirroring the skill-stack stepper),
  defaults to max stacks (same "assume best-case" convention used
  everywhere else), and the Rotation Builder gets it for free (assumes max
  stacks automatically when no override is given). Applied to Galbrena's
  Afterflame→Crit DMG, Cartethyia's Conviction→Crit DMG, and Augusta's Crown
  of Wills→Crit DMG/Crit Rate — all three were previously capturing only the
  flat per-stack rate, understating the real buff by up to 40x.
- **Searchable dropdown for the Optimizer's target picker** (Calculator →
  Optimization → Targets) — the Skill list has grown to 15-20+ entries on
  some characters after this project's multi-instance-skill audits; typing
  now filters it instead of scrolling a long dropdown.
- **Highest-rarity-first default sort** on every character/weapon
  search/browse list (Character Picker, Weapon Picker, Inventory's
  Character/Weapon tabs, the weapon inspector's "inspect another" search) —
  previously unsorted (roster-definition order).
- **Echo cards show the echo's own icon, with the Set icon as a small
  corner badge** — instead of showing the Set's icon as the echo's entire
  image. Falls back to the old set-icon-only look when a piece has no
  specific-echo icon of its own (most world-mob echoes).
- **"Calculate current loadout" button** (Calculator → Optimization, next to
  "Optimize loadouts") — scores only the gear currently equipped on the
  character, using the same targets/buffs/enemy settings, instead of
  searching the whole gear pool. Shows what your actual current build does
  without waiting for or overwriting an optimizer search.
- **Full Wuthering Waves roster audited for multi-instance skill damage and
  stack scaling** (all 55 characters, cross-checked against encore.moe).
  Many characters had named damage components (e.g. a Resonance Skill or
  Forte Circuit with several distinctly-named hits, like Lucy's Liberation)
  collapsed into a single generic entry — ~70 new skill entries added
  across ~33 characters so each named hit can be individually selected/
  computed. Also added Zani's missing "Blaze" stack scaling on Heavy Slash
  - Nightfall (stackMax 40), and Baizhi's entirely-missing Resonance
  Liberation entry. Fixed a pre-existing data bug: Taoqi's 3 Forte entries
  were mistagged `element: 'Glacio'` (copy-paste leftover) despite her
  being a Havoc character.
- **Extended the roster audit to Normal Attack combos and Intro/Outro
  Skills** — every character's Basic Attack Stage 2+, Heavy Attack,
  Mid-air Attack, Dodge Counter, and Intro Skill damage (previously only
  Stage 1 was modeled for most characters, and Intro/Outro Skill damage
  was entirely unmodeled roster-wide) — ~400 new entries added across all
  55 characters. Fixed a real data bug found along the way: Cartethyia's
  entire Normal Attack kit (9 entries) was mistagged `scaling: 'atk'`
  instead of `'hp'` — encore.moe's raw data confirms every one of her
  Normal Attack hits actually scales off Max HP, making her the first
  HP-scaling character modeled in this file.
- **"Only unequipped" optimizer toggle** (Calculator → Optimization) —
  excludes gear currently equipped on any OTHER character from the
  candidate pool before searching. Gear already equipped on the character
  being optimized stays eligible (it's already theirs; re-selecting it
  isn't taking it from anyone else's build). Useful for finding a build
  from your "spare bench" without the optimizer recommending a piece
  you'd have to pull off someone else's loadout first.
- **Missing team/self buffs added for 20 Wuthering Waves characters**,
  found via a full-roster Outro/Intro Skill + Sequence audit cross-checked
  against encore.moe: Shorekeeper (2 unwired Sequence buffs — L2 team
  ATK+40%, L4 self Healing Bonus+70% — plus her entirely-missing Outro
  Skill DMG amp), and Outro Skill team-buffs for Danjin, Baizhi, Iuno,
  Buling, Lumi, Lupa, Phrolova, Cartethyia, Augusta, Suisui, Rover
  (Electro), Lynae, Mornye, Lucy, Rebecca, Brant, Zani, Aemeath, Denia,
  Hiyuki, and Jianxin — all had zero representation in the buff system
  despite having real, sourced Outro effects. Also corrected Mortefi's and
  Taoqi's Outro DMG-amp values from an approximate "~38%" to a confirmed
  exact 38%. A few real buffs (Youhu's Coordinated-Attack DMG amp,
  Qiuyuan's/Lucilla's Echo Skill DMG amp, Phoebe's Frazzle-scoped amp,
  Ciaccona's Erosion-scoped amp) are documented but deliberately not added
  yet — they need a damage-engine scope category this app doesn't have.

### Fixed
- **Full Wuthering Waves roster re-audited for data accuracy** (all 55
  characters, 7 parallel passes cross-checked against encore.moe's raw
  `Skills[]`/`ResonantChain[]` data) — found and fixed real bugs across
  three categories:
  - **Skill `type` mislabeling** — ~50 skill entries across 20 characters
    (Zani, Lupa, Yuanwu, Lumi, Jinhsi, Rover (Spectro), Phrolova, Mornye,
    Luuk Herssen, Zhezhi, Carlotta, Cantarella, Lingyang, Galbrena, Changli,
    Jiyan, Calcharo, Xiangli Yao, and others) were typed as the wrong Talents
    family (e.g. a character's entire Forte Circuit kit typed `'Heavy'`/
    `'Skill'` instead of `'Forte'`), which silently emptied that
    character's Forte Circuit row in the Talents window — the same bug
    class first spotted in Zani. Also found a genuine schema conflict for
    a handful of characters (Chisa, Qiuyuan, Buling, Taoqi, Carlotta) whose
    Forte-Circuit-exclusive signature move is reclassified by the game to a
    *different* DMG family for buff-scoping purposes while still leveling
    under Forte Circuit — fixed by adding a new optional `scope` field
    (`SkillDef`/`CharacterSkill`) that overrides `type` for buff-scope
    matching only, leaving Talents-window grouping untouched.
  - **Missing/mis-scoped sequence (Sequence-node) buffs** — ~35 fixes
    across `sequences.generated.ts`: entirely missing `buffs`/`selfBuffs`
    entries for real, sourced sequence effects (Baizhi, Yangyang, Chixia,
    Danjin, Mortefi, Taoqi, Xiangli Yao, Zhezhi, Carlotta, Lingyang, Zani,
    Iuno, Lynae, Luuk Herssen, Hiyuki, Jianxin, Lucilla), party-wide effects
    that were wrongly coded as self-only (Xiangli Yao, Yuanwu, Phrolova,
    Mornye, Luuk Herssen, Lucy, Rebecca, Sigrika, Suisui), missing
    `appliesTo` scoping that let a buff over-apply to all damage instead of
    one skill family (Chisa, Aemeath, Jianxin), and two outright fabricated/
    wrong entries removed (Roccia's Seq 6 modeled a DEF-ignore mechanic as a
    self DEF% buff — wrong stat entirely; Lucy's Seq 5 invented a 150% ATK
    buff for what's actually just a shield; Brant's Seq 4 had an unrelated
    +1% Energy Regen entry that matched neither of the effect's real clauses).
  - **Missing kit buffs** — added Shorekeeper's second Energy-Regen-scaled
    tier (Crit DMG, alongside the already-modeled Crit Rate one), Rebecca's
    and Rover (Electro)'s second Inherent/Forte-Circuit team buffs, Lucilla's
    Glacio-Chafe-mode Outro variant, Zhezhi's missed Forte-Circuit self
    buff, and Sigrika's entire kit (previously had zero buff entries at
    all) — the Aero-DMG half of her Blessing-of-Runes mechanic, both a
    team tier and a self max-stack tier; the Echo-Skill-DMG half of the
    same mechanic isn't modeled, same documented engine gap as Youhu/
    Qiuyuan/Lucilla above. Roccia's team flat-ATK buff (scales off her own
    Crit Rate) is also documented but not added — `scaleOff` doesn't support
    a `critRate` source stat yet.
- **A scanned echo's name was silently discarded whenever it wasn't one of
  the curated `WW_ECHO_CATALOG` entries** — the Add/Edit Echo window's
  "Echo" identity field was a strict dropdown bound to that catalog, so an
  OCR-read name the catalog doesn't happen to list (most world-mob/fodder
  echoes, or anything added to the game after the catalog was last updated)
  showed up as a blank field even though OCR had read real text. The field
  is now a free-text combobox — catalog names still show as quick-pick
  suggestions, but any typed or scanned name is kept as-is.
- **The OCR scanner's boot-race fallback set-name list was missing 18
  newer Sonata sets** (including "Sound of True Name"), out of sync with
  the real list since they were added — only mattered for a scan that
  raced the very first moment after launch, before the game module
  finished loading, but is now synced.
- **Editing a gear item from the Inspector panel didn't refresh the
  displayed stats.** The Inspector rendered from a snapshot object captured
  at selection time; saving an edit updated the inventory store correctly,
  but the panel kept showing the stale snapshot until you reselected the
  item. Now re-resolves the displayed item live by id from the owned
  inventory on every render.
- **A scan whose echo name OCR couldn't read at all could still silently
  auto-import.** When the backend's name-pattern regex fails to match
  anything, it substitutes a placeholder (`"Unknown Echo"`) — but nothing
  downstream ever checked for that placeholder specifically, so a scan
  with a completely unreadable name (but otherwise-resolvable set/stats)
  had zero blocking issues: `buildGearEntryFromDraft` falls back to
  showing the SET name when the real echo name doesn't resolve, so it
  still "successfully" built a valid-looking entry with no trustworthy
  name behind it, and "Auto import from latest" would wave it straight
  into inventory. Now flagged as a blocking ('major') issue with its own
  explicit message — distinct from the common, expected, non-blocking case
  of a real echo name the catalog just doesn't have a fixed set/identity
  for (most fodder echoes).
- **Echo scan crop region widened slightly to the left** (0.785 → 0.77 of
  screen width, right edge still anchored at the screen edge) — the
  previous narrowing (done to exclude decorative bullet icons ahead of
  each stat label) had gone slightly too far and was clipping real label
  characters on some stat rows.
- **Root cause of the recurring "capture display picks the wrong monitor"
  reports, found by a user**: a monitor set to 10 bpc output color depth (or
  HDR) is silently EXCLUDED from `desktopCapturer`'s screen list entirely —
  Chromium's screen-duplication path can't duplicate a 10-bit surface, and
  Windows/Chromium drop that monitor rather than erroring. No amount of
  `display_id`/positional matching can find a source that was never
  returned — every previous fix in this area was correctly matching among
  the AVAILABLE sources, but the actually-selected monitor wasn't among them
  at all. Now detected directly (fewer capture sources than connected
  displays) and surfaced as a specific, actionable error explaining the
  likely cause and the fix (set that monitor to 8 bpc / disable HDR in the
  GPU control panel) instead of silently capturing whichever other monitor
  was available.

### Added
- **Persistent log file** (`%APPDATA%\frequency-manager\logs\main.log`) —
  every log call anywhere in the app (kernel, modules, main process) now
  also writes to a real file via `electron-log`, not just `console.*` (which
  goes nowhere retrievable for a packaged app launched normally). New
  **Settings → About → "Open logs folder"** button for finding/sharing it
  when troubleshooting.
- Verbose diagnostic logging for OCR display-capture resolution — every
  capture now logs the requested display, every currently connected
  display, and every candidate capture source with its `display_id`/name,
  so "picking a monitor does nothing"-type reports are diagnosable from the
  log file alone instead of requiring back-and-forth guessing.
- **OCR scan capture now targets the currently active game's own window**
  instead of whatever window has OS focus (or the whole primary screen) when
  the scan hotkey fires. Each `GameDefinition.ocr` can declare an optional
  `windowTitleHint` (a case-insensitive substring matched against OS window
  titles, e.g. `"Wuthering Waves"`); when the active game declares one,
  capture searches for that window specifically via `desktopCapturer` and
  fails with a clear "window not found" message rather than silently
  scanning the wrong thing if the game isn't running. Falls back to the
  previous full-primary-screen capture for games with no hint declared
  (community modules aren't required to set one).
- **"Capture display" override (Settings → Scanner)** for multi-monitor
  setups where automatic window-title matching can't find the game — some
  games aren't reliably enumerable as a capturable "window" while running
  exclusive-fullscreen, which no amount of title-matching can work around.
  Picking a specific monitor here makes capture always use that screen
  directly, taking priority over window-title matching entirely — it's
  meant as "I know better than auto-detection," not just a fallback for
  when detection fails. Defaults to "Auto"; only matters once you have more
  than one monitor.

### Changed
- **Windows uninstaller now deletes app data** (`%APPDATA%\frequency-manager\`
  — settings, inventory, installed game packages) when the app is genuinely
  uninstalled — but NEVER when an update runs (electron-builder's NSIS
  template already distinguishes an update-triggered reinstall from a real
  uninstall internally; this just opts into that existing behavior via
  `deleteAppDataOnUninstall`, no custom scripting needed).

### Fixed
- **Capture-display selection had no effect for some users** — the
  `captureDisplayScreenshot` display-to-source match relied solely on
  `display_id`, a field that can come back empty on some Windows/GPU driver
  combinations; when that happened, the code silently fell back to
  whichever screen source came first, regardless of what was actually
  selected. Added a positional-match fallback (using the target display's
  index in `screen.getAllDisplays()`) plus logging whenever a fallback path
  is taken, so this is diagnosable if it recurs.
- **The display override above initially only applied as a fallback AFTER
  a window-title search**, not before — so if any window (even an unrelated
  one, e.g. a browser tab or Discord with the game's name in its title)
  happened to match the hint text, it silently won over the monitor the
  user explicitly selected. Reported as "OCR scan selects another screen
  even though I selected another." Fixed by making the override
  authoritative: when set, window-title matching is skipped entirely.
- **A real, separate bug from the one below**: `fm-icon://` protocol
  resolution had a duplicate-path-segment bug — `getExternalIconsDir()`
  already returns the game's `icons/` folder itself, but the handler was
  joining it with a request path that ALSO started with `icons/`, producing
  a nonexistent `.../icons/icons/...` path on every lookup. This affected
  every game, every icon, 100% of the time in the actual PACKAGED app (a
  now-dead "built-in bundle path" fallback branch masked it in dev mode by
  accident, which is why it wasn't caught earlier — the real project source
  tree sitting next to `dist/` in dev happened to satisfy that branch, so
  the buggy external-path code was never actually exercised until testing
  against the real installed app). That dead branch is now removed entirely
  (there's nothing for it to fall back to — the app has zero games compiled
  in) and the duplicate segment is stripped before joining.
- **Game package zips had no wrapping folder** — `module.json`/`icons/` sat
  directly at the zip root, so extracting a package straight into
  `game-modules/` (as the README instructs, and as Explorer's "Extract
  All..." does by default when you pick that destination) dropped them as
  orphaned top-level files instead of a `game-modules/<gameId>/` subfolder.
  The game itself still loaded fine (as a stand-alone loose JSON module),
  but its `icons/` folder was never associated with it — every icon silently
  fell back to the placeholder. `scripts/build-game-package.js` now zips a
  single `<gameId>/` folder so any extraction method produces the correct
  packaged-folder shape automatically. If you installed a game package
  before this fix and icons aren't showing, redownload and reinstall it.

### Removed
- **"Unseen Feather"** Genshin Impact artifact set — not a real set in the
  live game; couldn't be found in genshin-db, gi.yatta.moe's full reliquary
  list, or a general search, so it was almost certainly a bad/fabricated
  catalog entry from earlier data-authoring. Removed from `SET_BONUSES`,
  `uiOptions.setNames`, `ocr.setNames`, and `GI_GEAR_CATALOG.sets` (37 → 36
  real artifact sets, all with sourced icons now — see the 2026-07-13
  milestone note below).

---

**Milestone — 2026-07-13**

### Changed
- **BREAKING: the app now ships with zero games compiled in.** Wuthering
  Waves and Genshin Impact are no longer bundled with the installer — they're
  official downloadable game packages (`.zip`, published on the Releases
  page), installed into `%APPDATA%\frequency-manager\game-modules\` the exact
  same way any community-authored game is. Existing installs updating from
  1.0.0 will see a "No game installed yet" screen on first launch after the
  update until a package is downloaded and installed. See the README's
  "Installing a game" section.
- `adapters/game-definitions/index.ts`'s registry is now populated entirely
  via `initExternalGameModules()` — no more separate built-in-vs-external
  code paths. `scripts/build-game-package.js` (`npm run package:games`)
  builds the two official packages from the same in-repo TypeScript source
  (`adapters/game-definitions/<game>/bundle.ts`) any contributor can extend.

### Added
- Real character/weapon icon art for both games (Wuthering Waves: 55/55
  characters, 120/120 weapons; Genshin Impact: 121/121 characters, 235/235
  weapons), plus set icons for Wuthering Waves' 34 Sonata sets and Genshin
  Impact's artifact sets (36/37 — one set, "Unseen Feather," has no sourced
  icon and may be a stale/incorrect catalog entry).
- Gear icons now resolve retroactively for already-owned echoes/artifacts
  saved before this feature existed (by set name, no data migration needed).

### Fixed
- Character portraits and gear icons were silently never rendering in the
  Calculator and Inspector panels — several `<ItemIcon>` call sites never
  passed the icon `src` prop at all, always showing the placeholder.

### Added
- **Damage Calculator & Optimizer** — full build-stats engine (character +
  gear + buffs + weapon), per-skill damage with crit modes and elemental
  reactions (GI), and a multi-threaded Web Worker optimizer with a live
  progress bar and a configurable thread count (Settings → Calculator).
- **Set Bonus system** — a picker that narrows the optimizer to 1–2 chosen
  Sonata/Artifact sets, correctly splitting 2pc-vs-full-set tiers, with
  live warnings for off-element mismatches and character-exclusive collab
  sets (e.g. WuWa's 1pc-only "Shadow of Shattered Dreams," Rebecca/Lucy
  only). The optimizer now also enforces WuWa's real total echo-cost
  budget (5 echoes costing 1/3/4 each, summing to at most 12) — it no
  longer recommends loadouts that would be impossible to equip in-game.
- **Rotation Builder** — build, run, and save named damage rotations against
  real party data, with per-step talent-level/stack overrides.
- **OCR Scanner** — hotkey screenshot capture → parse → confirm-and-add flow
  for echoes, plus an on-demand "Auto import from latest" batch action.
- **Inventory & gear system** — full echo/artifact add/edit/equip/unequip,
  equipped-first sorting in the gear picker, ascending/descending stat
  sort in the filter bar, already-equipped-elsewhere warnings, and a
  strict Cost → Set → Name echo picker backed by a 167-entry catalog.
- **Party Setup** — teammates always reflect their OWN equipped
  loadout/build (never a separately hand-picked one), with per-character
  buff toggles and constellation/sequence-level team buffs.
- **Data content** — the full 5★+4★ Genshin Impact roster and the full
  Wuthering Waves resonator roster: skills, constellations/sequences,
  weapon passives, and self-buff passives, cross-checked against two
  independent community sources per game.
- **Game-scoped data export/import**, with per-game safety checks and a
  confirm-gated cleanup action in Settings → Data.
- `.env.example` documenting the app's environment variables (all optional
  — nothing in the app currently requires secrets).

### Fixed
- A `Math.max(...)`/`Math.min(...)` spread-argument crash in the optimizer
  on large gear pools, rewritten to loop-based min/max.
- Several correctness bugs found during data audits and live testing:
  mislabeled elemental/weapon buffs, duplicate-identity echoes
  double-counting toward set-piece thresholds, off-element set bonuses
  silently applying to mismatched characters, and an unreachable 1pc
  collab set bonus.

### Changed
- Repo cleanup: removed stray files that had accumulated during
  development (`nul`, a truncated duplicate weapons file, an unreferenced
  scratch data dump).

### Removed
- Google Stitch integration. The underlying shared-state/module-action
  binding layer it used is a general-purpose internal mechanism and stays
  (see `docs/VARIABLE_MAP.md` / `docs/SHARED_STATE.md`) — only the
  Stitch-specific docs, framing, and dead file links (`docs/stitch-variables.json`,
  `docs/STITCH_VARIABLE_MAP.md`, both already renamed to `docs/variables.json` /
  `docs/VARIABLE_MAP.md`) were removed.

### Added (previous — Dynamic Game-Driven UI Contract)
- **Dynamic Game-Driven UI Contract** — Game definitions now control sidebar categories and inventory tabs:
  - `GameDefinition.uiOptions` extended with `categories`, `hiddenCategories`, `inventoryTabs`
  - `docs/GAME_UI_CONTRACT.md` — Full contract documentation
  - `useGameUI()` hook (`src/renderer/src/hooks/useGameUI.ts`) — reactive UI derivation from active game
  - `App.tsx` updated to consume dynamic categories from hook
  - Wuthering Waves: `inventoryTabs` = Characters/Weapons/Echoes
  - Genshin Impact: `inventoryTabs` = Characters/Weapons/Artifacts
  - Categories update immediately on game switch (no reload)
- **Design System Documentation** — AI-readable design system for Stitch and coding agents:
  - `docs/DESIGN.md` — brand, color palette, typography, spacing, component registry, full component specs, tokens
  - `docs/STITCH_VARIABLE_MAP.md` — human-readable variable map for Google Stitch
  - `docs/stitch-variables.json` — machine-readable variable/action/validation map Stitch can import directly
  - `ARCHITECTURE_UI_ELEMENTS.md` — Stitch Binding Layer (Section 11) with variable naming convention, wiring diagrams, action wiring, and character-path template
- **Dynamic Game Options** — backend-driven UI option lists so one Stitch UI works for every game:
  - `GameDefinition.uiOptions` added to `shared/types/game-definition.ts`
  - `game:get-options` RPC added to `modules/game-loader/src/index.ts`
  - `wutheringWaves.uiOptions` populated in `adapters/game-definitions/wuthering-waves.ts`
  - `genshinImpact.uiOptions` populated in `adapters/game-definitions/genshin-impact.ts`
  - `window.frequencyManager.getGameOptions()` exposed in `src/preload/preload.ts`
  - `ARCHITECTURE_UI_ELEMENTS.md` Section 12 documents the pattern
- **Shared State & Stat Validation System** — A new cross-module data layer:
  - `SharedStateStore` with path-based `get`/`set`/`merge`/`reset`/`subscribe`
  - `StatRules` types in `game-definition.ts` (character + equipment)
  - `wutheringWavesStatRules` with realistic WuWa cap values
  - `FieldSpec.statePath` + `FieldSpec.gameRule` for declarative state binding
  - `FieldInput` auto-binds to shared state when `source: 'state'`
  - `GameRuleRef` union type for validation rule references
  - Auto-clamping of numeric writes via `gameRule`
  - Diff-based merge with `MergeDiff` for conflict resolution UI
  - 15 new unit tests (`tests/renderer/shared-state.test.ts`)
- **`ARCHITECTURE_UI_ELEMENTS.md`** — Comprehensive documentation of all UI elements the architecture provides
- **`docs/SHARED_STATE.md`** — Full documentation of the shared state system, ownership rules, and migration guide
- **`docs/GAME_UI_CONTRACT.md`** — Full documentation of the dynamic game-driven UI contract

### Changed
- **`ContentArea.tsx`** — Removed hardcoded `DamageCalculatorPanel` from `CUSTOM_PANELS` map (now uses generic `ModulePanelWrapper` for all modules)
- **`moduleStore.ts`** — Added `shared` state slice with `SharedStateStore` API
- **`types/index.ts`** — Added `GameRuleRef` type and extended `FieldSpec` with `statePath` + `gameRule`
- **`wuthering-waves.ts`** — Added `wutheringWavesStatRules` export with full cap data

### Added (🔶 July 2026 - Triple-Column Liquid Glass UI)
- **Triple-Column Layout** — App.tsx now renders a persistent three-column layout:
  - **Left**: Category sidebar (game-driven categories via `useGameUI()`)
  - **Center**: Content area (maps active category to panel via `ContentArea.tsx`)
  - **Right**: Persistent settings sidebar (`SettingsSidebar`, always visible)
  - **Top/Bottom**: `TitleBar` (frameless) + `StatusBar` (health metrics)
- **Liquid Glass Design System** — All three columns use a frosted-glass aesthetic:
  - `glassBase` tokens: `bg-white/[0.02] backdrop-blur-2xl border border-white/[0.08]`
  - `glassHover`, `glassActive` for hover/selected states with accent-blue glow
  - `sectionHeader` for section header chrome
  - Background: `#0f0f0f`, accent: `#3b82f6`
- **`SettingsSidebar` as persistent layout element** — No longer an overlay modal. Always visible in the right column with:
  - Appearance (theme selector)
  - Developer (dev-mode toggle)
  - Modules (enable/disable per module)
  - Updates (auto-check + manual)
  - About (version & tech stack)
- **`ContentArea.tsx`** — Updated with `CATEGORY_PANELS` slot registry mapping `activeCategory` to panel components:
  - `calculator` → `DamageCalculatorPanel`
  - `scanner` → `OcrScannerPanel`
  - `inventory` → `InventoryPanel` (uses `inventoryTabs`)
  - `rotation` → `RotationBuilderPanel`
  - Legacy `activeModuleId` path still supported via `ModulePanelWrapper`
- **`useGameUI()` hook** — Dual fallback: `setNames[0].includes('Rift')` auto-detects WU vs GI for default inventory tabs

### Fixed
- **TypeScript compilation errors** in newly created/modified UI files:
  - `App.tsx` — removed unused `useState` import
  - `ContentArea.tsx` — removed unused `ModuleInfo` import and unused `inventoryTabs`/`gameOptions` from `useGameUI()` destructuring
  - `Sidebar.tsx` — removed unused `useModuleStore` import
  - `SettingsSidebar.tsx` — removed unused `ModuleInfo` import and unused `SettingsSidebarProps` type
  - `tsconfig.json` — removed `vite.config.ts` from `include` to resolve TS6305
- `Architecture` — `/docs/GAME_UI_CONTRACT.md` table row for `rotation` category had malformed backticks

### Previous Additions (kept for context)
- **`GameDefinition` contract** (`shared/types/game-definition.ts`) — typed
  abstraction for everything game-specific: equipment shape, character
  schema, combat actions, OCR regexes, set bonuses.
- **`adapters/game-definitions/`** — a pluggable registry of game packages.
  Wuthering Waves (`wuthering-waves.ts`) and Genshin Impact
  (`genshin-impact.ts`) ship in-tree; new games are a single file plus a
  one-line registry entry.
- **`modules/game-loader/`** — resolves `config.game.activeGame` at boot and
  injects the matching `GameDefinition` into the kernel config under
  `game.definition`. Provides RPCs `game:list-installed` and
  `game:get-active`.
- **`modules/json-importer/`** — generic JSON export/import with a
  versioned envelope (`schemaVersion`, `exportedAt`, `exportedBy`, `game`,
  `payload`). Works for any game. Provides RPCs `json:export`,
  `json:import-string`, `json:export-to-file`, `json:import-from-file`.
  Cross-game imports are detected and surfaced as warnings, not rejections.
- **`docs/DOCKER.md`**-style multi-stage `Dockerfile` (builder, production,
  development, test) and `docker-compose.yml` (dashboard, dev, test).
- `npm run typecheck:src` and `npm run typecheck:test` scripts for
  granular type-checking.

### Changed
- `config/default.json` gains a top-level `game` block
  (`activeGame`, `fallbackGame`) and per-game install feature flags.
- `tsconfig.json` paths updated to include `@adapters/*`.
- `package.json` gains `prebuild` (runs tests) and granular typecheck
  scripts.

### Deprecated
- Hardcoded WU vocabulary in `modules/ocr-scanner/src/index.ts`. Will be
  refactored to consume `kernel.config.get('game.definition').ocr` in a
  follow-up release.
- Hardcoded WU combat + set-bonus tables in
  `modules/damage-calculator/src/index.ts`. Same plan.

### Added
- **Auto-update system** — two independent update channels:
  - **App updates** via `electron-updater` (already a dependency; now
    wired in `src/main/electron-main.ts` with `setupAutoUpdater()`).
    Publishes `app:update-*` events on the EventBus, sends `app:update-*`
    IPC to the renderer, and shows a native Notification on transitions.
  - **Game-definition updates** via new module `modules/update-checker/`.
    Fetches a remote JSON manifest on boot (and every
    `updates.checkIntervalHours`), compares each entry's version against
    the locally installed `GameDefinition`, and publishes
    `update-checker:game-update-available` or `update-checker:game-incompatible`.
- **`minAppVersion` field** on `GameDefinition` — optional, backwards
  compatible. Missing means "any app version".
- **`updates` config block** in `config/default.json`:
  `appCheckOnBoot`, `gameModuleCheckOnBoot`, `gameDefinitionsManifestUrl`,
  `notifyOnUpdate`, `allowPrerelease`, `checkIntervalHours`,
  `requestTimeoutMs`.
- **`publish` block** in `package.json` `build` — points electron-builder
  at the `frequency-manager/frequency-manager` GitHub repo for releases.
- **Preload bridge update methods** — `onAppUpdateChecking`,
  `onAppUpdateAvailable`, `onAppUpdateUpToDate`, `onAppUpdateProgress`,
  `onAppUpdateDownloaded`, `installAppUpdate`, `onGameUpdateAvailable`,
  `onGameUpdateIncompatible`, `checkGameUpdatesNow`.

### Fixed
- 13 TypeScript errors across `core/`, `modules/`, and `src/` — codebase
  now type-checks cleanly under `tsc --noEmit`.
- Typecheck pipeline now covers `tests/**` via `tsconfig.test.json`.

---

**Milestone — 2026-06-29**

### Added
- Initial release of the FrequencyManager kernel and module scaffolding.
- `core/` subsystems: `event-bus`, `kernel`, `module-registry`,
  `module-sandbox`, `config`, `feature-flags`, `health-monitor`.
- Two reference modules: `ocr-scanner` and `damage-calculator` (both still
  WU-hardcoded at this point).
- Electron main + preload + renderer entry points.
- Strict TypeScript configuration with path aliases for `@core`, `@modules`,
  `@shared`, `@adapters`, `@config`, `@scripts`.
- ESLint and Prettier configuration.
- Docker-based development container.

---

## Versioning

- **MAJOR** — breaking changes to `core/*` public API, to
  `module.manifest.json` schema, or to `GameDefinition` shape.
- **MINOR** — backwards-compatible feature additions.
- **PATCH** — backwards-compatible bug fixes.

Module versions are independent of the kernel version. A module at `1.x.y`
is compatible with any kernel at `1.a.b` for the same major.

`GameDefinition` packages (under `adapters/game-definitions/`) are versioned
independently and tracked by the `version` field embedded in the envelope
when exporting via `json-importer`.

---

## Migration Guides

### Migrating from 1.0 → 2.0

- **The app no longer ships with any game data built in.** After updating,
  existing users will see a "No game installed yet" screen until they
  download and install a game package — see the README's "Installing a
  game" section. This is a one-time step per machine; your existing
  characters/gear/loadouts for each game are untouched once the matching
  package is reinstalled (owned data is keyed by game id, which didn't
  change — `wuthering-waves`/`genshin-impact`).
- `adapters/game-definitions/index.ts` no longer exports `GAME_DEFINITIONS`/
  `GAME_BUNDLES`/`SUPPORTED_GAMES` — use `getGameDefinition`/`getGameBundle`/
  `hasGameDefinition`/`listInstalledGames` instead (unchanged signatures,
  just no longer backed by a compiled-in map).
- OCR and damage-calculator modules were already made game-agnostic before
  this release — no action needed there. If you have custom code that
  hardcoded WU set names, read from
  `kernel.config.get('game.definition').sets` instead.

### Migrating from 0.x → 1.0

- The event-bus API changed: handlers now receive a full `EventMessage<T>`
  envelope, not just the payload. Update module code from
  `(payload) => ...` to `(msg) => ...` and access `msg.payload`.
- `module.manifest.json` now requires `permissions` (previously optional).
- The kernel's `getStatus()` was renamed to `getState()`.
### Added (��� July 8 2026 - shadcn/ui Foundation)
- **shadcn/ui component primitives** — Scaffoled 13 accessible React components based on Radix UI, ready for use across the renderer:
  - `Button` (`button.tsx`) — 6 variants (default, secondary, destructive, outline, ghost, link), 4 sizes, polymorphic via `asChild`
  - `Input` (`input.tsx`) — themed text input with focus ring
  - `Label` (`label.tsx`) — accessible form label (Radix Label)
  - `Switch` (`switch.tsx`) — accessible toggle switch (Radix Switch)
  - `Separator` (`separator.tsx`) — horizontal/vertical divider (Radix Separator)
  - `Tooltip` + `TooltipProvider` + `TooltipTrigger` + `TooltipContent` (`tooltip.tsx`) — theme-aware hover tooltip (Radix Tooltip)
  - `Skeleton` (`skeleton.tsx`) — loading placeholder with pulse animation
  - `Badge` (`badge.tsx`) — 5 variants (default, secondary, destructive, outline, success)
  - `ScrollArea` + `ScrollBar` (`scroll-area.tsx`) — custom-styled scrollable region (Radix ScrollArea)
  - `Tabs` + `TabsList` + `TabsTrigger` + `TabsContent` (`tabs.tsx`) — animated tab navigation (Radix Tabs)
  - `Collapsible` + `CollapsibleTrigger` + `CollapsibleContent` (`collapsible.tsx`) — expand/collapse regions (Radix Collapsible)
  - `Card` + `CardHeader` + `CardTitle` + `CardDescription` + `CardContent` + `CardFooter` (`card.tsx`) — glass-styled card container
  - Barrel `index.ts` for clean single-path imports: `import { Button, Switch, Tabs } from '@/components/ui'`
- **`cn()` utility** (`src/renderer/src/lib/utils.ts`) — Tailwind-aware class merger combining `clsx` (conditional) + `tailwind-merge` (dedupe)
- **Extended `index.css` design tokens**:
  - Added `--bg-alt`, `--fg-muted`, `--accent-hover`, `--radius`
  - Added shadcn-compatible RGB-channel tokens (`--background`, `--foreground`, `--card`, `--primary`, `--secondary`, `--destructive`, `--ring`, etc.) for future HSL-based theme switching
  - Added `glass-base`, `glass-hover`, `glass-active`, `glass-section-header` composition classes in `@layer components`
  - Kept legacy `.glass` alias for backwards compatibility
- **Extended `tailwind.config.js`**:
  - New color tokens: `bg-alt`, `fg-muted`, `accent-hover`
  - `borderRadius` mapped to `--radius` CSS variable (lg/md/sm)
  - `accordion-down` / `accordion-up` keyframes + animation utilities for Radix Collapsible/Accordion
  - `tailwindcss-animate` plugin added for Radix data-state enter/exit animations
- **Dependencies installed**:
  - `lucide-react` — icon library (tree-shakeable, used by shadcn)
  - `clsx`, `tailwind-merge`, `class-variance-authority` — class management trinity
  - `@radix-ui/react-*` — 13 Radix primitives (slot, tooltip, switch, select, tabs, scroll-area, separator, label, collapsible, dropdown-menu, dialog, avatar)
  - `tailwindcss-animate` — Radix animation utilities (devDependency)

### Usage Example
```tsx
import { Button, Switch, Label, Tooltip, TooltipContent, TooltipTrigger, TooltipProvider, Tabs, TabsList, TabsTrigger, TabsContent, ScrollArea, Separator, Badge, Skeleton, Card, CardHeader, CardTitle, CardContent, Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui';

// All components use the existing Liquid Glass theme tokens (bg, fg, accent, muted, error, ok)
// and support className composition via cn():
<Button variant="secondary" className="ml-2">Cancel</Button>
<Switch defaultChecked />
<Badge variant="success">Enabled</Badge>
<Tabs defaultValue="summary">
  <TabsList>
    <TabsTrigger value="summary">Summary</TabsTrigger>
  </TabsList>
  <TabsContent value="summary">...</TabsContent>
</Tabs>
```

> Next step (Phase 3): Migrate existing layout components (`TitleBar`, `Sidebar`, `SettingsSidebar`, `ContentArea`, `FieldInput`, `ModulePanelWrapper`, `ModuleOutputViewer`, `DevPanel`) to consume these primitives internally.
