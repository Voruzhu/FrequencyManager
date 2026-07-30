import type { WaveConfig } from './rotationEngine';
import { userStorage } from './userStorage';
import wuwaSnapshot from '@shared/game-data/endgame-presets/wuthering-waves.json';
import giSnapshot from '@shared/game-data/endgame-presets/genshin-impact.json';

/**
 * A curated real end-game-mode target (Tower of Adversity floor, Spiral
 * Abyss half, Imaginarium Theater round, Trounce Domain boss) — auto-
 * delivered (see `fetchEndgamePresets` below) so updating these never
 * needs a new app release. `waves` reuses the EXACT existing
 * `WaveConfig` shape from `lib/rotationEngine.ts` — no new enemy-config
 * concept. `timeLimitSeconds` is optional: Trounce Domains have no real
 * in-combat clock, unlike Abyss/Theater/ToA.
 */
export interface EndgameModePreset {
    id: string;
    category: 'tower-of-adversity' | 'spiral-abyss' | 'imaginarium-theater' | 'trounce-domain';
    displayName: string;
    cycleLabel?: string;
    waves: WaveConfig[];
    timeLimitSeconds?: number;
    specialRuleNote?: string;
    sourceNote?: string;
}

interface EndgamePresetManifest {
    schemaVersion: string;
    generatedAt: string;
    presets: EndgameModePreset[];
}

const MANIFEST_URL = (gameId: string) =>
    `https://raw.githubusercontent.com/Voruzhu/FrequencyManager/main/shared/game-data/endgame-presets/${gameId}.json`;
const CACHE_KEY = (gameId: string) => `fm-endgame-presets-${gameId}`;
const CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours

const BUNDLED_SNAPSHOTS: Record<string, EndgamePresetManifest> = {
    'wuthering-waves': wuwaSnapshot as EndgamePresetManifest,
    'genshin-impact': giSnapshot as EndgamePresetManifest,
};

function isValidManifest(v: unknown): v is EndgamePresetManifest {
    return !!v && typeof v === 'object' && Array.isArray((v as EndgamePresetManifest).presets);
}

/** Fetches this game's end-game-mode preset library, always-fresh (no CDN
 * caching — see this feature's spec for why raw.githubusercontent.com was
 * chosen over jsDelivr). Falls back, in order: local cache (if fetch fails
 * or the response is invalid) -> bundled repo snapshot (if no cache exists
 * either) -> the bundled snapshot's own empty array, never throws. */
export async function fetchEndgamePresets(gameId: string): Promise<EndgameModePreset[]> {
    const cacheKey = CACHE_KEY(gameId);
    try {
        const cachedRaw = await userStorage.getItem(cacheKey);
        if (cachedRaw) {
            const cached = JSON.parse(cachedRaw) as { fetchedAt: number; manifest: EndgamePresetManifest };
            if (Date.now() - cached.fetchedAt < CACHE_MAX_AGE_MS && isValidManifest(cached.manifest)) {
                return cached.manifest.presets;
            }
        }
    } catch { /* corrupt cache entry — fall through to a fresh fetch */ }

    try {
        const res = await fetch(MANIFEST_URL(gameId), { signal: AbortSignal.timeout(5000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const manifest = await res.json();
        if (!isValidManifest(manifest)) throw new Error('malformed manifest');
        await userStorage.setItem(cacheKey, JSON.stringify({ fetchedAt: Date.now(), manifest }));
        return manifest.presets;
    } catch {
        // Network failure, non-OK response, or malformed JSON — try the
        // (possibly stale, but real) cache before the bundled snapshot.
        try {
            const cachedRaw = await userStorage.getItem(cacheKey);
            if (cachedRaw) {
                const cached = JSON.parse(cachedRaw) as { fetchedAt: number; manifest: EndgamePresetManifest };
                if (isValidManifest(cached.manifest)) return cached.manifest.presets;
            }
        } catch { /* fall through to bundled snapshot */ }
        return BUNDLED_SNAPSHOTS[gameId]?.presets ?? [];
    }
}
