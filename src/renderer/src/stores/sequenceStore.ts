import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { userStorage } from '../lib/userStorage';

/**
 * Per-character Constellation/Sequence level, keyed by game then character id —
 * same shape/purpose as `loadoutStore`'s per-character build. Without this, a
 * character's unlocked level only lived in `calcStore.sequence`, which resets
 * to 0 every time a different character is picked as active, AND a Party
 * teammate (who is never the active character) had no level at all — so a
 * teammate's constellation/sequence TEAM buffs (e.g. Bennett's C6 Pyro
 * infusion + DMG Bonus) could never deploy in Party Setup no matter what the
 * user actually has Bennett built to. This store fixes both: the active
 * character's level now persists across switches, and each teammate's level
 * is readable independently via `getSequence`.
 */
interface SequenceState {
    /** byGame[gameId][characterId] = level (0-6) */
    byGame: Record<string, Record<string, number>>;
    getSequence: (gameId: string, characterId: string) => number;
    setSequence: (gameId: string, characterId: string, level: number) => void;
}

export const useSequenceStore = create<SequenceState>()(
    persist(
        (set, get) => ({
            byGame: {},
            getSequence: (gameId, characterId) => get().byGame[gameId]?.[characterId] ?? 0,
            setSequence: (gameId, characterId, level) => set((s) => ({
                byGame: { ...s.byGame, [gameId]: { ...s.byGame[gameId], [characterId]: Math.max(0, Math.min(6, level)) } },
            })),
        }),
        { name: 'fm-sequences', storage: createJSONStorage(() => userStorage) }
    )
);
