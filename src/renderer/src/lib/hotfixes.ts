import type { StatHotfix, HotfixManifest } from '@shared/types/hotfix';
import type { GameBundle } from '@shared/types/game-bundle';
import { userStorage } from './userStorage';
import wuwaSnapshot from '@shared/game-data/hotfixes/wuthering-waves.json';
import giSnapshot from '@shared/game-data/hotfixes/genshin-impact.json';

export type { StatHotfix };

const MANIFEST_URL = (gameId: string) =>
    `https://raw.githubusercontent.com/Voruzhu/FrequencyManager/main/shared/game-data/hotfixes/${gameId}.json`;
const CACHE_KEY = (gameId: string) => `fm-hotfixes-${gameId}`;
const CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours — same cadence as endgamePresets

const BUNDLED_SNAPSHOTS: Record<string, HotfixManifest> = {
    'wuthering-waves': wuwaSnapshot as HotfixManifest,
    'genshin-impact': giSnapshot as HotfixManifest,
};

function isValidManifest(v: unknown): v is HotfixManifest {
    return !!v && typeof v === 'object' && Array.isArray((v as HotfixManifest).patches);
}

/** Fetches this game's data-correction manifest, always-fresh. Falls back, in
 * order: local cache (if fetch fails or the response is invalid) -> bundled
 * empty snapshot, never throws. Mirrors `fetchEndgamePresets` exactly. */
export async function fetchHotfixes(gameId: string): Promise<StatHotfix[]> {
    const cacheKey = CACHE_KEY(gameId);
    try {
        const cachedRaw = await userStorage.getItem(cacheKey);
        if (cachedRaw) {
            const cached = JSON.parse(cachedRaw) as { fetchedAt: number; manifest: HotfixManifest };
            if (Date.now() - cached.fetchedAt < CACHE_MAX_AGE_MS && isValidManifest(cached.manifest)) {
                return cached.manifest.patches;
            }
        }
    } catch { /* corrupt cache entry — fall through to a fresh fetch */ }

    try {
        const res = await fetch(MANIFEST_URL(gameId), { signal: AbortSignal.timeout(5000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const manifest = await res.json();
        if (!isValidManifest(manifest)) throw new Error('malformed manifest');
        await userStorage.setItem(cacheKey, JSON.stringify({ fetchedAt: Date.now(), manifest }));
        return manifest.patches;
    } catch {
        try {
            const cachedRaw = await userStorage.getItem(cacheKey);
            if (cachedRaw) {
                const cached = JSON.parse(cachedRaw) as { fetchedAt: number; manifest: HotfixManifest };
                if (isValidManifest(cached.manifest)) return cached.manifest.patches;
            }
        } catch { /* fall through to bundled snapshot */ }
        return BUNDLED_SNAPSHOTS[gameId]?.patches ?? [];
    }
}

/** Applies stat corrections on top of a resolved bundle. Only clones the
 * touched character's `stats` object (and the `characters` array itself) —
 * every other character/reference keeps its original identity. No-op (same
 * reference back) when there's nothing to patch, so this is cheap to call
 * unconditionally on every read. */
export function applyHotfixes(bundle: GameBundle, patches: StatHotfix[]): GameBundle {
    const relevant = patches.filter((p) => bundle.characters.some((c) => c.id === p.characterId));
    if (relevant.length === 0) return bundle;
    const characters = bundle.characters.map((c) => {
        const forChar = relevant.filter((p) => p.characterId === c.id);
        if (forChar.length === 0) return c;
        const stats = { ...c.stats };
        for (const p of forChar) stats[p.stat] = p.value;
        return { ...c, stats };
    });
    return { ...bundle, characters };
}
