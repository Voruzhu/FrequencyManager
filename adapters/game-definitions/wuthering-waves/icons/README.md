# Wuthering Waves — icon art

**Status:** `characters/` (55/55, .webp), `weapons/` (115/120, .webp), and
`enemies/` (41/42, .webp) are populated with real art sourced from encore.moe's
public API. `echoes/`, `skills/`, `talents/` are still empty — add art the
same way (drop a file, no code changes) whenever that's next.

`enemies/` was sourced from `api.encore.moe/en/monster` (list) and
`/en/monster/<id>` (detail), matched by boss name against the 42 entries in
`bundle.ts`'s `enemies` array. One boss (`ww-adam-smasher`, the base
non-Nightmare form) has no `icon`: no matching monster entry exists in the
API at all — this collab boss appears to only ever be fought at "Nightmare"
difficulty in-game (same situation as "Nightmare: Kelpie", which has no
non-Nightmare base form either). Note: the API's own `Icon` field advertises
a `.png` extension that 404s against the CDN — the same path with `.webp`
is what's actually hosted there, and that's what these files (and their
`icon` references) use.

Drop PNG (or WEBP/JPG) art in these folders. Files are served to the UI via the
`fm-icon://wuthering-waves/<relative-path>` protocol and appear automatically —
no code changes needed. Missing files fall back to a placeholder icon.

The path a piece of data points at is its `icon` field in the game module, e.g.
`characters.ts` → `icon: 'icons/characters/<id>.png'`.

    icons/characters/<id>.png     e.g. icons/characters/hu_tao.png
    icons/weapons/<id>.png        e.g. icons/weapons/emerald-of-genesis.png
    icons/echoes/<id>.png      (per-piece artifact art)
    icons/enemies/<id>.png        (add `icon` on the enemy data)
    icons/skills/<id>.png         (add `icon` on the skill data)
    icons/talents/<id>.png        (add `icon` on the passive/talent data)

Use the exact `id` from the module data as the filename.

## `characters-card/` — full-size character card art (build-card export)

56/56 resonators, sourced from wutheringwaves.fandom.com's own "Card" file
per character (Kuro's official promotional card art — the file itself
carries a visible Kuro Games logo/copyright watermark), verified against
each character's own wiki page's canonical "page image" before download —
see `scripts/generate-character-wiki-art.cjs`, `verify-character-wiki-art.cjs`,
and `download-character-wiki-art.cjs`, and `shared/game-data/character-wiki-art.ts`
for the exact source file per character. Bundled locally (not fetched live)
for reliability and to avoid any runtime dependency on a third-party site —
same reasoning as every other icon in this folder. Consumed by
`lib/characterArt.ts`'s `characterCardArtSrc()`.
