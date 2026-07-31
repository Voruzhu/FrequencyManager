import { gearEfficiency, subStatRollRatio } from '../../shared/calc/gearEfficiency';
import { WW_GEAR_CATALOG, GI_GEAR_CATALOG } from '../../shared/game-data/gear-catalogs';

describe('gearEfficiency', () => {
    it('rollPct is 100 when every rolled substat hit its real max', () => {
        // WW substat ranges are the same at every rarity — real maxes: atkPct 11.6, critRate 10.5.
        const perfect = gearEfficiency(
            { rarity: 5, subStats: [{ key: 'atkPct', value: 11.6 }, { key: 'critRate', value: 10.5 }] },
            WW_GEAR_CATALOG,
        );
        expect(perfect.rollPct).toBeCloseTo(100, 5);
    });

    it('rollPct is 50 when every rolled substat hit exactly half its max', () => {
        const half = gearEfficiency(
            { rarity: 5, subStats: [{ key: 'atkPct', value: 5.8 }] },
            WW_GEAR_CATALOG,
        );
        expect(half.rollPct).toBeCloseTo(50, 5);
    });

    it('averages ratios across multiple substats, not just the first', () => {
        const mixed = gearEfficiency(
            { rarity: 5, subStats: [{ key: 'atkPct', value: 11.6 }, { key: 'defPct', value: 7.35 }] }, // 100% and 50% (defPct max 14.7)
            WW_GEAR_CATALOG,
        );
        expect(mixed.rollPct).toBeCloseTo(75, 1);
    });

    it('omits critValue when the piece has no Crit Rate/DMG substat', () => {
        const noCrit = gearEfficiency({ rarity: 5, subStats: [{ key: 'atkPct', value: 11.6 }] }, WW_GEAR_CATALOG);
        expect(noCrit.critValue).toBeUndefined();
    });

    it('includes critValue = critRate*2 + critDmg when either is present', () => {
        const withCrit = gearEfficiency(
            { rarity: 5, subStats: [{ key: 'critRate', value: 10 }, { key: 'critDmg', value: 15 }] },
            WW_GEAR_CATALOG,
        );
        expect(withCrit.critValue).toBeCloseTo(35, 5); // 10*2 + 15
    });

    it('clamps a roll that exceeds the catalog max to 100% instead of overshooting', () => {
        const overshoot = gearEfficiency({ rarity: 5, subStats: [{ key: 'atkPct', value: 999 }] }, WW_GEAR_CATALOG);
        expect(overshoot.rollPct).toBe(100);
    });

    it('works for GI, whose substat ranges genuinely narrow by rarity (unlike WW)', () => {
        // Real GI critRate range at rarity 5: min 2.7, max 15.6.
        const gi = gearEfficiency({ rarity: 5, subStats: [{ key: 'critRate', value: 15.6 }] }, GI_GEAR_CATALOG);
        expect(gi.rollPct).toBeCloseTo(100, 5);
    });

    it('rollPct is 0 for a piece with no substats rolled yet', () => {
        const fresh = gearEfficiency({ rarity: 5, subStats: [] }, WW_GEAR_CATALOG);
        expect(fresh.rollPct).toBe(0);
        expect(fresh.critValue).toBeUndefined();
    });
});

describe('subStatRollRatio', () => {
    it('returns a 0-1 ratio for a real substat/rarity combination', () => {
        expect(subStatRollRatio('atkPct', 11.6, 5, WW_GEAR_CATALOG)).toBeCloseTo(1, 5);
        expect(subStatRollRatio('atkPct', 5.8, 5, WW_GEAR_CATALOG)).toBeCloseTo(0.5, 5);
    });

    it('clamps to 1 instead of overshooting past the catalog max', () => {
        expect(subStatRollRatio('atkPct', 999, 5, WW_GEAR_CATALOG)).toBe(1);
    });

    it('returns undefined for a stat key with no catalog range at all', () => {
        expect(subStatRollRatio('someFutureStat', 10, 5, WW_GEAR_CATALOG)).toBeUndefined();
    });

    it('gearEfficiency\'s aggregate rollPct is the average of the individual ratios this returns (kept in sync by construction, not by convention)', () => {
        const gear = { rarity: 5 as const, subStats: [{ key: 'atkPct', value: 11.6 }, { key: 'defPct', value: 7.35 }] };
        const r1 = subStatRollRatio('atkPct', 11.6, 5, WW_GEAR_CATALOG)!;
        const r2 = subStatRollRatio('defPct', 7.35, 5, WW_GEAR_CATALOG)!;
        expect(gearEfficiency(gear, WW_GEAR_CATALOG).rollPct).toBeCloseTo(((r1 + r2) / 2) * 100, 5);
    });
});
