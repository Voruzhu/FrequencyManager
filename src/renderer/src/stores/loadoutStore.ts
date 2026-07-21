import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { userStorage } from '../lib/userStorage';

/** What a character has equipped: a weapon + up to maxGear pieces of gear. */
export interface CharacterLoadout {
    weaponId?: string;
    /** The equipped weapon's refinement rank (R1-R5). Undefined means R1 — the
     * shipped catalog `selfBuffs` values ARE the R1 baseline, so absent is a
     * safe default, not a missing-data marker. */
    weaponRefine?: number;
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
    /** Strips `gearId` out of every character's `gearIds` for this game — call
     * whenever a gear instance is deleted from inventory. Without this, a
     * removed piece's id lingers in whichever loadout(s) had it equipped:
     * `computeEquippedGearIds`'s slot/cost-exclusivity checks can no longer
     * resolve it to compare against, so it can never be evicted by the normal
     * same-slot/main-slot swap, yet it still counts toward that character's
     * gear cap — permanently jamming one slot until the whole loadout is
     * overwritten wholesale. */
    removeGearEverywhere: (gameId: string, gearId: string) => void;
}

export const useLoadoutStore = create<LoadoutState>()(
    persist(
        (set, get) => ({
            byGame: {},
            getLoadout: (gameId, characterId) => get().byGame[gameId]?.[characterId] ?? EMPTY_LOADOUT,
            setLoadout: (gameId, characterId, loadout) => set((s) => ({
                byGame: { ...s.byGame, [gameId]: { ...s.byGame[gameId], [characterId]: loadout } },
            })),
            removeGearEverywhere: (gameId, gearId) => set((s) => {
                const forGame = s.byGame[gameId];
                if (!forGame) return s;
                let changed = false;
                const next: Record<string, CharacterLoadout> = {};
                for (const [characterId, loadout] of Object.entries(forGame)) {
                    if (loadout.gearIds.includes(gearId)) {
                        changed = true;
                        next[characterId] = { ...loadout, gearIds: loadout.gearIds.filter((g) => g !== gearId) };
                    } else {
                        next[characterId] = loadout;
                    }
                }
                return changed ? { byGame: { ...s.byGame, [gameId]: next } } : s;
            }),
        }),
        { name: 'fm-loadouts', storage: createJSONStorage(() => userStorage) }
    )
);
