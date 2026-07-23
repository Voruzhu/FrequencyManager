/**
 * @fileoverview Tests for `stores/inventoryStore.ts`'s `addGearBatch` — added
 * so bulk imports (OCR "Auto import from latest", the GOOD-format importer)
 * can commit many gear pieces in ONE store update/disk write instead of one
 * per item. Must behave identically to calling `addGear` once per item,
 * including its id-collision-avoidance guarantee (every owned gear id stays
 * unique — the UI keys expand/remove off it).
 */
import { useInventoryStore } from '../../src/renderer/src/stores/inventoryStore';
import type { GearEntry } from '../../shared/types/game-bundle';

const WW = 'wuthering-waves';

function echo(id: string): GearEntry {
    return { kind: 'echo', id, name: id, setName: 'Test Set', rarity: 5, mainStat: { key: 'atk', label: 'ATK', value: 100 }, subStats: [] };
}

describe('inventoryStore.addGearBatch', () => {
    afterEach(() => {
        useInventoryStore.setState({ byGame: {} });
    });

    it('adds every item in the batch in a single update', () => {
        useInventoryStore.getState().addGearBatch(WW, [echo('e1'), echo('e2'), echo('e3')]);
        const gear = useInventoryStore.getState().getInventory(WW).gear;
        expect(gear.map((g) => g.id)).toEqual(['e1', 'e2', 'e3']);
    });

    it('appends to existing gear rather than replacing it', () => {
        useInventoryStore.getState().addGear(WW, echo('existing'));
        useInventoryStore.getState().addGearBatch(WW, [echo('new1'), echo('new2')]);
        const gear = useInventoryStore.getState().getInventory(WW).gear;
        expect(gear.map((g) => g.id)).toEqual(['existing', 'new1', 'new2']);
    });

    it('mints a fresh id for a batch item colliding with an already-owned id', () => {
        useInventoryStore.getState().addGear(WW, echo('dup'));
        useInventoryStore.getState().addGearBatch(WW, [echo('dup')]);
        const gear = useInventoryStore.getState().getInventory(WW).gear;
        expect(gear).toHaveLength(2);
        expect(new Set(gear.map((g) => g.id)).size).toBe(2); // both ids unique
    });

    it('mints distinct fresh ids for MULTIPLE colliding items within the same batch', () => {
        // Regression risk: minting fresh ids independently per item (each only
        // checking against inventory-at-batch-start) could hand out the SAME
        // "fresh" id to two different colliding items in one batch.
        useInventoryStore.getState().addGear(WW, echo('dup'));
        useInventoryStore.getState().addGearBatch(WW, [echo('dup'), echo('dup')]);
        const gear = useInventoryStore.getState().getInventory(WW).gear;
        expect(gear).toHaveLength(3);
        expect(new Set(gear.map((g) => g.id)).size).toBe(3); // all three ids unique
    });

    it('is a no-op-safe empty batch', () => {
        useInventoryStore.getState().addGearBatch(WW, []);
        expect(useInventoryStore.getState().getInventory(WW).gear).toEqual([]);
    });
});
