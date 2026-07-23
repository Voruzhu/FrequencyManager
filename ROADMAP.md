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

### Genshin Impact — 121/121 characters, base data complete, full re-audit still ahead

Full roster has real skill data, base stats, constellations, and kit buffs,
cross-checked against gi.yatta.moe (2-source verification) earlier in the
project. It has **not** yet had the same fresh, systematic full-roster
re-audit Wuthering Waves just went through — that's the next big data-quality
push (see below).

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

---

## 🤝 Contributing

Found a data error, want to help with the Genshin re-audit, or want to build
a feature above? See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup and
[ARCHITECTURE.md](./ARCHITECTURE.md) for how the app fits together.
