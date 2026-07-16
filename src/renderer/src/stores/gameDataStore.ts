import { create } from 'zustand';
import type { GameBundle } from '@shared/types/game-bundle';

/**
 * Holds the backend-served game data bundles. The backend (game-loader) is the
 * source of truth: `loadBundle(gameId)` fetches a game's full {@link GameBundle}
 * over IPC and caches it here. `gameData.getGameData()` reads from this cache,
 * falling back to the renderer's EMBEDDED copy when the bridge is unavailable
 * (dev-in-browser / offline). Because the embedded data mirrors the backend
 * data, the UI renders identically whether or not the fetch has landed yet.
 */
interface GameDataState {
    bundles: Record<string, GameBundle>;
    loaded: Set<string>;
    getBundle: (gameId: string) => GameBundle | undefined;
    loadBundle: (gameId: string) => Promise<void>;
}

const bridge = () => (window as unknown as {
    frequencyManager?: { getGameBundle?: (id?: string) => Promise<unknown> };
}).frequencyManager;

/** A fetched bundle is trustworthy only if it carries a matching id + catalog. */
function isBundle(v: unknown, gameId: string): v is GameBundle {
    const b = v as GameBundle | null;
    return !!b && b.id === gameId && Array.isArray(b.statCatalog) && Array.isArray(b.characters);
}

export const useGameDataStore = create<GameDataState>((set, get) => ({
    bundles: {},
    loaded: new Set<string>(),
    getBundle: (gameId) => get().bundles[gameId],
    loadBundle: async (gameId) => {
        if (get().loaded.has(gameId)) return;
        try {
            const raw = await bridge()?.getGameBundle?.(gameId);
            if (isBundle(raw, gameId)) {
                set((s) => ({
                    bundles: { ...s.bundles, [gameId]: raw },
                    loaded: new Set(s.loaded).add(gameId),
                }));
            }
        } catch {
            /* offline / no bridge: getGameData() falls back to EMBEDDED */
        }
    },
}));
