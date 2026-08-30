/**
 * @fileoverview Curated, user-facing "what's new" entries for recent
 * releases — shown on the web build's Welcome screen. Deliberately separate
 * from the local, developer-facing CHANGELOG.md (which is gitignored and
 * never bundled) — this file is hand-curated per release, kept short.
 * @module shared/releaseNotes
 */

export interface ReleaseNote {
    version: string;
    date: string;
    highlights: string[];
}

export const RELEASE_NOTES: ReleaseNote[] = [
    {
        version: '1.12.0',
        date: '2026-08-29',
        highlights: [
            'New Wuthering Waves character — Qingxiao (Aero · Sword) — with her full kit, plus the 5★ Glint of Clouds sword and several new echo entries with art.',
            'The gear optimizer now handles very large searches (millions of combinations) without freezing — it streams across your CPU threads, shows a live progress bar, and can be canceled mid-run.',
            'Fixed "Fill remaining slots" wrongly reporting "no loadout stays within the cost budget" for valid builds like 4-3-3-1 that just need one more cost-1 echo to reach 12.',
            'Fixed the optimizer freezing to a blank screen on large searches, and an intermittent crash on launch on Windows.',
        ],
    },
    {
        version: '1.11.3',
        date: '2026-07-31',
        highlights: [
            'Fixed Settings > Data\'s full-app Export/Import silently doing nothing on the web build — it now genuinely backs up and restores everything, same as the desktop app.',
            'Settings > Data\'s per-game backup now also includes your saved loadout library and Build Card custom images, not just inventory/loadouts/party/rotations.',
            'Fixed the Build Card stats panel\'s bottom border nearly clipping the last row of text.',
            'Fixed the Genshin Impact Build Card generator using the wrong official art (a promotional poster) instead of the real in-game Wish/gacha splash art — re-sourced all 116 affected characters.',
        ],
    },
    {
        version: '1.11.2',
        date: '2026-07-31',
        highlights: [
            'Build Card art is now verified against each game\'s own wiki as the correct, official character art (177/177 checked), and bundled with the app instead of fetched live — no more dependency on a third-party site while using the app.',
            'Fixed Rover\'s Build Card art showing a non-canonical render instead of the real official reference art.',
        ],
    },
    {
        version: '1.11.1',
        date: '2026-07-31',
        highlights: [
            'Build Card redesign — the character art is now a full-bleed background (not a side column), with floating panels for stats, weapon, and every equipped piece.',
            'Build Card gear panels now color-grade each substat individually by how well it rolled (a 5-tier red-to-green gradient), fixed a text-overflow bug, and softened the panel borders.',
            'Fixed a real display bug where stacked buffs could show something like "113.69999999999999%" instead of "113.7%" — affected every stat/gear display in the app.',
            'Fixed the "Compare builds" window growing past the screen on characters with a long skill list; it now scrolls internally and got wider so long values stop wrapping awkwardly.',
        ],
    },
    {
        version: '1.11.0',
        date: '2026-07-31',
        highlights: [
            'New shareable Build Card — export a character\'s build as a PNG image: real portrait art, Sequence/Constellation level, weapon + every equipped piece with icons and stats, kit-colored stat grading, and a custom accent color or your own uploaded image.',
            'New "Compare builds" tool in the Calculator — weapon vs. weapon, or your current gear vs. a saved loadout, with a full stat/damage delta table.',
            'New WuWa "Tuning odds" tool — real disclosed reroll probabilities per echo substat, plus a 20-roll simulator.',
            'Team-wide passive buffs that only apply in specific party comps (e.g. Lynette\'s 4-element ATK%, Yunjin\'s extra NA DMG, Xianyun\'s stacking Crit Rate) are now individually toggleable, not silently baked in.',
            'New auto-updating data-correction channel for mid-cycle balance-patch stat fixes, so they can land without waiting on a full app release.',
        ],
    },
    {
        version: '1.10.1',
        date: '2026-07-31',
        highlights: [
            'End-game mode presets are no longer empty — real Trounce Domain, Imaginarium Theater, and Tower of Adversity data seeded in.',
            'More GI data fixes: Charlotte, Nefer (was missing her entire "Phantasm Performance" combo), Nicole (was missing "Arcane Projection", her main damage mechanic).',
        ],
    },
    {
        version: '1.10.0',
        date: '2026-07-31',
        highlights: [
            'Rotation Builder: set a real time limit on any rotation and see if it clears in time, not just an abstract DPS number.',
            'New "End-game mode presets" picker in Rotation Builder — auto-delivered, updates without needing a new app release (starts empty; real Tower of Adversity/Spiral Abyss/Trounce Domain data is a follow-up content pass).',
        ],
    },
];

/** Most recent entry, or undefined if the list is somehow empty. */
export function latestReleaseNote(): ReleaseNote | undefined {
    return RELEASE_NOTES[0];
}
