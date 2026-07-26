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
        version: '1.7.1',
        date: '2026-07-27',
        highlights: [
            'The named loadout library is now also available from the character Inspector, not just the Calculator.',
        ],
    },
    {
        version: '1.7.0',
        date: '2026-07-27',
        highlights: [
            'New Roster Overview screen — sortable solo stats for every owned character at a glance.',
            'Share a saved Rotation as a code, same as builds and target presets.',
            'Save multiple named loadouts per character, not just one.',
            'Importing a build now compares it against your own current gear.',
            "Fixed Lucilla's ult/Letting It Go/Forte Circuit DMG-type classification.",
        ],
    },
    {
        version: '1.6.1',
        date: '2026-07-26',
        highlights: [
            'Fixed the build-code preview being an unscannable wall of stats — gear now collapses to a summary line by default.',
        ],
    },
    {
        version: '1.6.0',
        date: '2026-07-25',
        highlights: [
            'Gear roll-quality score — see how well a piece rolled at a glance, right on its card.',
            'Share a build as a short code — paste it anywhere, no account needed.',
            'Share optimization target presets the same way, reusable on any character.',
            'Rotation Builder now shows a damage-over-time chart for your rotation.',
            'A couple of new boss presets added to the Enemy picker.',
        ],
    },
    {
        version: '1.5.2',
        date: '2026-07-25',
        highlights: [
            'Fixed the Talents window losing real kit text for Rebecca, Sigrika, Verina, Baizhi and Mavuika.',
        ],
    },
];

/** Most recent entry, or undefined if the list is somehow empty. */
export function latestReleaseNote(): ReleaseNote | undefined {
    return RELEASE_NOTES[0];
}
