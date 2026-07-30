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
        version: '1.9.0',
        date: '2026-07-30',
        highlights: [
            'New GI reactions: Bloom, Hyperbloom, Burgeon, Swirl, and Burning (first-tick) join Vaporize/Melt/Aggravate/Spread in the Calculator.',
            'New "Fill remaining slots" button — lock your currently-equipped gear and let the Optimizer search only the empty slots.',
            "Fixed a WuWa bug where a weapon's refinement rank reset to R1 every time you switched away and back.",
            'GI artifact optimization is now slot-aware — faster, and no longer able to suggest an impossible 2-of-the-same-slot build.',
            'Full GI roster re-audit: dozens of data fixes across Travelers, Noelle, Nilou, Cyno, Yanfei, Ganyu, and more.',
        ],
    },
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
];

/** Most recent entry, or undefined if the list is somehow empty. */
export function latestReleaseNote(): ReleaseNote | undefined {
    return RELEASE_NOTES[0];
}
