import { create } from 'zustand';
import { useGameDataStore } from './gameDataStore';
import { useInventoryStore } from './inventoryStore';

/**
 * Game selection. The app ships with ZERO games compiled in — every game,
 * including Wuthering Waves/Genshin Impact, is loaded at runtime from
 * `<userData>/game-modules/` (see `initExternalGameModules` in
 * `adapters/game-definitions/index.ts`). `games` starts as a placeholder
 * list (so the selector renders something before the backend responds, and
 * still works in tests/Storybook with no Electron bridge at all), then gets
 * replaced by the REAL backend list on `syncFromBackend()` — which may be
 * empty if no game module has been installed yet.
 */
export interface GameInfo {
    id: string;
    label: string;
    version: string;
    description: string;
}

const FALLBACK_GAMES: GameInfo[] = [
    {
        id: 'wuthering-waves',
        label: 'Wuthering Waves',
        version: '1.0.0',
        description: 'Post-apocalyptic action-RPG with echoes as equipment.',
    },
    {
        id: 'genshin-impact',
        label: 'Genshin Impact',
        version: '1.0.0',
        description: 'Open-world action-RPG with artifacts as equipment.',
    },
];

interface GameState {
    games: GameInfo[];
    activeGameId: string;
    setActiveGame: (id: string) => void;
    /** Adopt the backend's real installed-games list + active game on startup (keeps the fallback list offline). */
    syncFromBackend: () => Promise<void>;
}

const bridge = () => (window as unknown as {
    frequencyManager?: {
        setActiveGame?: (id: string) => Promise<unknown>;
        getActiveGame?: () => Promise<{ id: string | null } | null>;
        getGames?: () => Promise<Array<{ id: string; displayName: string; version: string; description?: string }>>;
    };
}).frequencyManager;

export const useGameStore = create<GameState>((set, get) => ({
    games: FALLBACK_GAMES,
    activeGameId: 'wuthering-waves',
    setActiveGame: (id) => {
        set({ activeGameId: id });
        // Drive + persist the switch in the backend (game-loader re-injects the
        // GameDefinition so OCR / damage-calc modules follow). No-op offline.
        void bridge()?.setActiveGame?.(id);
        // Guarantee this game's data bundle gets fetched even if it wasn't
        // covered by the boot-time prefetch loop (e.g. a community game added
        // after boot, or `loadBundle` is a no-op once cached for an
        // already-loaded one). `ensureSeeded` MUST wait for the bundle first —
        // it reads `starterCharacterId` off it, and seeding before the real
        // bundle lands would silently fall back to Wuthering Waves' starter.
        void useGameDataStore.getState().loadBundle(id).then(() => {
            useInventoryStore.getState().ensureSeeded(id);
        });
    },
    syncFromBackend: async () => {
        try {
            const backendGames = await bridge()?.getGames?.();
            // A successful call trusts the response AS-IS, including a
            // genuinely empty array (zero games installed — a normal state
            // for a fresh install with no game module downloaded yet) —
            // only a thrown/missing bridge (caught below) keeps the offline
            // placeholder list. Conflating "call failed" with "call
            // succeeded, zero results" would make a real empty-games state
            // silently show the placeholder entries as if they were installed.
            if (backendGames) {
                set({
                    games: backendGames.map((g) => ({
                        id: g.id, label: g.displayName, version: g.version, description: g.description ?? '',
                    })),
                });
            }
        } catch {
            /* offline / no bridge: keep the fallback list */
        }
        try {
            const active = await bridge()?.getActiveGame?.();
            if (active?.id && get().games.some((g) => g.id === active.id)) {
                set({ activeGameId: active.id });
            }
        } catch {
            /* offline / no bridge: keep local default */
        }
    },
}));
