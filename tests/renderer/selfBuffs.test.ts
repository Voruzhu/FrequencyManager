import { conditionalWeaponBuffs, conditionalCharacterBuffs, conditionalGearBuffs } from '../../src/renderer/src/lib/selfBuffs';
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
