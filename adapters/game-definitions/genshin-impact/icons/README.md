# Genshin Impact — icon art

**Status:** `characters/` (120/121, .png) and `weapons/` (155/235, .png) are
populated with real character portraits/weapon art, sourced from the
`genshin-db` npm package's bundled Mihoyo/HoYoWiki CDN URLs (a couple of the
very newest characters/weapons aren't in that dataset yet — `sandrone` and
~80 newer weapons — they fall back to the placeholder until re-sourced).
`artifacts/`, `enemies/`, `skills/`, `talents/` are still empty — add art the
same way (drop a file, no code changes) whenever that's next.

Drop PNG (or WEBP/JPG) art in these folders. Files are served to the UI via the
`fm-icon://genshin-impact/<relative-path>` protocol and appear automatically —
no code changes needed. Missing files fall back to a placeholder icon.

The path a piece of data points at is its `icon` field in the game module, e.g.
`characters.ts` → `icon: 'icons/characters/<id>.png'`.

    icons/characters/<id>.png     e.g. icons/characters/hu_tao.png
    icons/weapons/<id>.png        e.g. icons/weapons/staff-of-homa.png
    icons/artifacts/<id>.png      (per-piece artifact art)
    icons/enemies/<id>.png        (add `icon` on the enemy data)
    icons/skills/<id>.png         (add `icon` on the skill data)
    icons/talents/<id>.png        (add `icon` on the passive/talent data)

Use the exact `id` from the module data as the filename.
