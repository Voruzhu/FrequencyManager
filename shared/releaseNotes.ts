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
        version: '1.8.1',
        date: '2026-07-28',
        highlights: [
            'Fixed party creation searching the whole game roster instead of just your owned characters.',
            "Fixed the reference-enemy picker's selection highlight not following your clicks.",
        ],
    },
    {
        version: '1.8.0',
        date: '2026-07-27',
        highlights: [
            'Duplicate and rename saved loadouts, not just save/apply/delete.',
            'Compare two rotations side-by-side — pin one as A, another as B, see the damage diff.',
            'Roster Overview gets a new "Avg skill DMG" column vs. a reference enemy of your choice.',
        ],
    },
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
];

/** Most recent entry, or undefined if the list is somehow empty. */
export function latestReleaseNote(): ReleaseNote | undefined {
    return RELEASE_NOTES[0];
}
