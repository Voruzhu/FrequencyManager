import { create } from 'zustand';
import type { StatHotfix } from '@shared/types/hotfix';
import { fetchHotfixes } from '../lib/hotfixes';

/** Holds each game's fetched data-correction patches (see `lib/hotfixes.ts`).
 * Mirrors `gameDataStore`'s one-fetch-per-game-id pattern. */
interface HotfixState {
    patches: Record<string, StatHotfix[]>;
    loaded: Set<string>;
    loadHotfixes: (gameId: string) => Promise<void>;
}

export const useHotfixStore = create<HotfixState>((set, get) => ({
    patches: {},
    loaded: new Set<string>(),
    loadHotfixes: async (gameId) => {
        if (get().loaded.has(gameId)) return;
        const result = await fetchHotfixes(gameId);
        set((s) => ({
            patches: { ...s.patches, [gameId]: result },
            loaded: new Set(s.loaded).add(gameId),
        }));
    },
}));
