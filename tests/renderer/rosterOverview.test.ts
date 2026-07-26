import { averageRollPct, sortRows, type RosterRow } from '../../src/renderer/src/lib/rosterOverview';
import { WW_GEAR_CATALOG } from '../../shared/game-data/gear-catalogs';
import type { GameData, GearData } from '../../src/renderer/src/data/gameData';

const data = { gearCatalog: WW_GEAR_CATALOG } as GameData;

describe('averageRollPct', () => {
    it('returns 0 for a character with no equipped gear', () => {
        expect(averageRollPct([], data)).toBe(0);
    });

    it('averages rollPct across multiple pieces', () => {
        const gear = [
            { rarity: 5, subStats: [{ key: 'atkPct', value: 11.6 }] }, // 100%
            { rarity: 5, subStats: [{ key: 'atkPct', value: 5.8 }] }, // 50%
        ] as GearData[];
        expect(averageRollPct(gear, data)).toBeCloseTo(75, 1);
    });
});

function row(name: string, stat: number, roll: number): RosterRow {
    return { character: { name } as RosterRow['character'], stats: { atk: stat }, avgRollPct: roll, gearCount: 1 };
}

describe('sortRows', () => {
    const rows = [row('B', 100, 50), row('A', 300, 90), row('C', 200, 70)];

    it('returns rows unchanged when no sort key is set', () => {
        expect(sortRows(rows, null, 'desc')).toEqual(rows);
    });

    it('sorts by a stat key, descending', () => {
        const sorted = sortRows(rows, 'atk', 'desc');
        expect(sorted.map((r) => r.character.name)).toEqual(['A', 'C', 'B']);
    });

    it('sorts by a stat key, ascending', () => {
        const sorted = sortRows(rows, 'atk', 'asc');
        expect(sorted.map((r) => r.character.name)).toEqual(['B', 'C', 'A']);
    });

    it('sorts by avgRollPct', () => {
        expect(sortRows(rows, 'avgRollPct', 'desc').map((r) => r.character.name)).toEqual(['A', 'C', 'B']);
    });

    it('sorts by character name alphabetically', () => {
        expect(sortRows(rows, 'name', 'asc').map((r) => r.character.name)).toEqual(['A', 'B', 'C']);
    });

    it('does not mutate the original array', () => {
        const copy = [...rows];
        sortRows(rows, 'atk', 'desc');
        expect(rows).toEqual(copy);
    });
});
