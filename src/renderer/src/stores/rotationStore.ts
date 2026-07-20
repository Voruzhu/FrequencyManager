import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { userStorage } from '../lib/userStorage';
import type { RotationStepSpec } from '../types';
import type { WaveConfig } from '../lib/rotationEngine';

/** A named, saved rotation — the active character's steps plus which conditional self-buffs were toggled on per party member. */
export interface SavedRotation {
    id: string;
    name: string;
    /** Which named party (`namedPartyStore.ts`) this rotation's turn-picker is
     * restricted to. Undefined for a rotation saved before this field existed,
     * or one never assigned a party — it still loads fine, just without a
     * turn-picker restriction until a party is explicitly selected. */
    partyId?: string;
    steps: RotationStepSpec[];
    /** characterId -> enabled conditional self-buff ids for that member. */
    enabledSelfBuffIds: Record<string, string[]>;
    /** 'boss' = single WaveConfig entry (HP optional). 'waves' = 2+ entries.
     * Undefined for a rotation saved before this field existed — treated as
     * 'boss' mode with no enemy config (falls back to the plain single-target
     * behavior every rotation had before this feature). */
    mode?: 'boss' | 'waves';
    waves?: WaveConfig[];
}

/** Saved rotations, keyed by game then rotation id — same shape convention as `loadoutStore`. */
interface RotationState {
    /** byGame[gameId][rotationId] = SavedRotation */
    byGame: Record<string, Record<string, SavedRotation>>;
    save: (gameId: string, rotation: SavedRotation) => void;
    remove: (gameId: string, rotationId: string) => void;
    list: (gameId: string) => SavedRotation[];
}

export const useRotationStore = create<RotationState>()(
    persist(
        (set, get) => ({
            byGame: {},
            save: (gameId, rotation) => set((s) => ({
                byGame: { ...s.byGame, [gameId]: { ...s.byGame[gameId], [rotation.id]: rotation } },
            })),
            remove: (gameId, rotationId) => set((s) => {
                const forGame = { ...s.byGame[gameId] };
                delete forGame[rotationId];
                return { byGame: { ...s.byGame, [gameId]: forGame } };
            }),
            list: (gameId) => Object.values(get().byGame[gameId] ?? {}),
        }),
        { name: 'fm-rotations', storage: createJSONStorage(() => userStorage) }
    )
);
