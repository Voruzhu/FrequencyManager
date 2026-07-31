# Roadmap

What's done, what's in progress, and what's next for FrequencyManager's game
data and features. For day-to-day release notes see the commit history; this
file tracks the bigger picture.

---

## 🎮 Character/roster data progress

Game data (skills, multiplier tables, kit buffs, weapons, sets) is
hand-curated and cross-checked against multiple community sources — not
scraped automatically — so accuracy is a per-game, ongoing effort.

### Wuthering Waves — 56/56 characters, ~95% accurate

Full roster present with real 10-level multiplier tables, kit/weapon/Sequence
buffs, and Sonata Set bonuses. Went through a full-roster re-audit
cross-checking every character's kit, every weapon, and every echo-set entry
against 2+ independent community sources (encore.moe where reachable,
wuthering.gg, wuthering.wiki, game8.co). That pass fixed real issues across
the board — wrong scaling stats, mistagged attack-type scopes, missing
buffs/moves, wrong Sonata Set values — and added engine support for
mechanics that had no home before (DEF-ignore/RES-shred, per-attack-type
scoped buffs, ER-scaling buffs).

Known remaining gaps: a small number of effects need engine primitives that
don't exist yet (shields, element-restricted enemy RES tracking beyond the
generic single value — see [Upcoming features](#-upcoming-features) below).
Yangyang: Xuanling (added 2026-07-17, the v3.5 Phase 1 banner character) is
missing her Forte Circuit and 2nd Inherent Skill specifically — both fell
back to generic combat-action defaults because their raw source data didn't
separate cleanly into named moves; everything else about her kit is real,
sourced data.

A 2026-07-19 full-roster accuracy pass (scaling stats, self-buff trigger
conditions, attack-scope collisions, set/Sequence buffs) fixed real bugs
across the board: wrong scaling stats on 3 characters (Yuanwu's Resonance
Skill/Liberation/Forte family is DEF-scaling not ATK; Mornye's ult is
DEF-scaling; Suisui's Vernal Screen has one HP-scaling sub-hit), several
self-buffs that auto-applied permanently despite having a real trigger/
duration window (or vice versa — a couple that should've auto-applied but
were gated as opt-in), a handful of buffs scoped to a shared attack-type
category that leaked onto sibling moves it was never meant to touch
(Ciaccona's Quadruple Downbeat DEF-ignore, notably), and one buff (Carlotta's
Sequence 4) authored with a stat key the calc engine always treats as
unscoped regardless of its `appliesTo`, silently inflating her whole team's
whole kit instead of just Resonance Skill DMG.

That same pass also found combo moves/follow-ups still missing real
multiplier-table entries — each needs the same multi-hit API-decoding work
already done for Yangyang: Xuanling above, deferred here rather than
fabricated:

- **Camellya** — Vining Waltz (follow-up combo)
- **Calcharo** — Hound's Roar, hits 2–5
- **Jiyan** — 4 follow-up hits
- **Xiangli Yao** — Unfathomed
- **Carlotta** — Outro Skill, and Necessary Measures Stage 1
- **Yuanwu** — Lightning-Infused Dodge Counter
- **Galbrena** — 2 missing skills
- **Lynae** — 1 missing skill
- **Iuno** — missing Outro Skill
- **Aemeath** — 8-move Mech combo
- **Lucilla** — 5-move Reminiscence combo
- **Lucy** — 3 missing Resonance Skill moves, plus a Sequence 2 damage proc
- **Jianxin** — Special Chi Counter
- **Rover (Havoc)** — missing Outro Skill
- **Phoebe** — missing Outro Skill
- **Sigrika** — missing Outro Skill
- **Suisui** — missing Intro Skill, and Drizzle Stance

A 2026-07-23 pass expanded the boss/target roster from 8 to 42 real bosses
(cross-checked against 2+ independent sources), standardized to a shared
level-90/950-DEF baseline since neither game publishes real per-boss DEF
(confirmed: GI's defense is purely level-based; WuWa has never documented
raw per-boss DEF either), differentiated instead by real per-element RES
overrides where documented. Also sourced real per-boss icons for 41/42 (the
one gap, a non-Nightmare "Adam Smasher," turned out to not exist as a real
fight at all — a fabricated duplicate removed in the same pass).

### Genshin Impact — 121/121 characters, full re-audit complete (2026-07-30)

Full roster went through the same systematic re-audit Wuthering Waves
already had — a 10-agent pass covering every character, cross-checked
against KQM library / genshin-center / Game8 / icy-veins (gi.yatta.moe and
the Fandom wiki were both blocked all session — 403/402). Every finding was
re-verified against `character-stats.generated.ts` and the two skill-
multiplier override files before being treated as a live bug, catching
several false positives other passes would have "fixed" into stale data.

Confirmed and fixed: all 5 Traveler variants' Skill/Burst tables (several
were ~2x wrong or copy-pasted from the wrong ability), Noelle's Normal Attack
(was unconditionally DEF-scaling Geo instead of only during Sweeping Time),
Gaming's Charmed Cloudstrider (was typed Skill instead of Plunge), Chiori's
missing Burst DEF-scaling term, Nilou's entire Pirouette-state kit (was
completely unmodeled), Yanfei's/Ganyu's missing Charged/Normal Attacks,
Cyno's Duststalker Bolt and Ororon's Hypersense (both entirely missing
skill instances), plus ~25 missing self/team passive-talent buffs across the
roster (Durin, Aino, Sethos, Kachina, Layla, Kirara, Kaveh, Varka, Gorou,
Shenhe, Xilonen, Zibai, Skirk, Lauma, Nicole, and others).

**Known gaps, not fixed this pass** (need a new engine primitive, not just
data entry — tracked here rather than guessed at):
- No damage channel exists for the newer "Lunar-Charged"/"Lunar-Crystallize"/
  "Lunar-Bloom" reaction family (Flins, Columbina, Ineffa, Zibai C2, Baizhu
  P2, Lauma's burst all have real mechanics riding on this). **Attempted
  2026-07-31, blocked on sourcing, not just unstarted**: one source
  describes Lunar-Charged as a 300%-of-original-hit direct multiplier,
  another gives an entirely different indirect-standalone-instance formula
  with an unexplained "Elevation Multiplier" term — even KQM library's own
  dedicated transformative-reactions page (the most reliable source used
  throughout this project) doesn't cover Lunar reactions at all yet. Too
  new/undocumented to implement without guessing; re-check once community
  theorycrafting catches up.
- **Assessed 2026-07-31 — not actually a gap, a different feature
  category.** No self-facing RES% stat primitive exists (only `resShred`,
  which debuffs the enemy) because this app has NO damage-taken/
  survivability calculation anywhere — it's a damage-DEALT calculator.
  `resByElement` on `EnemyEntry` is the ENEMY's own RES, never the
  player character's. A self-RES% stat would have zero consumers; adding
  one would be dead data, not a fix. Arlecchino's real P2 (defensive RES%)
  correctly stays unmodeled — same treatment as other non-damage passives
  (healing, movement speed) already get. Her previous entry was a
  fabricated Pyro DMG% buff, already removed.
- ~~No "live party-composition-count" buff scaling~~ **CORRECTED 2026-07-31
  — this was never actually blocked.** Party-composition-dependent buffs
  just need the SAME "assume the common/max case, mark conditional" pattern
  already used everywhere else in this file (Navia's "2 elemental
  teammates" 40% ATK is the exact same shape). Added Charlotte's P1 Cryo
  DMG branch (self-buff, max case) this pass.
- ~~`CHARACTER_TEAM_BUFFS` had no conditional/toggle mechanism~~ **FIXED
  2026-07-31.** `CharacterEntry.teamBuffs`/`CHARACTER_TEAM_BUFFS` gained the
  same `conditional?: boolean` field self-buffs already had; `partyEffects`
  (`src/renderer/src/lib/party.ts`) now splits each character's team buffs
  into the existing unconditional bundle (`passive-<id>-team`, unchanged
  id/behavior) plus one separately-toggleable effect per conditional entry
  (`passive-<id>-team-cN`) — surfaces automatically as its own chip in
  CalculatorScreen's existing `partyEffectsList` UI, no new UI code needed.
  Known simplification: these chips are opt-OUT (default ON) like every
  other party effect, not opt-in like self-buffs' conditional chips — kept
  simple since it matches the surrounding mechanism; revisit only if this
  causes real over-counting complaints. Marked Lynette's "assumed 4-type
  case" ATK% buff (P1, `character-passives.generated.ts`) as the first real
  consumer. On investigation, Yunjin's P2 (extra NA-DMG scaling with party
  elemental-type count) and Xianyun's P1 (stacking team Plunge Crit Rate)
  turned out to be a DIFFERENT, already-per-entry-toggleable mechanism —
  `bundle.ts`'s `data.buffs.character` array already gives every entry its
  own effect id/toggle chip, so no engine gap existed there; added both as
  new entries (`cb-gi-yunjin-p2`, `cb-gi-xianyun-p1`, real sourced numbers:
  11.5% of DEF at 4 elemental types; 4+6+8+10=28% Crit Rate at 4 stacks),
  each modeled at its max case with the toggle available for less-ideal
  parties. Nahida's Pyro-teammate-count burst buff remains unmodeled for a
  DIFFERENT reason: conflicting sourced numbers for the exact talent-level-
  10 percentage (one source implies ~14.88-40.176%, another's partial L8
  data of 23.8-35.7% doesn't reconcile with that) — not an engine gap, a
  sourcing gap.
- ~~Nefer's "Phantasm Performance"/Nicole's "Arcane Projection"~~ **FIXED
  2026-07-31** — a fresh KQM library pass got full, clean 10-level tables
  for both (the earlier "no clean numbers" finding was from a different,
  less-precise source pass). Added as new skill entries. Nefer's Burst
  per-Veil-of-Falsehood-stack DMG bonus also added (max 3 stacks, 120% at
  talent lvl 10).

### OCR scan support

Wuthering Waves echoes only, verified against real screenshots. Reads the
in-game Echo detail screen (name, cost, main stat, sub-stats) via a global
hotkey or a saved screenshot. Requires the game running fullscreen at
1920×1080 (see the README). Genshin's artifact patterns exist in the code but
have never been checked against a real screenshot, so the Scanner's type
picker grays that option out rather than run something unverified — Genshin
players should use the GOOD-format importer (Settings → Data) instead, which
reads real exported data from Inventory Kamera, Akasha Scanner, Genshin
Optimizer, or any other tool that shares the format.

Found something wrong in the data? Open an issue naming the character/weapon
and what's off — that's exactly what this section is tracking against.

---

## 🗺️ Upcoming features

- **2026-07-31 feature batch shipped**: team-buff conditional/toggleable
  entries (Lynette's assumed-4-type ATK% buff, Yunjin P2, Xianyun P1), an
  auto-updating character-data hotfix channel (reuses the endgame-presets
  pipeline, ships empty until a correction is ever needed), a side-by-side
  build comparison tool (Calculator's new "Compare" button — weapon vs
  weapon, or vs a saved loadout's full gear set), and a WW echo Tuning odds
  tool (real, disclosed uniform-per-grade mechanic — Genshin artifacts are
  deliberately NOT covered by an equivalent substat-upgrade simulator: no
  reliable official per-roll weight table was found despite research, and
  this project doesn't model mechanics on guessed numbers). Also shipped: a
  shareable build-card PNG export (Calculator's new "Build card" button) —
  drawn directly to a `<canvas>` (no html-to-image dependency), colors read
  live off the active theme's own CSS tokens so it matches light/dark
  automatically. 2 mockup directions (WW/Havoc, GI/Pyro) were designed and
  shown before building; the shipped version uses the app's single existing
  accent color rather than a per-element palette, since no such system
  exists anywhere else in the app and inventing one just for this export
  would be inconsistent with it.
- **Build card v2 (2026-07-31)** — real character portrait art, fetched
  live (never bundled — ~1GB across 297 characters would be the wrong
  call) from Fandom wikis via their own MediaWiki `imageinfo` API, cached
  client-side. All 177 real characters (121 GI + 56 WW) resolved after
  handling real naming quirks: GI Travelers share one "Traveler Male
  Card.png" (no per-element wiki variant), Childe is filed under
  "Tartaglia", WW splits between "Splash Art" (mostly 5-star) and "Card"
  (mostly 4-star, several `.jpg` not `.png`) suffixes, and Rover shares one
  "Male Rover 1.jpg" across all element variants. Also added: Sequence/
  Constellation level badge, per-equipped-piece icon + main/substat rows,
  the resulting active set-bonus line, kit-derived stat color grading
  (`statRelevance` — element match / real scaling stat / crit-vs-healer
  split / EM-only-if-actually-scaled-off, all from data already in the
  bundle, never fabricated), an accent-color picker, and a persisted
  custom-image override. Redesigned mid-build per live feedback into a
  full-height vertical portrait column on the left with a tightened
  single-column right side, rather than the original horizontal top
  banner — approved against a live screenshot before committing.
- **Genshin Impact full-roster re-audit** — give Genshin the same treatment
  Wuthering Waves just got: every character's kit, every weapon, cross-checked
  against 2+ independent sources, fixing wrong values/scopes/missing buffs
  as found. The single biggest data-quality item left.
- **Rotation Builder refinement** — currently positioned as a tool for
  *testing* rotations (build a sequence of skills/attacks against your own
  party, see total damage over a fight). Each rotation now gets its own
  independent target(s) — real boss picker with icons/per-element RES, custom
  defense overrides, and per-wave HP — no longer tied to the Calculator's
  shared enemy. Expect further refinement as real-world rotations get tried
  against it.
- **Keeping up with new game content** — new characters, weapons, and echo
  sets/artifact sets as both games release them.
- **Dependency security pass** — `npm audit` currently flags Electron,
  Vite, and electron-builder (all several majors behind). Real advisories,
  but low practical exploitability for this app (no remote content loading).
  Deferred on purpose: Electron alone is a 15-major-version jump that needs
  a dedicated, carefully-tested upgrade pass, not a quick bump.
- **Engine gaps intentionally not planned**: a shield/survivability
  calculation (this app only computes damage *output* — no "damage taken"/
  effective-HP concept exists anywhere, and building one is a different tool,
  not a gap in this one).
- **Automatic multi-echo scanner — investigated 2026-07-27, shelved for now,
  not permanently declined.** The idea: automate navigating the in-game Echo
  inventory (simulated key/click input) so a full scan doesn't need pressing
  the hotkey once per echo. Two real blockers, tested live: simulated
  keyboard/mouse input (`keybd_event`/`mouse_event`, tried with a real scan
  code too) had **zero effect in-game** across two attempts — strong evidence
  Wuthering Waves filters injected input at some level, which only a virtual
  HID driver (software that presents to Windows as real hardware, bypassing
  the "is this synthetic" check) could plausibly get around. That's a real
  risk, not just a bigger technical lift: Kuro's own Fair Gaming Policy
  explicitly bans "macro commands," with no carve-out for read-only/harmless
  use, and a virtual driver means actively sending automated input into a
  live game session — genuine ToS exposure, not hypothetical. **Not being
  pursued further right now.** Manual OCR (hotkey, one echo at a time)
  already works and stays the supported path. If enough people specifically
  ask for this, it's worth revisiting — with that risk on the table for
  users to weigh, not added quietly.

---

## 🤝 Contributing

Found a data error, want to help with the Genshin re-audit, or want to build
a feature above? See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup and
[ARCHITECTURE.md](./ARCHITECTURE.md) for how the app fits together.
