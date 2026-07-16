import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { userStorage } from '../lib/userStorage';

/** What a character has equipped: a weapon + up to maxGear pieces of gear. */
export interface CharacterLoadout {
    weaponId?: string;
    gearIds: string[];
}

const EMPTY_LOADOUT: CharacterLoadout = { gearIds: [] };

/**
 * Per-character equipped build, keyed by game then character id. This is what
 * makes a character's build persist across switching the Calculator's active
 * character, and what a Party teammate's stats/set/weapon are read from — a
 * teammate always carries what THAT character actually has equipped, exactly
 * like inspecting them directly, never a separate manually-picked loadout.
 */
interface LoadoutState {
    /** byGame[gameId][characterId] = CharacterLoadout */
    byGame: Record<string, Record<string, CharacterLoadout>>;
    getLoadout: (gameId: string, characterId: string) => CharacterLoadout;
    setLoadout: (gameId: string, characterId: string, loadout: CharacterLoadout) => void;
}

export const useLoadoutStore = create<LoadoutState>()(
    persist(
        (set, get) => ({
            byGame: {},
            getLoadout: (gameId, characterId) => get().byGame[gameId]?.[characterId] ?? EMPTY_LOADOUT,
            setLoadout: (gameId, characterId, loadout) => set((s) => ({
                byGame: { ...s.byGame, [gameId]: { ...s.byGame[gameId], [characterId]: loadout } },
            })),
        }),
        { name: 'fm-loadouts', storage: createJSONStorage(() => userStorage) }
    )
);
