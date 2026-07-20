// zustand's `persist` middleware (used by every store this module touches)
// reads `window` at storage-access time, not just in a browser DOM — under
// Jest's `node` test environment there is no `window` global at all, so it
// must be stubbed before the stores are imported (matches `userStorage.ts`'s
// own documented "falls back to localStorage when the bridge is unavailable
// (dev-in-browser)" — here there's neither, so it falls all the way through
// to the try/catch no-op).
(global as unknown as { window: unknown }).window = {};

import { useInventoryStore } from '../../src/renderer/src/stores/inventoryStore';
import { useLoadoutStore } from '../../src/renderer/src/stores/loadoutStore';
import { useSequenceStore } from '../../src/renderer/src/stores/sequenceStore';
import { usePartyStore } from '../../src/renderer/src/stores/partyStore';
import { useRotationStore } from '../../src/renderer/src/stores/rotationStore';
import { useCalcStore } from '../../src/renderer/src/stores/calcStore';
import { gameDataCounts, exportGameData, importGameData, clearGameData } from '../../src/renderer/src/lib/gameDataBackup';

const GAME = 'wuthering-waves';
const OTHER_GAME = 'genshin-impact';

function seed() {
    useInventoryStore.setState({
        byGame: {
            [GAME]: { characterIds: ['jinhsi'], weaponIds: ['w1'], gear: [{ kind: 'echo', id: 'g1', name: 'Thundering Mephis', setName: 'Void Thunder', rarity: 5, mainStat: { key: 'atk', label: 'ATK', value: 1 }, subStats: [] }] },
            [OTHER_GAME]: { characterIds: ['other-char'], weaponIds: [], gear: [] },
        },
    });
    useLoadoutStore.setState({ byGame: { [GAME]: { jinhsi: { weaponId: 'w1', gearIds: ['g1'] } }, [OTHER_GAME]: { x: { gearIds: [] } } } });
    useSequenceStore.setState({ byGame: { [GAME]: { jinhsi: 2 }, [OTHER_GAME]: { x: 0 } } });
    usePartyStore.setState({ byGame: { [GAME]: { jinhsi: { teammates: [], disabled: [] } }, [OTHER_GAME]: {} } });
    useRotationStore.setState({ byGame: { [GAME]: { r1: { id: 'r1', name: 'Rot', partyId: 'p1', steps: [], enabledSelfBuffIds: {} } }, [OTHER_GAME]: {} } });
    useCalcStore.setState({ characterId: 'jinhsi', equipped: { weaponId: 'w1', gearIds: ['g1'] }, results: [{}] as never });
}

describe('gameDataBackup — export/import/clear scoped to ONE game', () => {
    beforeEach(() => {
        seed();
    });

    it('gameDataCounts reflects only the target game, not other games', () => {
        expect(gameDataCounts(GAME)).toEqual({ characters: 1, weapons: 1, gear: 1, loadouts: 1, partySetups: 1, rotations: 1 });
        expect(gameDataCounts(OTHER_GAME)).toEqual({ characters: 1, weapons: 0, gear: 0, loadouts: 1, partySetups: 0, rotations: 0 });
        expect(gameDataCounts('never-seen-game')).toEqual({ characters: 0, weapons: 0, gear: 0, loadouts: 0, partySetups: 0, rotations: 0 });
    });

    it('exportGameData captures exactly this game\'s slice from all 5 stores, tagged with its gameId', () => {
        const envelope = exportGameData(GAME, 'Wuthering Waves', '1.2.3');
        expect(envelope.kind).toBe('frequency-manager-game-data');
        expect(envelope.gameId).toBe(GAME);
        expect(envelope.gameLabel).toBe('Wuthering Waves');
        expect(envelope.app).toBe('frequency-manager@1.2.3');
        expect(envelope.data.inventory?.characterIds).toEqual(['jinhsi']);
        expect(envelope.data.loadouts?.jinhsi).toEqual({ weaponId: 'w1', gearIds: ['g1'] });
        expect(envelope.data.sequences?.jinhsi).toBe(2);
        expect(envelope.data.rotations?.r1?.name).toBe('Rot');
    });

    it('importGameData overwrites only the target game\'s slice, leaving other games untouched', () => {
        const incoming = {
            inventory: { characterIds: ['calcharo'], weaponIds: [], gear: [] },
            loadouts: {},
            sequences: {},
            party: {},
            rotations: {},
        };
        importGameData(GAME, incoming);
        expect(useInventoryStore.getState().byGame[GAME].characterIds).toEqual(['calcharo']);
        // Other game's data must survive untouched.
        expect(useInventoryStore.getState().byGame[OTHER_GAME].characterIds).toEqual(['other-char']);
    });

    it('importGameData leaves a field untouched when the payload omits it', () => {
        importGameData(GAME, { inventory: { characterIds: ['calcharo'], weaponIds: [], gear: [] } });
        expect(useInventoryStore.getState().byGame[GAME].characterIds).toEqual(['calcharo']);
        // loadouts wasn't in the payload — untouched.
        expect(useLoadoutStore.getState().byGame[GAME].jinhsi).toEqual({ weaponId: 'w1', gearIds: ['g1'] });
    });

    it('clearGameData wipes the target game from all 5 stores and resets the working calc build, but leaves other games alone', () => {
        clearGameData(GAME);
        expect(useInventoryStore.getState().byGame[GAME]).toBeUndefined();
        expect(useLoadoutStore.getState().byGame[GAME]).toBeUndefined();
        expect(useSequenceStore.getState().byGame[GAME]).toBeUndefined();
        expect(usePartyStore.getState().byGame[GAME]).toBeUndefined();
        expect(useRotationStore.getState().byGame[GAME]).toBeUndefined();
        expect(useCalcStore.getState().characterId).toBe('');
        expect(useCalcStore.getState().equipped).toEqual({ gearIds: [] });
        expect(useCalcStore.getState().results).toBeNull();

        expect(useInventoryStore.getState().byGame[OTHER_GAME].characterIds).toEqual(['other-char']);
        expect(useLoadoutStore.getState().byGame[OTHER_GAME]).toBeDefined();
    });
});
