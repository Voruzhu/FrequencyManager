/**
 * @fileoverview Export/import/clear ONE game's owned data — the inventory,
 * loadouts, sequences, party setups, and saved rotations that live in
 * `byGame[gameId]` slices across 5 separate zustand stores. Distinct from
 * Settings > Data's existing full-app backup (every store, every game, plus
 * settings/theme/etc.) — this is scoped to a single game, for a user who
 * wants to back up or reset just their Wuthering Waves (or just their
 * Genshin) data without touching anything else.
 */
import { useInventoryStore, type Inventory } from '../stores/inventoryStore';
import { useLoadoutStore, type CharacterLoadout } from '../stores/loadoutStore';
import { useSequenceStore } from '../stores/sequenceStore';
import { usePartyStore, type Party } from '../stores/partyStore';
import { useRotationStore, type SavedRotation } from '../stores/rotationStore';
import { useCalcStore } from '../stores/calcStore';

export interface GameDataPayload {
    inventory?: Inventory;
    loadouts?: Record<string, CharacterLoadout>;
    sequences?: Record<string, number>;
    party?: Record<string, Party>;
    rotations?: Record<string, SavedRotation>;
}

export interface GameDataEnvelope {
    schemaVersion: '1.0';
    kind: 'frequency-manager-game-data';
    gameId: string;
    gameLabel: string;
    exportedAt: string;
    app: string;
    data: GameDataPayload;
}

/** Counts used for both the export summary and the cleanup confirmation. */
export interface GameDataCounts {
    characters: number;
    weapons: number;
    gear: number;
    loadouts: number;
    partySetups: number;
    rotations: number;
}

export function gameDataCounts(gameId: string): GameDataCounts {
    const inv = useInventoryStore.getState().byGame[gameId];
    return {
        characters: inv?.characterIds.length ?? 0,
        weapons: inv?.weaponIds.length ?? 0,
        gear: inv?.gear.length ?? 0,
        loadouts: Object.keys(useLoadoutStore.getState().byGame[gameId] ?? {}).length,
        partySetups: Object.keys(usePartyStore.getState().byGame[gameId] ?? {}).length,
        rotations: Object.keys(useRotationStore.getState().byGame[gameId] ?? {}).length,
    };
}

export function exportGameData(gameId: string, gameLabel: string, appVersion: string): GameDataEnvelope {
    return {
        schemaVersion: '1.0',
        kind: 'frequency-manager-game-data',
        gameId,
        gameLabel,
        exportedAt: new Date().toISOString(),
        app: `frequency-manager@${appVersion}`,
        data: {
            inventory: useInventoryStore.getState().byGame[gameId],
            loadouts: useLoadoutStore.getState().byGame[gameId],
            sequences: useSequenceStore.getState().byGame[gameId],
            party: usePartyStore.getState().byGame[gameId],
            rotations: useRotationStore.getState().byGame[gameId],
        },
    };
}

/** Overwrites `gameId`'s slice in each of the 5 stores with the payload's data. Fields absent from the payload are left untouched (not wiped). */
export function importGameData(gameId: string, data: GameDataPayload): void {
    if (data.inventory !== undefined) {
        useInventoryStore.setState((s) => ({ byGame: { ...s.byGame, [gameId]: data.inventory! } }));
    }
    if (data.loadouts !== undefined) {
        useLoadoutStore.setState((s) => ({ byGame: { ...s.byGame, [gameId]: data.loadouts! } }));
    }
    if (data.sequences !== undefined) {
        useSequenceStore.setState((s) => ({ byGame: { ...s.byGame, [gameId]: data.sequences! } }));
    }
    if (data.party !== undefined) {
        usePartyStore.setState((s) => ({ byGame: { ...s.byGame, [gameId]: data.party! } }));
    }
    if (data.rotations !== undefined) {
        useRotationStore.setState((s) => ({ byGame: { ...s.byGame, [gameId]: data.rotations! } }));
    }
}

/**
 * Wipes `gameId`'s slice from all 5 stores — owned characters/weapons/gear,
 * every character's equipped loadout, saved sequences, party setups, and
 * rotations. Also resets the Calculator's current working build
 * (`calcStore`), since it isn't itself game-scoped and would otherwise keep
 * pointing at a characterId/gearIds that no longer exist. Callers are
 * responsible for confirming with the user first — this doesn't ask.
 */
export function clearGameData(gameId: string): void {
    const dropKey = <T,>(byGame: Record<string, T>): Record<string, T> => {
        const next = { ...byGame };
        delete next[gameId];
        return next;
    };
    useInventoryStore.setState((s) => ({ byGame: dropKey(s.byGame) }));
    useLoadoutStore.setState((s) => ({ byGame: dropKey(s.byGame) }));
    useSequenceStore.setState((s) => ({ byGame: dropKey(s.byGame) }));
    usePartyStore.setState((s) => ({ byGame: dropKey(s.byGame) }));
    useRotationStore.setState((s) => ({ byGame: dropKey(s.byGame) }));
    useCalcStore.setState({ characterId: '', equipped: { gearIds: [] }, results: null });
}
