import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { userStorage } from '../lib/userStorage';

const MAX_MEMBERS = 3;

/** A reusable, named party for the Rotation Builder — independent of the
 * Calculator's per-active-character teammate system (`partyStore.ts`),
 * which this does not touch. A member always resolves from their OWN
 * current loadout/Sequence — no loadout is stored here. */
export interface NamedParty {
    id: string;
    name: string;
    memberCharacterIds: string[]; // up to 3; can be saved with fewer
    /** Party-effect ids toggled OFF, same convention as `partyStore.ts`'s `Party.disabled`. */
    disabled: string[];
}

interface NamedPartyState {
    byGame: Record<string, Record<string, NamedParty>>;
    save: (gameId: string, party: NamedParty) => void;
    remove: (gameId: string, partyId: string) => void;
    list: (gameId: string) => NamedParty[];
    addMember: (gameId: string, partyId: string, characterId: string) => void;
    removeMember: (gameId: string, partyId: string, characterId: string) => void;
    toggleEffect: (gameId: string, partyId: string, effectId: string) => void;
}

const write = (
    byGame: NamedPartyState['byGame'],
    gameId: string,
    partyId: string,
    fn: (p: NamedParty) => NamedParty,
): NamedPartyState['byGame'] => {
    const game = byGame[gameId] ?? {};
    const current = game[partyId];
    if (!current) return byGame;
    return { ...byGame, [gameId]: { ...game, [partyId]: fn(current) } };
};

export const useNamedPartyStore = create<NamedPartyState>()(
    persist(
        (set, get) => ({
            byGame: {},
            save: (gameId, party) => set((s) => ({
                byGame: { ...s.byGame, [gameId]: { ...s.byGame[gameId], [party.id]: party } },
            })),
            remove: (gameId, partyId) => set((s) => {
                const forGame = { ...s.byGame[gameId] };
                delete forGame[partyId];
                return { byGame: { ...s.byGame, [gameId]: forGame } };
            }),
            list: (gameId) => Object.values(get().byGame[gameId] ?? {}),
            addMember: (gameId, partyId, characterId) => set((s) => ({
                byGame: write(s.byGame, gameId, partyId, (p) =>
                    p.memberCharacterIds.length >= MAX_MEMBERS || p.memberCharacterIds.includes(characterId)
                        ? p
                        : { ...p, memberCharacterIds: [...p.memberCharacterIds, characterId] }),
            })),
            removeMember: (gameId, partyId, characterId) => set((s) => ({
                byGame: write(s.byGame, gameId, partyId, (p) => ({ ...p, memberCharacterIds: p.memberCharacterIds.filter((id) => id !== characterId) })),
            })),
            toggleEffect: (gameId, partyId, effectId) => set((s) => ({
                byGame: write(s.byGame, gameId, partyId, (p) => ({
                    ...p,
                    disabled: p.disabled.includes(effectId) ? p.disabled.filter((id) => id !== effectId) : [...p.disabled, effectId],
                })),
            })),
        }),
        { name: 'fm-named-parties', storage: createJSONStorage(() => userStorage) }
    )
);
