import { weaponAutoBuffs, conditionalWeaponBuffs } from '../../src/renderer/src/lib/selfBuffs';
import { partyEffects, type PartyMemberResolved } from '../../src/renderer/src/lib/party';
import type { CharacterEntry, WeaponEntry, GameBundle } from '../../shared/types/game-bundle';

// `spectral-trigger` is a real WW weapon in the shipped scaling table
// (`weapon-scaling.wuthering-waves.generated.ts`) with a non-flat refine curve
// [1, 1.25, 1.5, 1.75, 2] — using it (rather than a synthetic id) exercises the
// real `getWeaponScaling` lookup, not just the multiplier arithmetic.
const REAL_REFINED_WEAPON_ID = 'spectral-trigger';

function weapon(overrides: Partial<WeaponEntry> = {}): WeaponEntry {
    return {
        kind: 'weapon', id: REAL_REFINED_WEAPON_ID, name: 'Spectral Trigger', weaponType: 'Rectifier', rarity: 5,
        baseAtk: 500, secondaryStat: 'Crit Rate', secondaryValue: 30,
        selfBuffs: [{ stat: 'dmgBonus', label: 'Elem DMG', value: 20, conditional: false }],
        ...overrides,
    };
}

function char(): CharacterEntry {
    return {
        kind: 'character', id: 'c1', name: 'Test', element: 'Spectro', weaponType: 'Rectifier', rarity: 5,
        stats: { atk: 1000, hp: 10000, def: 500 },
        skills: [],
        equipped: { gearIds: [] },
    };
}

describe('weaponAutoBuffs — refinement scales the R1 baseline', () => {
    it('refineMultiplier of 1 (R1) leaves the shipped value unchanged', () => {
        const buffs = weaponAutoBuffs(weapon(), char(), [], [], {}, 1);
        expect(buffs).toHaveLength(1);
        expect(buffs[0].value).toBe(20);
    });

    it('a refineMultiplier > 1 (higher rank) scales the value up', () => {
        const buffs = weaponAutoBuffs(weapon(), char(), [], [], {}, 1.5);
        expect(buffs[0].value).toBe(30);
    });

    it('defaults to R1 (multiplier 1) when omitted — backward compatible with existing callers', () => {
        const buffs = weaponAutoBuffs(weapon(), char(), [], []);
        expect(buffs[0].value).toBe(20);
    });
});

describe('conditionalWeaponBuffs — refinement scales the toggle-chip value too', () => {
    it('scales a conditional passive the same way as the unconditional one', () => {
        const w = weapon({ selfBuffs: [{ stat: 'dmgBonus', label: 'Elem DMG', value: 10, conditional: true }] });
        const buffs = conditionalWeaponBuffs(w, char(), [], [], {}, 2);
        expect(buffs[0].value).toBe(20);
    });
});

describe('partyEffects — a support weapon\'s team buff scales with ITS OWN wielder\'s refine', () => {
    const data: Pick<GameBundle, 'id' | 'buffs' | 'setBonuses' | 'statCatalog'> = {
        id: 'wuthering-waves', buffs: { basic: [], character: [] }, setBonuses: [], statCatalog: [],
    };

    function member(weaponRefine: number | undefined): PartyMemberResolved {
        return {
            id: 'm1', character: char(), gear: [],
            weapon: weapon({ buffs: [{ stat: 'atkPct', label: 'Team ATK%', value: 10 }] }),
            weaponRefine,
        };
    }

    it('R1 (default/undefined) leaves the team buff at its shipped value', () => {
        const effects = partyEffects(data, [member(undefined)]);
        const weaponEffect = effects.find((e) => e.category === 'weapon');
        expect(weaponEffect?.buffs[0].value).toBe(10);
    });

    it('a higher refine scales the team buff up, using the SAME real refine table as the self-buff path', () => {
        const effects = partyEffects(data, [member(3)]);
        const weaponEffect = effects.find((e) => e.category === 'weapon');
        // spectral-trigger's refine table: [1, 1.25, 1.5, 1.75, 2] — R3 = index 2 = 1.5.
        expect(weaponEffect?.buffs[0].value).toBe(15);
    });
});
