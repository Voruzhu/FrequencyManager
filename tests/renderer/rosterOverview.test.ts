import { averageRollPct, averageSkillDamage, sortRows, type RosterRow } from '../../src/renderer/src/lib/rosterOverview';
import { WW_GEAR_CATALOG } from '../../shared/game-data/gear-catalogs';
import type { GameData, GearData } from '../../src/renderer/src/data/gameData';
import type { CharacterEntry } from '../../shared/types/game-bundle';
import { DUMMY } from '../../src/renderer/src/data/enemies';

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
    return { character: { name } as RosterRow['character'], stats: { atk: stat }, avgRollPct: roll, avgSkillDmg: 0, gearCount: 1 };
}

describe('averageSkillDamage', () => {
    function char(): CharacterEntry {
        return {
            kind: 'character', id: 'test', name: 'Test', element: 'Spectro', weaponType: 'Sword', rarity: 5,
            stats: { atk: 1000, hp: 10000, def: 500 },
            skills: [
                { id: 'basic', name: 'Basic Attack', type: 'Basic', multiplier: 1, description: '' },
                { id: 'skill', name: 'Resonance Skill', type: 'Skill', multiplier: 3, description: '' },
            ],
            equipped: { gearIds: [] },
        };
    }

    it('averages skillDamage across every skill using the character\'s own solo stats', () => {
        const stats = { atk: 1000, critRate: 0, critDmg: 0 };
        const result = averageSkillDamage(char(), stats, [], [], DUMMY);
        // DUMMY has 0 def/0 res -> no mitigation; average mode with 0% crit rate -> no crit bonus.
        // basic: 1000*1 = 1000, skill: 1000*3 = 3000 -> avg 2000.
        expect(result).toBeCloseTo(2000, 0);
    });

    it('returns 0 for a character with no skills at all', () => {
        const noSkills = { ...char(), skills: [] };
        expect(averageSkillDamage(noSkills, { atk: 1000 }, [], [], DUMMY)).toBe(0);
    });

    it('higher enemy RES lowers the result', () => {
        const stats = { atk: 1000, critRate: 0, critDmg: 0 };
        const tanky = { ...DUMMY, res: 50 };
        expect(averageSkillDamage(char(), stats, [], [], tanky)).toBeLessThan(averageSkillDamage(char(), stats, [], [], DUMMY));
    });
});

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
