import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { userStorage } from '../lib/userStorage';

/**
 * A teammate slot in a party (the active character is implicit, not stored
 * here). A teammate's weapon/gear/set is NOT stored here — it always reads
 * that character's own loadout (`loadoutStore`), exactly like inspecting them
 * directly, so a teammate never has a separate hand-picked build.
 */
export interface Teammate {
    id: string;
    characterId: string;
}

/** A party belongs to ONE calc character in ONE game. */
export interface Party {
    teammates: Teammate[];
    /** Effect ids toggled OFF (default: all effects on). */
    disabled: string[];
}

const EMPTY_PARTY: Party = { teammates: [], disabled: [] };

interface PartyState {
    /** byGame[gameId][activeCharacterId] = Party */
    byGame: Record<string, Record<string, Party>>;
    getParty: (gameId: string, charId: string) => Party;
    addTeammate: (gameId: string, charId: string, characterId: string, max: number) => void;
    removeTeammate: (gameId: string, charId: string, teammateId: string) => void;
    setTeammateCharacter: (gameId: string, charId: string, teammateId: string, characterId: string) => void;
    toggleEffect: (gameId: string, charId: string, effectId: string) => void;
}

let seq = 0;
const newId = () => `tm-${Date.now()}-${++seq}`;

const write = (
    byGame: PartyState['byGame'],
    gameId: string,
    charId: string,
    fn: (p: Party) => Party,
): PartyState['byGame'] => {
    const game = byGame[gameId] ?? {};
    const current = game[charId] ?? EMPTY_PARTY;
    return { ...byGame, [gameId]: { ...game, [charId]: fn(current) } };
};

export const usePartyStore = create<PartyState>()(
    persist(
        (set, get) => ({
            byGame: {},
            getParty: (gameId, charId) => get().byGame[gameId]?.[charId] ?? EMPTY_PARTY,

            addTeammate: (gameId, charId, characterId, max) => set((s) => ({
                byGame: write(s.byGame, gameId, charId, (p) =>
                    p.teammates.length >= max
                        ? p
                        : { ...p, teammates: [...p.teammates, { id: newId(), characterId }] }),
            })),
            removeTeammate: (gameId, charId, teammateId) => set((s) => ({
                byGame: write(s.byGame, gameId, charId, (p) => ({ ...p, teammates: p.teammates.filter((t) => t.id !== teammateId) })),
            })),
            setTeammateCharacter: (gameId, charId, teammateId, characterId) => set((s) => ({
                byGame: write(s.byGame, gameId, charId, (p) => ({
                    ...p,
                    teammates: p.teammates.map((t) => (t.id === teammateId ? { ...t, characterId } : t)),
                })),
            })),
            toggleEffect: (gameId, charId, effectId) => set((s) => ({
                byGame: write(s.byGame, gameId, charId, (p) => ({
                    ...p,
                    disabled: p.disabled.includes(effectId)
                        ? p.disabled.filter((id) => id !== effectId)
                        : [...p.disabled, effectId],
                })),
            })),
        }),
        { name: 'fm-party', storage: createJSONStorage(() => userStorage) }
    )
);
