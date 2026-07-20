import { conditionalWeaponBuffs, conditionalCharacterBuffs, conditionalGearBuffs, gearAutoBuffs } from '../../src/renderer/src/lib/selfBuffs';
import * as gameData from '../../src/renderer/src/data/gameData';

describe('autoTrigger forwarding', () => {
    const catalog: never[] = [];

    it('conditionalCharacterBuffs forwards autoTrigger when present on the source buff', () => {
        const character = {
            id: 'c1', name: 'Test Char', stats: { atk: 100 },
            selfBuffs: [{ stat: 'critRate', label: 'Test', value: 10, conditional: true, autoTrigger: { skillIds: ['skill'], durationSeconds: 15 } }],
        };
        const [candidate] = conditionalCharacterBuffs(character as never, [], undefined, catalog);
        expect((candidate as { autoTrigger?: unknown }).autoTrigger).toEqual({ skillIds: ['skill'], durationSeconds: 15 });
    });

    it('conditionalWeaponBuffs forwards autoTrigger', () => {
        const weapon = {
            id: 'w1', name: 'Test Weapon', baseAtk: 500,
            selfBuffs: [{ stat: 'atkPct', value: 15, conditional: true, autoTrigger: { skillIds: ['ult'], durationSeconds: 20 } }],
        };
        const character = { id: 'c1', name: 'Test Char', stats: { atk: 100 } };
        const [candidate] = conditionalWeaponBuffs(weapon as never, character as never, [], catalog);
        expect((candidate as { autoTrigger?: unknown }).autoTrigger).toEqual({ skillIds: ['ult'], durationSeconds: 20 });
    });

    it('conditionalGearBuffs forwards autoTrigger', () => {
        // `gearSelfBuffs` looks up a static table by echo NAME (WW_ECHO_SELF_BUFFS),
        // ignoring any `.selfBuffs` property on the passed gear object — spy on it
        // directly rather than relying on a real catalog entry existing.
        jest.spyOn(gameData, 'gearSelfBuffs').mockReturnValue([
            { stat: 'atk', label: 'Test', value: 5, conditional: true, autoTrigger: { skillIds: ['skill'], durationSeconds: 10 } } as never,
        ]);
        const gear = [{ id: 'g1', name: 'Test Echo' }];
        const [candidate] = conditionalGearBuffs(gear as never);
        expect((candidate as { autoTrigger?: unknown }).autoTrigger).toEqual({ skillIds: ['skill'], durationSeconds: 10 });
    });

    it('a candidate with no autoTrigger on the source buff has none on the output either', () => {
        const character = { id: 'c1', name: 'Test Char', stats: { atk: 100 }, selfBuffs: [{ stat: 'critRate', label: 'Test', value: 10, conditional: true }] };
        const [candidate] = conditionalCharacterBuffs(character as never, [], undefined, catalog);
        expect((candidate as { autoTrigger?: unknown }).autoTrigger).toBeUndefined();
    });
});

describe('restrictedToCharacters forwarding', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('gearAutoBuffs includes a restricted buff when the character name matches', () => {
        jest.spyOn(gameData, 'gearSelfBuffs').mockReturnValue([
            { stat: 'critRate', label: 'Test', value: 15, conditional: false, restrictedToCharacters: ['Lucy', 'Rebecca'] } as never,
        ]);
        const gear = [{ id: 'g1', name: 'Test Echo' }];
        const result = gearAutoBuffs(gear as never, {}, 'Lucy');
        expect(result).toHaveLength(1);
        expect(result[0].value).toBe(15);
    });

    it('gearAutoBuffs excludes a restricted buff when the character name does not match', () => {
        jest.spyOn(gameData, 'gearSelfBuffs').mockReturnValue([
            { stat: 'critRate', label: 'Test', value: 15, conditional: false, restrictedToCharacters: ['Lucy', 'Rebecca'] } as never,
        ]);
        const gear = [{ id: 'g1', name: 'Test Echo' }];
        const result = gearAutoBuffs(gear as never, {}, 'Jinhsi');
        expect(result).toHaveLength(0);
    });

    it('gearAutoBuffs excludes a restricted buff when no character name is passed', () => {
        jest.spyOn(gameData, 'gearSelfBuffs').mockReturnValue([
            { stat: 'critRate', label: 'Test', value: 15, conditional: false, restrictedToCharacters: ['Lucy', 'Rebecca'] } as never,
        ]);
        const gear = [{ id: 'g1', name: 'Test Echo' }];
        expect(gearAutoBuffs(gear as never)).toHaveLength(0);
    });

    it('gearAutoBuffs keeps an unrestricted buff regardless of character name', () => {
        jest.spyOn(gameData, 'gearSelfBuffs').mockReturnValue([
            { stat: 'atk', label: 'Test', value: 5, conditional: false } as never,
        ]);
        const gear = [{ id: 'g1', name: 'Test Echo' }];
        expect(gearAutoBuffs(gear as never, {}, 'Anyone')).toHaveLength(1);
        expect(gearAutoBuffs(gear as never)).toHaveLength(1);
    });

    it('conditionalGearBuffs applies the same restriction', () => {
        jest.spyOn(gameData, 'gearSelfBuffs').mockReturnValue([
            { stat: 'dmgBonus', label: 'Test', value: 20, conditional: true, restrictedToCharacters: ['Lucy'] } as never,
        ]);
        const gear = [{ id: 'g1', name: 'Test Echo' }];
        expect(conditionalGearBuffs(gear as never, {}, 'Lucy')).toHaveLength(1);
        expect(conditionalGearBuffs(gear as never, {}, 'Rebecca')).toHaveLength(0);
    });
});

describe('main-slot (cost-4) exclusivity in gearAutoBuffs/conditionalGearBuffs', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('only the first cost-4 echo\'s buff applies when more than one is somehow equipped', () => {
        jest.spyOn(gameData, 'gearSelfBuffs').mockImplementation((g: { name: string }) => {
            if (g.name === 'Echo A') return [{ stat: 'critRate', label: 'A', value: 10, conditional: false }] as never;
            if (g.name === 'Echo B') return [{ stat: 'critRate', label: 'B', value: 20, conditional: false }] as never;
            return [];
        });
        const gear = [
            { id: 'g1', name: 'Echo A', cost: 4 },
            { id: 'g2', name: 'Echo B', cost: 4 },
        ];
        const result = gearAutoBuffs(gear as never);
        expect(result).toHaveLength(1);
        expect(result[0].source).toBe('Echo A');
    });

    it('a non-cost-4 echo\'s buff still applies alongside the main-slot one', () => {
        jest.spyOn(gameData, 'gearSelfBuffs').mockImplementation((g: { name: string }) => {
            if (g.name === 'Main Echo') return [{ stat: 'critRate', label: 'Main', value: 10, conditional: false }] as never;
            if (g.name === 'Side Echo') return [{ stat: 'atk', label: 'Side', value: 5, conditional: false }] as never;
            return [];
        });
        const gear = [
            { id: 'g1', name: 'Main Echo', cost: 4 },
            { id: 'g2', name: 'Side Echo', cost: 3 },
        ];
        const result = gearAutoBuffs(gear as never);
        expect(result).toHaveLength(2);
    });

    it('conditionalGearBuffs applies the same main-slot exclusivity', () => {
        jest.spyOn(gameData, 'gearSelfBuffs').mockImplementation((g: { name: string }) => {
            if (g.name === 'Echo A') return [{ stat: 'dmgBonus', label: 'A', value: 10, conditional: true }] as never;
            if (g.name === 'Echo B') return [{ stat: 'dmgBonus', label: 'B', value: 20, conditional: true }] as never;
            return [];
        });
        const gear = [
            { id: 'g1', name: 'Echo A', cost: 4 },
            { id: 'g2', name: 'Echo B', cost: 4 },
        ];
        const result = conditionalGearBuffs(gear as never);
        expect(result).toHaveLength(1);
        expect(result[0].source).toBe('Echo A');
    });
});
