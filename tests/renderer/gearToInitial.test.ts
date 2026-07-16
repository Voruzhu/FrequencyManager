import { gearToInitial } from '../../src/renderer/src/lib/gearEdit';
import { WW_GEAR_CATALOG } from '../../shared/game-data/gear-catalogs';
import type { GearEntry } from '../../shared/types/game-bundle';

describe('gearToInitial — reverse-maps an owned GearEntry into an AddGearWindow edit draft', () => {
    it('recovers set/rarity/slot/main/subs, stripping the locked base stat (WuWa cost-4 = flat ATK, always first)', () => {
        const g: GearEntry = {
            kind: 'echo', id: 'g1', name: 'Thundering Mephis', setName: 'Void Thunder', rarity: 5, cost: 4,
            mainStat: { key: 'critRate', label: 'Crit Rate', value: 22 },
            subStats: [
                { key: 'atk', label: 'ATK', value: 150 }, // locked base stat — must be stripped
                { key: 'critDmg', label: 'Crit DMG', value: 16.2 },
                { key: 'energyRegen', label: 'Energy Regen', value: 10.8 },
            ],
        };
        const initial = gearToInitial(g, WW_GEAR_CATALOG);
        expect(initial.setId).toBe('void-thunder');
        expect(initial.rarity).toBe(5);
        expect(initial.slotId).toBe('c4');
        expect(initial.mainKey).toBe('critRate');
        expect(initial.echoName).toBe('Thundering Mephis');
        expect(initial.subs).toEqual([
            { key: 'critDmg', value: 16.2 },
            { key: 'energyRegen', value: 10.8 },
        ]);
    });

    it('leaves echoName undefined when name === setName (no specific identity known)', () => {
        const g: GearEntry = {
            kind: 'echo', id: 'g2', name: 'Void Thunder', setName: 'Void Thunder', rarity: 5, cost: 1,
            mainStat: { key: 'atkPct', label: 'ATK%', value: 18 },
            subStats: [{ key: 'hp', label: 'HP', value: 2280 }],
        };
        const initial = gearToInitial(g, WW_GEAR_CATALOG);
        expect(initial.echoName).toBeUndefined();
        // Cost-1 slot's own locked base stat is flat HP, matching subStats[0] — also stripped.
        expect(initial.subs).toEqual([]);
    });
});
