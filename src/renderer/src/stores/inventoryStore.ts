import { useMemo } from 'react';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { GearEntry, CharacterEntry, WeaponEntry } from '@shared/types/game-bundle';
import { userStorage } from '../lib/userStorage';
import { getGameData, useGameData } from '../data/gameData';

/**
 * The user's owned items for one game. Characters/weapons are referenced by id
 * into the game catalog (full data lives there); gear are self-contained
 * user-created instances (their `id` is a unique instance id).
 */
export interface Inventory {
    characterIds: string[];
    weaponIds: string[];
    gear: GearEntry[];
}

const EMPTY: Inventory = { characterIds: [], weaponIds: [], gear: [] };

// Gear instances must have a unique `id` — the UI keys expand/highlight/remove off
// it, so a duplicate or missing id makes those operations hit every matching card at
// once (e.g. expanding one artifact expands all, removing one removes all). This mints
// a fresh id that isn't already taken in the same game's inventory.
let gearIdSeq = 0;
function freshGearId(gameId: string, taken: Set<string>): string {
    let id: string;
    do { id = `own-${gameId}-${Date.now()}-${++gearIdSeq}`; } while (taken.has(id));
    return id;
}

interface InventoryState {
    /** Per-game owned inventory. */
    byGame: Record<string, Inventory>;
    /** Seed a game with just its starter character if it has no inventory yet. */
    ensureSeeded: (gameId: string) => void;
    getInventory: (gameId: string) => Inventory;
    addCharacter: (gameId: string, id: string) => void;
    removeCharacter: (gameId: string, id: string) => void;
    addWeapon: (gameId: string, id: string) => void;
    removeWeapon: (gameId: string, id: string) => void;
    addGear: (gameId: string, gear: GearEntry) => void;
    removeGear: (gameId: string, instanceId: string) => void;
    /** Replace an already-owned gear instance's stats in place (same `id` —
     * so it stays equipped wherever it already was, unlike remove+re-add). */
    updateGear: (gameId: string, gear: GearEntry) => void;
}

const update = (
    byGame: Record<string, Inventory>,
    gameId: string,
    fn: (inv: Inventory) => Inventory,
): Record<string, Inventory> => ({
    ...byGame,
    [gameId]: fn(byGame[gameId] ?? EMPTY),
});

export const useInventoryStore = create<InventoryState>()(
    persist(
        (set, get) => ({
            byGame: {},

            ensureSeeded: (gameId) => {
                if (get().byGame[gameId]) return;
                const starter = getGameData(gameId).starterCharacterId;
                set((s) => ({
                    byGame: { ...s.byGame, [gameId]: { characterIds: starter ? [starter] : [], weaponIds: [], gear: [] } },
                }));
            },

            getInventory: (gameId) => get().byGame[gameId] ?? EMPTY,

            addCharacter: (gameId, id) => set((s) => ({
                byGame: update(s.byGame, gameId, (inv) =>
                    inv.characterIds.includes(id) ? inv : { ...inv, characterIds: [...inv.characterIds, id] }),
            })),
            removeCharacter: (gameId, id) => set((s) => ({
                byGame: update(s.byGame, gameId, (inv) => ({ ...inv, characterIds: inv.characterIds.filter((c) => c !== id) })),
            })),
            addWeapon: (gameId, id) => set((s) => ({
                byGame: update(s.byGame, gameId, (inv) =>
                    inv.weaponIds.includes(id) ? inv : { ...inv, weaponIds: [...inv.weaponIds, id] }),
            })),
            removeWeapon: (gameId, id) => set((s) => ({
                byGame: update(s.byGame, gameId, (inv) => ({ ...inv, weaponIds: inv.weaponIds.filter((w) => w !== id) })),
            })),
            addGear: (gameId, gear) => set((s) => ({
                byGame: update(s.byGame, gameId, (inv) => {
                    const taken = new Set(inv.gear.map((g) => g.id));
                    const id = !gear.id || taken.has(gear.id) ? freshGearId(gameId, taken) : gear.id;
                    return { ...inv, gear: [...inv.gear, { ...gear, id }] };
                }),
            })),
            removeGear: (gameId, instanceId) => set((s) => ({
                byGame: update(s.byGame, gameId, (inv) => ({ ...inv, gear: inv.gear.filter((g) => g.id !== instanceId) })),
            })),
            updateGear: (gameId, gear) => set((s) => ({
                byGame: update(s.byGame, gameId, (inv) => ({ ...inv, gear: inv.gear.map((g) => (g.id === gear.id ? gear : g)) })),
            })),
        }),
        {
            name: 'fm-inventory',
            storage: createJSONStorage(() => userStorage),
            version: 2,
            migrate: (persisted, version) => {
                let s = persisted as InventoryState | undefined;
                if (!s?.byGame) return s;
                // v0→v1: guarantee unique gear ids for any legacy inventory (older
                // builds could mint colliding/blank ids, which made the gear list
                // expand/remove all matching cards at once). Reassign only where
                // duplicate or missing.
                if (version < 1) {
                    for (const gid of Object.keys(s.byGame)) {
                        const seen = new Set<string>();
                        s.byGame[gid] = {
                            ...s.byGame[gid],
                            gear: (s.byGame[gid].gear ?? []).map((g) => {
                                const id = !g.id || seen.has(g.id) ? freshGearId(gid, seen) : g.id;
                                seen.add(id);
                                return { ...g, id };
                            }),
                        };
                    }
                }
                // v1→v2: every gear entry's `icon` was wrongly set to its SET's
                // icon at creation time (no per-item icon art has ever existed in
                // this app) — `ItemIcon` then showed that same set icon a second
                // time as the corner badge, a visible duplicate. Clear it so the
                // set icon renders once, as the main icon, with no badge.
                if (version < 2) {
                    for (const gid of Object.keys(s.byGame)) {
                        s.byGame[gid] = {
                            ...s.byGame[gid],
                            gear: (s.byGame[gid].gear ?? []).map(({ icon: _icon, ...g }) => g),
                        };
                    }
                }
                return s;
            },
        }
    )
);

/**
 * Resolved owned items for a game: characters/weapons hydrated from the catalog,
 * gear as their stored instances. Reactive to inventory changes.
 */
export function useOwnedInventory(gameId: string): {
    characters: CharacterEntry[];
    weapons: WeaponEntry[];
    gear: GearEntry[];
} {
    const inv = useInventoryStore((s) => s.byGame[gameId]);
    const data = useGameData(gameId); // reactive to the backend bundle
    return useMemo(() => {
        const i = inv ?? EMPTY;
        return {
            characters: i.characterIds
                .map((id) => data.characters.find((c) => c.id === id))
                .filter(Boolean) as CharacterEntry[],
            weapons: i.weaponIds
                .map((id) => data.weapons.find((w) => w.id === id))
                .filter(Boolean) as WeaponEntry[],
            gear: i.gear,
        };
    }, [inv, data]);
}
