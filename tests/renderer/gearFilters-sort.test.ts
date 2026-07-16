import { sortGear, sortableStatOptions, DEFAULT_GEAR_FILTERS } from '../../src/renderer/src/lib/gearFilters';
import { WW_GEAR_CATALOG } from '../../shared/game-data/gear-catalogs';
import type { GearEntry } from '../../shared/types/game-bundle';

let seq = 0;
function gear(overrides: Partial<GearEntry> & { mainStat?: GearEntry['mainStat']; subStats?: GearEntry['subStats'] } = {}): GearEntry {
    return {
        kind: 'echo', id: `g${++seq}`, name: 'Test', setName: 'Void Thunder', rarity: 5,
        mainStat: { key: 'atk', label: 'ATK', value: 100 },
        subStats: [],
        ...overrides,
    };
}

describe('sortGear', () => {
    it('is a no-op (preserves input order) when sortStat is "none"', () => {
        const list = [gear({ id: 'a' }), gear({ id: 'b' })];
        expect(sortGear(list, { sortStat: 'none', sortDir: 'desc' })).toEqual(list);
    });

    it('sorts descending (highest first) by a MAIN stat value', () => {
        const low = gear({ id: 'low', mainStat: { key: 'critRate', label: 'Crit Rate', value: 6.3 } });
        const high = gear({ id: 'high', mainStat: { key: 'critRate', label: 'Crit Rate', value: 10.5 } });
        const result = sortGear([low, high], { sortStat: 'critRate', sortDir: 'desc' });
        expect(result.map((g) => g.id)).toEqual(['high', 'low']);
    });

    it('sorts ascending (lowest first) when asked', () => {
        const low = gear({ id: 'low', mainStat: { key: 'critRate', label: 'Crit Rate', value: 6.3 } });
        const high = gear({ id: 'high', mainStat: { key: 'critRate', label: 'Crit Rate', value: 10.5 } });
        const result = sortGear([low, high], { sortStat: 'critRate', sortDir: 'asc' });
        expect(result.map((g) => g.id)).toEqual(['low', 'high']);
    });

    it('reads a SUB-stat value when the piece\'s main stat is something else', () => {
        const a = gear({ id: 'a', mainStat: { key: 'atk', label: 'ATK', value: 100 }, subStats: [{ key: 'critDmg', label: 'Crit DMG', value: 30 }] });
        const b = gear({ id: 'b', mainStat: { key: 'atk', label: 'ATK', value: 100 }, subStats: [{ key: 'critDmg', label: 'Crit DMG', value: 10 }] });
        const result = sortGear([a, b], { sortStat: 'critDmg', sortDir: 'desc' });
        expect(result.map((g) => g.id)).toEqual(['a', 'b']);
    });

    it('sorts pieces that don\'t carry the sort stat at all to the END, regardless of direction', () => {
        const has = gear({ id: 'has', mainStat: { key: 'critRate', label: 'Crit Rate', value: 8 } });
        const doesNotHave = gear({ id: 'none', mainStat: { key: 'atk', label: 'ATK', value: 100 }, subStats: [] });
        expect(sortGear([doesNotHave, has], { sortStat: 'critRate', sortDir: 'desc' }).map((g) => g.id)).toEqual(['has', 'none']);
        expect(sortGear([doesNotHave, has], { sortStat: 'critRate', sortDir: 'asc' }).map((g) => g.id)).toEqual(['has', 'none']);
    });
});

describe('sortableStatOptions', () => {
    it('merges main + sub stat catalogs, deduped by key, for a real game catalog', () => {
        const opts = sortableStatOptions({ gearCatalog: WW_GEAR_CATALOG });
        const keys = opts.map((o) => o.key);
        expect(new Set(keys).size).toBe(keys.length); // no duplicates
        expect(keys).toContain('atk');
        expect(keys).toContain('critRate');
    });
});

describe('DEFAULT_GEAR_FILTERS', () => {
    it('defaults to unsorted, highest-first if a sort is later chosen', () => {
        expect(DEFAULT_GEAR_FILTERS.sortStat).toBe('none');
        expect(DEFAULT_GEAR_FILTERS.sortDir).toBe('desc');
    });
});
