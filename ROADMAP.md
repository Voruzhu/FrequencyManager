# Roadmap

What's done, what's in progress, and what's next for FrequencyManager's game
data and features. For day-to-day release notes see the commit history; this
file tracks the bigger picture.

---

## 🎮 Character/roster data progress

Game data (skills, multiplier tables, kit buffs, weapons, sets) is
hand-curated and cross-checked against multiple community sources — not
scraped automatically — so accuracy is a per-game, ongoing effort.

### Wuthering Waves — 55/55 characters, ~95% accurate

Full roster present with real 10-level multiplier tables, kit/weapon/Sequence
buffs, and Sonata Set bonuses. Went through a full-roster re-audit
cross-checking every character's kit, every weapon, and every echo-set entry
against 2+ independent community sources (encore.moe where reachable,
wuthering.gg, wuthering.wiki, game8.co). That pass fixed real issues across
the board — wrong scaling stats, mistagged attack-type scopes, missing
buffs/moves, wrong Sonata Set values — and added engine support for
mechanics that had no home before (DEF-ignore/RES-shred, per-attack-type
scoped buffs, ER-scaling buffs).

Known remaining gap: a small number of effects need engine primitives that
don't exist yet (shields, element-restricted enemy RES tracking beyond the
generic single value — see [Upcoming features](#-upcoming-features) below).

### Genshin Impact — 121/121 characters, base data complete, full re-audit still ahead

Full roster has real skill data, base stats, constellations, and kit buffs,
cross-checked against gi.yatta.moe (2-source verification) earlier in the
project. It has **not** yet had the same fresh, systematic full-roster
re-audit Wuthering Waves just went through — that's the next big data-quality
push (see below).

### OCR scan support

Unchanged — Wuthering Waves echoes only. Reads the in-game Echo detail screen
(name, cost, main stat, sub-stats) via a global hotkey or a saved screenshot.
Requires the game running fullscreen at 1920×1080 (see the README). Genshin
artifact scanning isn't wired up.

Found something wrong in the data? Open an issue naming the character/weapon
and what's off — that's exactly what this section is tracking against.

---

## 🗺️ Upcoming features

- **Genshin Impact full-roster re-audit** — give Genshin the same treatment
  Wuthering Waves just got: every character's kit, every weapon, cross-checked
  against 2+ independent sources, fixing wrong values/scopes/missing buffs
  as found. The single biggest data-quality item left.
- **Rotation Builder refinement** — currently positioned as a tool for
  *testing* rotations (build a sequence of skills/attacks against your real
  party, see total damage over a fight). Expect refinement as real-world
  rotations get tried against it.
- **Keeping up with new game content** — new characters, weapons, and echo
  sets/artifact sets as both games release them.
- **OCR hotkey-capture scanner** — the file-picker "scan a saved screenshot"
  path works today; a live in-game capture flow (global hotkey → screen
  capture → parse, no manual screenshot step) was designed but not yet built.
- **Dependency security pass** — `npm audit` currently flags Electron,
  Vite, and electron-builder (all several majors behind). Real advisories,
  but low practical exploitability for this app (no remote content loading).
  Deferred on purpose: Electron alone is a 15-major-version jump that needs
  a dedicated, carefully-tested upgrade pass, not a quick bump.
- **Engine gaps intentionally not planned**: a shield/survivability
  calculation (this app only computes damage *output* — no "damage taken"/
  effective-HP concept exists anywhere, and building one is a different tool,
  not a gap in this one). Per-element enemy RES tracking is also unmodeled
  (enemies have one flat RES value regardless of attacking element) — every
  RES-shred effect is applied against that single value as the closest
  available approximation.

---

## 🤝 Contributing

Found a data error, want to help with the Genshin re-audit, or want to build
a feature above? See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup and
[ARCHITECTURE.md](./ARCHITECTURE.md) for how the app fits together.
