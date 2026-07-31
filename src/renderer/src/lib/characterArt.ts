import { CHARACTER_WIKI_ART } from '@shared/game-data/character-wiki-art';
import { userStorage } from './userStorage';

const CACHE_KEY = (characterId: string) => `fm-char-art-${characterId}`;

/** In-memory, same-session cache — avoids a repeat userStorage IPC round trip
 * (or a real network fetch, in a plain-browser test/dev context where
 * userStorage has no durable backing at all) when the same character's card
 * is opened more than once in one app session. Durable cross-session caching
 * is userStorage's job below; this is purely a same-session fast path. */
const memoryCache = new Map<string, string>();

/** Resolves a character's real portrait art via the Fandom wiki's own
 * imageinfo API (see character-wiki-art.ts's generator for how the mapping
 * was built) — never bundled, fetched live and cached forever (art doesn't
 * change). Returns undefined on any failure (no mapping, network error,
 * malformed response, file genuinely missing) so callers fall back to the
 * existing small icon — mirrors fetchHotfixes/fetchEndgamePresets. */
export async function fetchCharacterArtUrl(characterId: string): Promise<string | undefined> {
    const entry = CHARACTER_WIKI_ART[characterId];
    if (!entry) return undefined;

    const memoized = memoryCache.get(characterId);
    if (memoized) return memoized;

    const cacheKey = CACHE_KEY(characterId);
    try {
        const cached = await userStorage.getItem(cacheKey);
        if (cached) { memoryCache.set(characterId, cached); return cached; }
    } catch { /* corrupt cache entry — fall through to a fresh fetch */ }

    try {
        const url = `https://${entry.host}/api.php?action=query&titles=${encodeURIComponent('File:' + entry.fileTitle)}&prop=imageinfo&iiprop=url&format=json`;
        const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) return undefined;
        const json = await res.json();
        const pages = Object.values(json?.query?.pages ?? {}) as Array<{ imageinfo?: Array<{ url: string }> }>;
        const resolvedUrl = pages.find((p) => Array.isArray(p.imageinfo) && p.imageinfo.length > 0)?.imageinfo?.[0]?.url;
        if (!resolvedUrl) return undefined;
        memoryCache.set(characterId, resolvedUrl);
        await userStorage.setItem(cacheKey, resolvedUrl);
        return resolvedUrl;
    } catch {
        return undefined;
    }
}
