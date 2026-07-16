# Game Modules

FrequencyManager ships with **zero games compiled in**. Every game —
including the official Wuthering Waves and Genshin Impact packages — loads at
runtime: drop a game module into a folder and restart the app. This works
exactly the same way whether a game module is a community contribution or an
official one; nothing distinguishes them at load time.

This is possible because a "game module" — equipment rules, OCR patterns,
combat actions, set bonuses, character/weapon rosters — is **100% plain
data**. There's no code to run, so adding a game is really just "give the app
a bigger data file," not "install a plugin."

---

## Where files go

```
%APPDATA%/frequency-manager/game-modules/
```

(`%APPDATA%` is typically `C:\Users\<you>\AppData\Roaming`.) The app creates
this folder automatically on first launch if it doesn't exist. Two shapes
are supported side by side, and you can mix both in the same folder:

- **Loose file** — `game-modules/<anything>.json`, a single self-contained
  module with no icons (there's nowhere for a lone JSON file to put art).
  The simplest option if you're just authoring the data.
- **Packaged folder** — `game-modules/<package-name>/<anything>.json` (exactly
  one JSON file) plus an optional sibling `game-modules/<package-name>/icons/`
  folder with character/weapon/gear art. This is what you get from extracting
  a distributed `.zip` package — including the official Wuthering Waves and
  Genshin Impact packages — into place.

Each module is scanned independently, so one broken file or package never
blocks another valid one.

**Restart the app** after adding, editing, or removing anything — the folder
is scanned once at boot (see `loadExternalGameModules()` in
`src/main/electron-main.ts`).

---

## File format

Each file is a single JSON object with four top-level keys:

```json
{
  "definition": { ... },
  "charDB": [ ... ],
  "weaponDB": [ ... ],
  "supplements": { ... },
  "buildOptions": { ... }
}
```

This mirrors exactly what the official Wuthering Waves/Genshin Impact
packages are authored as (in-repo, by hand) in
`adapters/game-definitions/<game>/bundle.ts` — `scripts/build-game-package.js`
(`npm run package:games`) compiles that TypeScript source and reshapes it into
this exact JSON format, the same shape any third party would hand-author. See
`shared/game-data/external-loader.ts`'s `ExternalGameModuleFile` type for the
authoritative shape, and `tests/shared/external-loader.test.ts` for a
complete, valid, minimal example.

### `definition` — rules, OCR, and the roster list

A `GameDefinition` (see `shared/types/game-definition.ts` for every field):
equipment shape (slot label, cost tiers, allowed main stats), character
schema (elements, weapons, ascension bonuses), combat actions, OCR regex
patterns, and set bonuses.

**`definition.uiOptions.characters` is the roster list** — an array of
`{ value, label }` pairs. This is what actually determines who's playable;
`charDB` (below) is just the stat lookup table keyed by `value`. A character
present in `charDB` but missing from `uiOptions.characters` never appears
anywhere in the app.

OCR regex patterns (`namePattern`, `costPattern`, `mainStatPattern`,
`subStatPattern`, `levelPattern`, `equippedByPattern`) are validated for
basic safety before being compiled — a pattern over 500 characters, one that
fails to compile, or one shaped like a known catastrophic-backtracking
pattern (`(x+)+`, `(x*)*`, etc.) gets the WHOLE file rejected with a clear
error, not silently disabled. This is a best-effort static check, not a full
proof — when in doubt, avoid nested quantifiers in your patterns.

### `charDB` — character stats

One entry per character: `id`, `name`, `element`, `weapon`, `baseAtk`,
`baseHp`, `baseDef`, `baseCritRate`, `baseCritDmg`, `baseEnergyRegen`, plus
optional `rarity`, `icon`, `skills`, `constellations`, `selfBuffs`.

### `weaponDB` — weapon stats

One entry per weapon: `id`, `name`, `weaponType`, `rarity`, `baseAtk`,
`secondaryStat`, `secondaryValue`, plus optional `passive`, `buffs`,
`selfBuffs`, `conversions`, `icon`.

### `supplements` — the parts a game module doesn't define

`gearRanges` (stat ranges per rarity for owned gear), `statCatalog` (every
stat this game exposes — must include an entry for each stat your
characters/weapons/sets actually use), `enemies`, `buffs` (`{ basic: [],
character: [] }`), `passives`.

### `buildOptions` — the handful of top-level scalars

`defaultElement`, `defaultWeapon`, `hasElementalMastery`,
`supportsReactions` (Genshin-style elemental reactions — set `false` unless
your game genuinely has this), `setPieces` (echo/artifact pieces needed for
a full set bonus), `partyTeammates`, `starterCharacterId` (must be a
`charDB` id — this is who a fresh install starts with), `sequenceLabel`
(what you call your game's "Constellation"/"Sequence" mechanic),
`sequenceMax`.

---

## Adding icons (packaged folder only)

Character/weapon/gear/enemy art referenced by `charDB[].icon`,
`weaponDB[].icon`, etc. (relative paths, e.g. `characters/hero.png`) only
resolves for a **packaged folder** module — put an `icons/` folder next to
your JSON file:

```
game-modules/my-game/
├── module.json          (any filename — must be the only .json in this folder)
└── icons/
    ├── characters/hero.png
    └── weapons/sword1.png
```

A loose top-level `game-modules/my-game.json` file has no icons directory at
all — its `icon` fields are simply never resolved, and the app falls back to
its placeholder art. This is the natural result of zipping up a folder for
distribution: extract the `.zip` into `game-modules/` and you get this exact
shape.

---

## Validation & safety

- **Schema validation** catches the obvious mistakes (missing required
  fields, wrong types) before anything is registered — a malformed file is
  skipped with a logged reason, never crashes the app.
- **Id collisions are rejected.** A file whose `definition.id` matches an
  ALREADY-loaded module (whichever loaded first — official packages included)
  is skipped with a logged reason; a module can never silently override
  another one's data.
- **No code execution.** Since the whole format is plain JSON, there's
  nothing to "run" — the risk surface is limited to malformed data (handled
  above) and the OCR regex safety check.
- **A packaged folder must contain exactly one JSON file.** Two or more is
  ambiguous (which one is the module?) and the whole package is skipped with
  an error naming every file found. A folder with none at all is silently
  treated as unrelated (e.g. some other folder you happen to have in
  `game-modules/`), not an error.
- **What if no games are installed at all?** The app doesn't crash — it
  shows a "No game installed yet" screen on any game-scoped page pointing
  back here, and Dashboard/Settings stay fully usable.

Check the app's logs (or run with `ELECTRON_ENABLE_LOGGING=1` from a
terminal) if your module doesn't show up in Settings → Game — every
skipped file logs a specific reason.

---

## Testing your module

1. Build a minimal file first (1 character, 1 weapon, a couple of stats) and
   confirm it loads before fleshing out the full roster.
2. Restart the app, open **Settings → Game**, and confirm your game appears
   in the dropdown.
3. Select it, then check the Calculator's character picker shows your
   roster and the Inspector shows the right base stats.

See `tests/shared/external-loader.test.ts` for a complete worked example you
can copy as a starting point.
