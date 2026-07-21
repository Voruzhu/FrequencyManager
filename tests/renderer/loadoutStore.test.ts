import { useLoadoutStore } from '../../src/renderer/src/stores/loadoutStore';
import { useInventoryStore } from '../../src/renderer/src/stores/inventoryStore';
import type { GearEntry } from '../../shared/types/game-bundle';

const WW = 'wuthering-waves';

function echo(id: string, cost?: number): GearEntry {
    return { kind: 'echo', id, name: id, setName: 'Test Set', rarity: 5, mainStat: { key: 'atk', label: 'ATK', value: 100 }, subStats: [], ...(cost != null ? { cost } : {}) };
}

describe('loadoutStore.removeGearEverywhere', () => {
    afterEach(() => {
        useLoadoutStore.setState({ byGame: {} });
        useInventoryStore.setState({ byGame: {} });
    });

    it('strips the gear id out of every character that had it equipped', () => {
        useLoadoutStore.getState().setLoadout(WW, 'charA', { gearIds: ['e1', 'e2'] });
        useLoadoutStore.getState().setLoadout(WW, 'charB', { gearIds: ['e1', 'e3'] });
        useLoadoutStore.getState().removeGearEverywhere(WW, 'e1');
        expect(useLoadoutStore.getState().getLoadout(WW, 'charA').gearIds).toEqual(['e2']);
        expect(useLoadoutStore.getState().getLoadout(WW, 'charB').gearIds).toEqual(['e3']);
    });

    it('leaves loadouts that never had the id untouched (same object reference, no unnecessary re-render)', () => {
        const untouched = { gearIds: ['e5'] };
        useLoadoutStore.setState({ byGame: { [WW]: { charC: untouched } } });
        useLoadoutStore.getState().removeGearEverywhere(WW, 'e1');
        expect(useLoadoutStore.getState().getLoadout(WW, 'charC')).toBe(untouched);
    });

    it('is a no-op for a game with no loadouts at all', () => {
        expect(() => useLoadoutStore.getState().removeGearEverywhere('genshin-impact', 'e1')).not.toThrow();
    });

    it('regression: inventoryStore.removeGear no longer leaves a ghost-equipped id that jams the main-slot swap', () => {
        useInventoryStore.getState().addGear(WW, echo('cost4-a', 4));
        useInventoryStore.getState().addGear(WW, echo('cost4-b', 4));
        useLoadoutStore.getState().setLoadout(WW, 'charA', { gearIds: ['cost4-a'] });

        useInventoryStore.getState().removeGear(WW, 'cost4-a');

        // Before the fix, 'cost4-a' would still be present here — unresolvable
        // by `computeEquippedGearIds` (gone from inventory), so it could never
        // be evicted by the cost-4 main-slot swap, permanently occupying a slot.
        expect(useLoadoutStore.getState().getLoadout(WW, 'charA').gearIds).toEqual([]);
    });
});
