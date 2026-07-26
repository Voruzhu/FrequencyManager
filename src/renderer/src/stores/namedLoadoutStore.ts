import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { userStorage } from '../lib/userStorage';
import type { CharacterLoadout } from './loadoutStore';

/** A named snapshot of a character's loadout — separate from `loadoutStore`'s single
 * "currently active" loadout per character, purely additive (a library to save into
 * and apply from), same byGame keying convention as `rotationStore`. */
export interface SavedLoadout {
    id: string;
    name: string;
    characterId: string;
    loadout: CharacterLoadout;
}

interface NamedLoadoutState {
    /** byGame[gameId][loadoutId] = SavedLoadout */
    byGame: Record<string, Record<string, SavedLoadout>>;
    save: (gameId: string, saved: SavedLoadout) => void;
    remove: (gameId: string, id: string) => void;
    listFor: (gameId: string, characterId: string) => SavedLoadout[];
}

export const useNamedLoadoutStore = create<NamedLoadoutState>()(
    persist(
        (set, get) => ({
            byGame: {},
            save: (gameId, saved) => set((s) => ({
                byGame: { ...s.byGame, [gameId]: { ...s.byGame[gameId], [saved.id]: saved } },
            })),
            remove: (gameId, id) => set((s) => {
                const forGame = { ...s.byGame[gameId] };
                delete forGame[id];
                return { byGame: { ...s.byGame, [gameId]: forGame } };
            }),
            listFor: (gameId, characterId) => Object.values(get().byGame[gameId] ?? {}).filter((l) => l.characterId === characterId),
        }),
        { name: 'fm-named-loadouts', storage: createJSONStorage(() => userStorage) }
    )
);
