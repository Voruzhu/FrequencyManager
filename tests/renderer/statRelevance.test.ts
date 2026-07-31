import { statRelevance } from '../../src/renderer/src/lib/statRelevance';
import type { CharacterEntry } from '../../shared/types/game-bundle';

function char(overrides: Partial<CharacterEntry> = {}): CharacterEntry {
    return {
        kind: 'character', id: 'c1', name: 'Test', element: 'Havoc', weaponType: 'Sword', rarity: 5,
        stats: { atk: 1000, hp: 10000, def: 500 },
        skills: [{ id: 's1', name: 'Basic', type: 'normal', description: '', multiplier: 1.5 }],
        equipped: { gearIds: [] },
        ...overrides,
    };
}

describe('statRelevance', () => {
    it('the generic elemDmg slot is always high — it dynamically represents this character\'s own element', () => {
        expect(statRelevance(char(), 'elemDmg')).toBe('high');
    });

    it('the character\'s scaling stat is high; defaults to atk when no skill overrides scaling', () => {
        expect(statRelevance(char(), 'atk')).toBe('high');
    });

    it('a character whose skills scale off HP grades hp as high instead of atk', () => {
        const c = char({ skills: [{ id: 's1', name: 'Skill', type: 'normal', description: '', multiplier: 2, scaling: 'hp' }] });
        expect(statRelevance(c, 'hp')).toBe('high');
        expect(statRelevance(c, 'atk')).toBe('medium');
    });

    it('Crit Rate/DMG are high for a normal offensive kit', () => {
        expect(statRelevance(char(), 'critRate')).toBe('high');
        expect(statRelevance(char(), 'critDmg')).toBe('high');
    });

    it('Crit Rate/DMG drop to low, and Healing Bonus becomes high, for a kit with no offensive skills', () => {
        const healer = char({ skills: [{ id: 's1', name: 'Heal', type: 'normal', description: '', multiplier: 0 }] });
        expect(statRelevance(healer, 'critRate')).toBe('low');
        expect(statRelevance(healer, 'critDmg')).toBe('low');
        expect(statRelevance(healer, 'healingBonus')).toBe('high');
    });

    it('Healing Bonus is low for a normal offensive kit', () => {
        expect(statRelevance(char(), 'healingBonus')).toBe('low');
    });

    it('Elemental Mastery is high only when a self/team buff actually scales off it', () => {
        expect(statRelevance(char(), 'elementalMastery')).toBe('medium');
        const emChar = char({ selfBuffs: [{ stat: 'dmgBonus', label: 'x', value: 10, scaleOff: { sourceStat: 'elementalMastery', basis: 'total', ratio: 0.01 } }] });
        expect(statRelevance(emChar, 'elementalMastery')).toBe('high');
    });

    it('a WW scoped attack-type DMG stat is high when it matches the character\'s own highest-multiplier skill type', () => {
        const c = char({ skills: [
            { id: 's1', name: 'Basic', type: 'normal', description: '', multiplier: 1 },
            { id: 's2', name: 'Liberation', type: 'ultimate', description: '', multiplier: 9 },
        ] });
        expect(statRelevance(c, 'resonanceLiberationDmgBonus')).toBe('high');
        expect(statRelevance(c, 'basicAttackDmgBonus')).toBe('medium');
    });

    it('a skill with a multipliers table (not a flat multiplier) is still recognized as offensive', () => {
        const c = char({ skills: [{ id: 's1', name: 'Skill', type: 'skill', description: '', multiplier: 0, multipliers: [0, 0.5, 1, 1.5] }] });
        expect(statRelevance(c, 'critRate')).toBe('high');
    });

    it('an unrecognized stat key defaults to medium, not a crash', () => {
        expect(statRelevance(char(), 'someFutureStat')).toBe('medium');
    });
});
