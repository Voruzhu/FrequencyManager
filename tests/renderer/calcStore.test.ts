import { computeEquippedGearIds, isGearAtCapacity } from '../../src/renderer/src/stores/calcStore';
import { useInventoryStore } from '../../src/renderer/src/stores/inventoryStore';
import type { GearEntry } from '../../shared/types/game-bundle';

const WW = 'wuthering-waves';
const GI = 'genshin-impact';

function seed(gameId: string, gear: GearEntry[]) {
    for (const g of gear) useInventoryStore.getState().addGear(gameId, g);
}

function echo(id: string, cost?: number): GearEntry {
    return { kind: 'echo', id, name: id, setName: 'Test Set', rarity: 5, mainStat: { key: 'atk', label: 'ATK', value: 100 }, subStats: [], ...(cost != null ? { cost } : {}) };
}

function artifact(id: string, slot: string): GearEntry {
    return { kind: 'artifact', id, name: id, setName: 'Test Set', rarity: 5, slot, mainStat: { key: 'atk', label: 'ATK', value: 100 }, subStats: [] };
}

describe('computeEquippedGearIds / isGearAtCapacity', () => {
    afterEach(() => {
        useInventoryStore.setState({ byGame: {} });
    });

    it('a plain add (room available) is accepted, not at capacity', () => {
        seed(WW, [echo('e1', 3), echo('e2', 1)]);
        const result = computeEquippedGearIds(WW, ['e1'], 'e2');
        expect(result).toEqual(['e1', 'e2']);
        expect(isGearAtCapacity(WW, ['e1'], 'e2')).toBe(false);
    });

    // CORRECTED 2026-07-25 — this used to assert equipping a 2nd cost-4 echo
    // auto-swapped out the first, on the wrong belief that only one of WW's
    // 5 slots could ever hold a cost-4 piece. WW's echo system has no
    // per-slot cost ceiling at all (see withinCostBudget's doc comment in
    // shared/calc/optimizer.ts for the real-source sourcing) — a 2nd cost-4
    // piece is a plain, ordinary add, same as any other gear, up to the
    // 5-piece cap. Only ONE of them can ever be the "main slot" echo and
    // get its bonus (see mainSlotEchoId), but that's a separate, explicit
    // choice (mainSlotGearId), not an equip-time exclusivity rule.
    it('WW: equipping a 2nd cost-4 echo is a plain add — both stay equipped', () => {
        seed(WW, [echo('cost4-a', 4), echo('cost4-b', 4)]);
        const result = computeEquippedGearIds(WW, ['cost4-a'], 'cost4-b');
        expect(result).toEqual(['cost4-a', 'cost4-b']);
        expect(isGearAtCapacity(WW, ['cost4-a'], 'cost4-b')).toBe(false);
    });

    it('GI: equipping a different piece into an already-occupied slot swaps it out — not a capacity refusal', () => {
        seed(GI, [artifact('flowerA', 'flower'), artifact('flowerB', 'flower')]);
        const result = computeEquippedGearIds(GI, ['flowerA'], 'flowerB');
        expect(result).toEqual(['flowerB']);
        expect(isGearAtCapacity(GI, ['flowerA'], 'flowerB')).toBe(false);
    });

    it('a genuine refusal (5 non-conflicting pieces already equipped) leaves gearIds unchanged and reports at capacity', () => {
        const current = [echo('a', 1), echo('b', 1), echo('c', 1), echo('d', 1), echo('e', 1)];
        seed(WW, [...current, echo('f', 1)]);
        const currentIds = current.map((g) => g.id);
        const result = computeEquippedGearIds(WW, currentIds, 'f');
        expect(result).toEqual(currentIds);
        expect(isGearAtCapacity(WW, currentIds, 'f')).toBe(true);
    });
});
