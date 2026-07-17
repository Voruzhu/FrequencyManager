import { characterAutoBuffs, conditionalCharacterBuffs, isSkillTreeBuff, stripAutoSkillTreeBuffs, passiveBuffId } from '../../src/renderer/src/lib/selfBuffs';
import { describePassiveSlot } from '../../src/renderer/src/data/gameData';
import type { CharacterEntry } from '../../shared/types/game-bundle';

function char(overrides: Partial<CharacterEntry> = {}): CharacterEntry {
    return {
        kind: 'character', id: 'c1', name: 'Test', element: 'Havoc', weaponType: 'Sword', rarity: 5,
        stats: { atk: 1000, hp: 10000, def: 500 },
        skills: [],
        equipped: { gearIds: [] },
        selfBuffs: [
            { stat: 'elemDmg', label: 'Havoc DMG Bonus +15% (Inherent I)', value: 15, conditional: false },
            { stat: 'critRate', label: 'Skill Tree: Crit Rate+8% (fully invested)', value: 8, conditional: true },
            { stat: 'atkPct', label: 'Skill Tree: ATK+12% (fully invested)', value: 12, conditional: true },
        ],
        ...overrides,
    };
}

describe('isSkillTreeBuff', () => {
    it('matches only labels starting with "Skill Tree:"', () => {
        expect(isSkillTreeBuff({ label: 'Skill Tree: ATK+12% (fully invested)' })).toBe(true);
        expect(isSkillTreeBuff({ label: 'Havoc DMG Bonus +15% (Inherent I)' })).toBe(false);
    });
});

describe('characterAutoBuffs — Skill Tree master toggle', () => {
    it('defaults to false (skips Skill Tree buffs) — preserves pre-existing callers like Rotation Builder', () => {
        const c = char();
        const buffs = characterAutoBuffs(c, [], undefined, []);
        // Only the unconditional Inherent I entry applies without an explicit skillTreeInvested=true.
        expect(buffs).toHaveLength(1);
        expect(buffs[0].stat).toBe('elemDmg');
    });

    it('conditional:false buffs (e.g. an unconditional Inherent) always apply regardless of the flag', () => {
        const c = char();
        const buffsOff = characterAutoBuffs(c, [], undefined, [], {}, false);
        const buffsOn = characterAutoBuffs(c, [], undefined, [], {}, true);
        expect(buffsOff.some((b) => b.stat === 'elemDmg' && b.value === 15)).toBe(true);
        expect(buffsOn.some((b) => b.stat === 'elemDmg' && b.value === 15)).toBe(true);
    });

    it('skillTreeInvested=true includes the Skill Tree buffs on top of unconditional ones', () => {
        const c = char();
        const buffs = characterAutoBuffs(c, [], undefined, [], {}, true);
        expect(buffs).toHaveLength(3);
        expect(buffs.some((b) => b.stat === 'critRate' && b.value === 8)).toBe(true);
        expect(buffs.some((b) => b.stat === 'atkPct' && b.value === 12)).toBe(true);
    });

    it('skillTreeInvested=false excludes them (only the unconditional Inherent I remains)', () => {
        const c = char();
        const buffs = characterAutoBuffs(c, [], undefined, [], {}, false);
        expect(buffs).toHaveLength(1);
        expect(buffs[0].stat).toBe('elemDmg');
    });
});

describe('conditionalCharacterBuffs — unaffected by the master toggle (Rotation Builder still offers per-buff opt-in)', () => {
    it('still lists Skill Tree buffs as individually toggleable candidates', () => {
        const c = char();
        const candidates = conditionalCharacterBuffs(c, [], undefined, []);
        expect(candidates.some((b) => b.label.startsWith('Skill Tree:'))).toBe(true);
    });
});

describe('stripAutoSkillTreeBuffs — prevents double-counting a stale manually-toggled buff', () => {
    it('removes a Skill Tree buff id from calc.buffs when the master switch is now on', () => {
        const c = char();
        const skillTreeSb = c.selfBuffs![1]; // "Skill Tree: Crit Rate+8%"
        const staleId = passiveBuffId(c.id, skillTreeSb, 1);
        const manualBuffs = [{ id: staleId, name: 'stale', source: 'Test', stat: 'critRate', value: 8 }];
        const result = stripAutoSkillTreeBuffs(manualBuffs, c, true);
        expect(result).toHaveLength(0);
    });

    it('leaves calc.buffs untouched when the master switch is off (no auto-inclusion to conflict with)', () => {
        const c = char();
        const skillTreeSb = c.selfBuffs![1];
        const staleId = passiveBuffId(c.id, skillTreeSb, 1);
        const manualBuffs = [{ id: staleId, name: 'stale', source: 'Test', stat: 'critRate', value: 8 }];
        const result = stripAutoSkillTreeBuffs(manualBuffs, c, false);
        expect(result).toHaveLength(1);
    });

    it('leaves unrelated buffs (e.g. a user custom buff) untouched either way', () => {
        const c = char();
        const manualBuffs = [{ id: 'custom-1', name: 'Custom', source: 'User', stat: 'atkPct', value: 5 }];
        expect(stripAutoSkillTreeBuffs(manualBuffs, c, true)).toHaveLength(1);
    });
});

describe('describePassiveSlot — real per-character Inherent Skill text instead of generic boilerplate', () => {
    it('WW: pulls the real label for a slot with a matching "(Inherent I)"-tagged self-buff, stripping the tag', () => {
        const c = char();
        const desc = describePassiveSlot('wuthering-waves', c, 0);
        expect(desc).toBe('Havoc DMG Bonus +15%');
    });

    it('WW: returns undefined (caller falls back to generic) when no self-buff is tagged for that slot', () => {
        const c = char();
        const desc = describePassiveSlot('wuthering-waves', c, 1); // no "(Inherent II)" entry authored
        expect(desc).toBeUndefined();
    });

    it('GI: pulls real text tagged "(P1)"/"(P2)" the same way', () => {
        const c = char({ selfBuffs: [{ stat: 'elemDmg', label: 'Skill DMG · scales with EM (P2)', value: 0, conditional: false }] });
        expect(describePassiveSlot('genshin-impact', c, 0)).toBeUndefined();
        expect(describePassiveSlot('genshin-impact', c, 1)).toBe('Skill DMG · scales with EM');
    });

    it('joins multiple self-buffs tagged for the SAME slot rather than dropping any', () => {
        const c = char({
            selfBuffs: [
                { stat: 'critRate', label: 'Crit Rate +10% (Inherent I)', value: 10, conditional: true },
                { stat: 'critDmg', label: 'Crit DMG +20% (Inherent I)', value: 20, conditional: true },
            ],
        });
        expect(describePassiveSlot('wuthering-waves', c, 0)).toBe('Crit Rate +10%; Crit DMG +20%');
    });
});
