import { deriveSetBonuses } from '../../shared/game-data/derive';
import { computeBuildStats } from '../../shared/calc/optimizer';
import type { CharacterEntry, GearEntry, StatDef } from '../../shared/types/game-bundle';

describe('deriveSetBonuses — 2pc tier kept separate from the full 4pc/5pc bonus', () => {
    it('splits a real WW-shaped set (elemental 2pc + bigger elemental 5pc) into 2pc-only, full-set-only, and a merged total', () => {
        const [entry] = deriveSetBonuses(
            [{ name: 'Freezing Frost', bonuses: { elementalDmgBonus: { Glacio: 10 } }, setBonus: { elementalDmgBonus: { Glacio: 30 } } }],
            5,
        );
        // Tagged with the REAL element (glacioDmg), not the generic
        // always-applies elemDmg slot — see the dedicated bug-fix tests
        // below for why that distinction matters.
        expect(entry.twoPieceBuffs).toEqual([{ stat: 'glacioDmg', label: 'Glacio DMG', value: 10 }]);
        expect(entry.fullSetOnlyBuffs).toEqual([{ stat: 'glacioDmg', label: 'Glacio DMG', value: 30 }]);
        // Both tiers target the same element here, so the merged total sums them.
        expect(entry.buffs).toEqual([{ stat: 'glacioDmg', label: 'Glacio DMG', value: 40 }]);
    });

    it('keeps tiers with DIFFERENT stats separate in the merged total too (no cross-contamination)', () => {
        const [entry] = deriveSetBonuses(
            [{ name: 'Two Different Stats', bonuses: { atkPercent: 12 }, setBonus: { critRate: 15 } }],
            4,
        );
        expect(entry.twoPieceBuffs).toEqual([{ stat: 'atkPct', label: 'ATK%', value: 12 }]);
        expect(entry.fullSetOnlyBuffs).toEqual([{ stat: 'critRate', label: 'Crit Rate', value: 15 }]);
        expect(entry.buffs).toEqual(expect.arrayContaining([
            { stat: 'atkPct', label: 'ATK%', value: 12 },
            { stat: 'critRate', label: 'Crit Rate', value: 15 },
        ]));
        expect(entry.buffs.length).toBe(2);
    });

    it('an empty bonus tier (some sets have nothing at 2pc) produces an empty twoPieceBuffs, not a crash', () => {
        const [entry] = deriveSetBonuses([{ name: 'No 2pc Effect', bonuses: {}, setBonus: { atkPercent: 18 } }], 4);
        expect(entry.twoPieceBuffs).toEqual([]);
        expect(entry.fullSetOnlyBuffs).toEqual([{ stat: 'atkPct', label: 'ATK%', value: 18 }]);
        expect(entry.pieces).toBe(4);
    });

    it('tags a per-element set bonus with the REAL element key, not the generic always-applies elemDmg slot (the reported bug: an off-element set silently boosting a mismatched character)', () => {
        const [sierraGale] = deriveSetBonuses(
            [{ name: 'Sierra Gale', bonuses: { elementalDmgBonus: { Aero: 10 } }, setBonus: { elementalDmgBonus: { Aero: 30 } } }],
            5,
        );
        expect(sierraGale.buffs).toEqual([{ stat: 'aeroDmg', label: 'Aero DMG', value: 40 }]);
        expect(sierraGale.buffs.some((b) => b.stat === 'elemDmg')).toBe(false);
    });

    it('end-to-end: a Spectro character gets ZERO benefit from an equipped Aero set bonus (was previously always applying via the generic elemDmg slot)', () => {
        const [sierraGale] = deriveSetBonuses(
            [{ name: 'Sierra Gale', bonuses: {}, setBonus: { elementalDmgBonus: { Aero: 30 } } }],
            5,
        );
        const catalog: StatDef[] = [{ key: 'atk', label: 'ATK' }, { key: 'elemDmg', label: 'Elemental DMG', percent: true }];
        const lucy: CharacterEntry = {
            kind: 'character', id: 'lucy', name: 'Lucy', element: 'Spectro', weaponType: 'Pistols', rarity: 5,
            stats: { atk: 100 }, skills: [], equipped: { gearIds: [] },
        };
        const gear: GearEntry[] = [];
        const asBuffEntries = sierraGale.buffs.map((b, i) => ({ id: `sb-${i}`, name: sierraGale.name, source: sierraGale.name, ...b }));
        const stats = computeBuildStats(lucy, gear, asBuffEntries, undefined, catalog);
        expect(stats.elemDmg).toBe(0);

        // Sanity: the SAME set bonus DOES apply for a real Aero character.
        const aeroChar: CharacterEntry = { ...lucy, id: 'aero-char', element: 'Aero' };
        const aeroStats = computeBuildStats(aeroChar, gear, asBuffEntries, undefined, catalog);
        expect(aeroStats.elemDmg).toBe(30);
    });

    it('a per-set `pieces` override wins over the game-wide default (WuWa\'s 1pc-only Shadow of Shattered Dreams, not the usual 5pc)', () => {
        const [entry] = deriveSetBonuses(
            [{ name: 'Shadow of Shattered Dreams', bonuses: {}, setBonus: { basicAttackDmg: 35, heavyAttackDmg: 35 }, pieces: 1, restrictedToCharacters: ['Rebecca', 'Lucy'] }],
            5,
        );
        expect(entry.pieces).toBe(1);
        expect(entry.restrictedToCharacters).toEqual(['Rebecca', 'Lucy']);
    });

    it('a set with no `pieces` override still falls back to the game-wide default', () => {
        const [entry] = deriveSetBonuses([{ name: 'Ordinary Set', bonuses: { atkPercent: 10 }, setBonus: { atkPercent: 20 } }], 5);
        expect(entry.pieces).toBe(5);
        expect(entry.restrictedToCharacters).toBeUndefined();
    });
});
