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
    {
        version: '1.5.1',
        date: '2026-07-25',
        highlights: [
            '"Echo Skill deployed" toggle now applies to all Wuthering Waves characters, not just Lucy/Rebecca.',
            'Fixed that toggle not reaching real Optimizer results, only the live preview.',
        ],
    },
    {
        version: '1.5.0',
        date: '2026-07-25',
        highlights: [
            'Fixed laggy scrolling in the Add Character / Add Weapon pickers.',
            'Full Wuthering Waves + Genshin buff/debuff audit — 58 real fixes across all 176 characters.',
            'Fixed the web OCR scanner producing garbage results on gear scans.',
        ],
    },
];

/** Most recent entry, or undefined if the list is somehow empty. */
export function latestReleaseNote(): ReleaseNote | undefined {
    return RELEASE_NOTES[0];
}
