/**
 * A single mid-cycle balance-patch data correction — one character's one
 * `stats` field, overridden without needing a new app release. Delivered via
 * the same auto-update pipeline as `endgamePresets.ts` (raw.githubusercontent.com,
 * cached, falls back to a bundled empty snapshot, never throws).
 */
export interface StatHotfix {
    id: string;
    characterId: string;
    /** Key into `CharacterEntry.stats` (e.g. 'atk', 'critRate'). */
    stat: string;
    value: number;
    /** User-facing reason, e.g. "Corrected base ATK after the 2.1 hotfix patch notes". */
    note: string;
}

export interface HotfixManifest {
    schemaVersion: string;
    generatedAt: string;
    patches: StatHotfix[];
}
