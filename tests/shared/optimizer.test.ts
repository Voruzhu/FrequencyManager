import {
    combinations, subtreeSize, totalCombinations, gearSlotsFor,
    computeBaseLoadouts, targetRanges, mergeRanges, scoreAndRank, optimize, withinCostBudget,
    enemyMultiplier, skillDamage, isScopedBuff,
    type Target, type OptimizeConfig,
} from '../../shared/calc/optimizer';
import type { CharacterEntry, GearEntry, StatDef, EnemyEntry, SkillDef, BuffEntry } from '../../shared/types/game-bundle';

describe('combinations — firstIndices partitioning', () => {
    it('with no filter, generates every k-combination in lexicographic order', () => {
        const all = combinations([0, 1, 2, 3], 2);
        expect(all).toEqual([[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]]);
    });

    it('firstIndices restricts to combos whose SMALLEST index is in the set', () => {
        const only1 = combinations([0, 1, 2, 3], 2, new Set([1]));
        expect(only1).toEqual([[1, 2], [1, 3]]);
    });

    it('partitioning by firstIndices across all valid first indices reconstructs the full set with no overlap/gaps', () => {
        const arr = [0, 1, 2, 3, 4, 5];
        const k = 3;
        const full = combinations(arr, k);
        const parts: number[][][] = [];
        for (let i = 0; i <= arr.length - k; i++) parts.push(combinations(arr, k, new Set([i])));
        const reassembled = parts.flat();
        expect(reassembled).toEqual(full);
    });
});

describe('subtreeSize / totalCombinations', () => {
    it('subtreeSize sums to totalCombinations across every valid first index', () => {
        const n = 10, k = 4;
        let sum = 0;
        for (let i = 0; i <= n - k; i++) sum += subtreeSize(n, k, i);
        expect(sum).toBe(totalCombinations(n, k));
    });

    it('matches C(n,k) for a known small case: C(5,2) = 10', () => {
        expect(totalCombinations(5, 2)).toBe(10);
    });

    it('subtreeSize(n, k, 0) is the largest (first pick has the most remaining choices)', () => {
        const n = 12, k = 5;
        const sizes = Array.from({ length: n - k + 1 }, (_, i) => subtreeSize(n, k, i));
        expect(sizes[0]).toBe(Math.max(...sizes));
    });
});

describe('gearSlotsFor', () => {
    it('caps at 5 for a large pool, matches pool size when smaller, never 0', () => {
        expect(gearSlotsFor(100)).toBe(5);
        expect(gearSlotsFor(3)).toBe(3);
        expect(gearSlotsFor(0)).toBe(1);
    });
});

// --- Fixtures for the scoring/ranking pipeline ---

const CATALOG: StatDef[] = [
    { key: 'atk', label: 'ATK' },
    { key: 'critRate', label: 'Crit Rate', percent: true },
    { key: 'critDmg', label: 'Crit DMG', percent: true },
];

function char(): CharacterEntry {
    return {
        kind: 'character', id: 'c1', name: 'Test', element: 'Spectro', weaponType: 'Sword', rarity: 5,
        stats: { atk: 100, critRate: 5, critDmg: 50 },
        skills: [{ id: 's1', name: 'Skill', type: 'skill', description: '', multiplier: 1, scaling: 'atk' }],
        equipped: { gearIds: [] },
    };
}

let gearSeq = 0;
function gear(atk: number, cost?: number): GearEntry {
    return {
        kind: 'echo', id: `g${++gearSeq}`, name: 'Void Thunder', setName: 'Void Thunder', rarity: 5,
        mainStat: { key: 'atk', label: 'ATK', value: atk },
        subStats: [],
        ...(cost != null ? { cost } : {}),
    };
}

function baseConfig(overrides: Partial<OptimizeConfig> = {}): OptimizeConfig {
    const targets: Target[] = [{ id: 't1', kind: 'stat', key: 'atk', label: 'ATK', mode: 'max' }];
    return {
        targets, buffs: [], critMode: 'average',
        enemy: { id: 'e', name: 'Dummy', level: 90, def: 0, res: 0 },
        catalog: CATALOG, topN: 5,
        ...overrides,
    };
}

describe('optimize — single-threaded reference path', () => {
    it('picks the highest-ATK combo first when maximizing ATK', () => {
        const pool = [gear(10), gear(200), gear(50), gear(30), gear(20), gear(5)];
        const result = optimize(char(), pool, baseConfig());
        expect(result.length).toBeGreaterThan(0);
        expect(result[0].gear).toContainEqual(expect.objectContaining({ mainStat: expect.objectContaining({ value: 200 }) }));
    });

    it('respects topN', () => {
        const pool = Array.from({ length: 8 }, (_, i) => gear(i + 1));
        const result = optimize(char(), pool, baseConfig({ topN: 3 }));
        expect(result.length).toBe(3);
    });

    it('does NOT throw for a gear pool large enough that Math.max(...vals) would overflow the engine argument limit', () => {
        // C(30,5) = 142,506 — comfortably past V8's spread-argument ceiling
        // (~65k-125k). This is the exact scenario that silently crashed
        // `optimize()` before `targetRanges` was rewritten to be loop-based.
        const pool = Array.from({ length: 30 }, (_, i) => gear(i + 1));
        expect(() => optimize(char(), pool, baseConfig({ topN: 5 }))).not.toThrow();
    }, 20000);
});

describe('withinCostBudget — WuWa\'s real 12-cost cap across 5 equipped echoes', () => {
    it('a combo totaling exactly the cap is allowed', () => {
        const combo = [gear(1, 4), gear(1, 3), gear(1, 3), gear(1, 1), gear(1, 1)]; // 4+3+3+1+1 = 12
        expect(withinCostBudget(combo, 12)).toBe(true);
    });

    it('a combo exceeding the cap is rejected (e.g. five cost-4 echoes = 20, impossible in-game)', () => {
        const combo = Array.from({ length: 5 }, () => gear(1, 4));
        expect(withinCostBudget(combo, 12)).toBe(false);
    });

    it('undefined cap (GI, no cost concept) never rejects anything', () => {
        const combo = Array.from({ length: 5 }, () => gear(1, 4));
        expect(withinCostBudget(combo, undefined)).toBe(true);
    });

    it('gear with no cost field at all contributes 0, never blocking a combo', () => {
        const combo = [gear(1), gear(1), gear(1), gear(1), gear(1)];
        expect(withinCostBudget(combo, 12)).toBe(true);
    });
});

describe('enemyMultiplier — defIgnore/resShred', () => {
    const enemy: EnemyEntry = { id: 'e', name: 'Dummy', level: 90, def: 1000, res: 20 };

    it('defaults (no 3rd/4th arg) match the old 2-arg behavior exactly', () => {
        expect(enemyMultiplier(enemy, 90, 0, 0)).toBe(enemyMultiplier(enemy, 90));
    });

    it('defIgnorePct raises the multiplier (less effective DEF -> more damage through)', () => {
        const base = enemyMultiplier(enemy, 90);
        const ignored = enemyMultiplier(enemy, 90, 50, 0);
        expect(ignored).toBeGreaterThan(base);
        // Halving DEF: factor/(factor+def/2) — check the exact math, not just direction.
        const factor = 5 * 90 + 500;
        const expectedDefMult = factor / (factor + enemy.def * 0.5);
        const resMult = enemyMultiplier(enemy, 90) / (factor / (factor + enemy.def)); // isolate resMult
        expect(ignored).toBeCloseTo(expectedDefMult * resMult, 6);
    });

    it('defIgnorePct is clamped to [0, 100] — overshooting to 150 behaves the same as 100 (0 effective DEF)', () => {
        expect(enemyMultiplier(enemy, 90, 150, 0)).toBeCloseTo(enemyMultiplier(enemy, 90, 100, 0), 10);
    });

    it('resShredPct raises the multiplier (less RES -> more damage through)', () => {
        const base = enemyMultiplier(enemy, 90);
        const shredded = enemyMultiplier(enemy, 90, 0, 10);
        expect(shredded).toBeGreaterThan(base);
    });

    it('resShredPct can push RES negative — formula still produces a finite, higher-than-base multiplier (matches a real negative-RES enemy)', () => {
        const lowResEnemy: EnemyEntry = { id: 'e2', name: 'LowRes', level: 90, def: 1000, res: 5 };
        const shredded = enemyMultiplier(lowResEnemy, 90, 0, 20); // res goes to -15
        expect(Number.isFinite(shredded)).toBe(true);
        expect(shredded).toBeGreaterThan(enemyMultiplier(lowResEnemy, 90));
    });

    it('defIgnore and resShred combine (both reduce mitigation independently)', () => {
        const both = enemyMultiplier(enemy, 90, 30, 10);
        const defOnly = enemyMultiplier(enemy, 90, 30, 0);
        const resOnly = enemyMultiplier(enemy, 90, 0, 10);
        expect(both).toBeGreaterThan(defOnly);
        expect(both).toBeGreaterThan(resOnly);
    });
});

describe('isScopedBuff', () => {
    it('a buff with appliesTo is scoped', () => {
        expect(isScopedBuff({ id: 'b', name: 'B', source: 'S', stat: 'dmgBonus', value: 10, appliesTo: ['basic'] })).toBe(true);
    });
    it('an unscoped defIgnore/resShred buff is STILL scoped (routed to skillDamage, not global stats)', () => {
        expect(isScopedBuff({ id: 'b', name: 'B', source: 'S', stat: 'defIgnore', value: 10 })).toBe(true);
        expect(isScopedBuff({ id: 'b', name: 'B', source: 'S', stat: 'resShred', value: 10 })).toBe(true);
    });
    it('a plain unscoped stat buff (e.g. atkPct) is NOT scoped', () => {
        expect(isScopedBuff({ id: 'b', name: 'B', source: 'S', stat: 'atkPct', value: 10 })).toBe(false);
    });
});

describe('skillDamage — defIgnore/resShred end-to-end via scopedBuffs', () => {
    const skill: SkillDef = { id: 's1', name: 'Skill', type: 'Skill', description: '', multiplier: 1, scaling: 'atk' };
    const stats = { atk: 1000, critRate: 0, critDmg: 0 };
    const enemy: EnemyEntry = { id: 'e', name: 'Dummy', level: 90, def: 2000, res: 20 };

    it('an unscoped defIgnore buff increases computed damage', () => {
        const withoutIgnore = skillDamage(stats, skill, { mode: 'none', enemy, defaultTalentLevel: 1 });
        const defIgnoreBuff: BuffEntry = { id: 'b', name: 'B', source: 'S', stat: 'defIgnore', value: 30 };
        const withIgnore = skillDamage(stats, skill, { mode: 'none', enemy, defaultTalentLevel: 1, scopedBuffs: [defIgnoreBuff] });
        expect(withIgnore).toBeGreaterThan(withoutIgnore);
    });

    it('a defIgnore buff scoped to a DIFFERENT attack type does not affect this skill', () => {
        const withoutIgnore = skillDamage(stats, skill, { mode: 'none', enemy, defaultTalentLevel: 1 });
        const wrongScope: BuffEntry = { id: 'b', name: 'B', source: 'S', stat: 'defIgnore', value: 30, appliesTo: ['heavy'] };
        const stillNoIgnore = skillDamage(stats, skill, { mode: 'none', enemy, defaultTalentLevel: 1, scopedBuffs: [wrongScope] });
        expect(stillNoIgnore).toBe(withoutIgnore);
    });

    it('a defIgnore buff scoped to the MATCHING attack type does affect this skill', () => {
        const withoutIgnore = skillDamage(stats, skill, { mode: 'none', enemy, defaultTalentLevel: 1 });
        const rightScope: BuffEntry = { id: 'b', name: 'B', source: 'S', stat: 'defIgnore', value: 30, appliesTo: ['skill'] };
        const withIgnore = skillDamage(stats, skill, { mode: 'none', enemy, defaultTalentLevel: 1, scopedBuffs: [rightScope] });
        expect(withIgnore).toBeGreaterThan(withoutIgnore);
    });

    it('an unscoped resShred buff increases computed damage', () => {
        const withoutShred = skillDamage(stats, skill, { mode: 'none', enemy, defaultTalentLevel: 1 });
        const resShredBuff: BuffEntry = { id: 'b', name: 'B', source: 'S', stat: 'resShred', value: 15 };
        const withShred = skillDamage(stats, skill, { mode: 'none', enemy, defaultTalentLevel: 1, scopedBuffs: [resShredBuff] });
        expect(withShred).toBeGreaterThan(withoutShred);
    });
});

describe('optimize — never recommends a loadout exceeding the real total-cost budget', () => {
    it('excludes an all-high-cost combo that would be impossible to equip in-game', () => {
        // Pool dominated by cost-4 pieces (highest ATK) plus enough low-cost
        // filler that a LEGAL 12-cost combo still exists — without the cost
        // filter, the optimizer would greedily pick 5 cost-4 pieces (ATK-max)
        // even though that totals 20, which no WuWa player could equip.
        const pool = [
            gear(200, 4), gear(190, 4), gear(180, 4), gear(170, 4), gear(160, 4),
            gear(50, 3), gear(40, 3), gear(10, 1), gear(9, 1),
        ];
        const result = optimize(char(), pool, baseConfig({ maxTotalCost: 12, topN: 5 }));
        expect(result.length).toBeGreaterThan(0);
        for (const loadout of result) {
            const totalCost = loadout.gear.reduce((sum, g) => sum + (g.cost ?? 0), 0);
            expect(totalCost).toBeLessThanOrEqual(12);
        }
    });

    it('with no maxTotalCost set (GI), an over-12 combo is still allowed — no constraint applies', () => {
        const pool = Array.from({ length: 5 }, (_, i) => gear(100 + i, 4)); // would total 20
        const result = optimize(char(), pool, baseConfig({ topN: 1 }));
        expect(result.length).toBe(1);
        expect(result[0].gear.reduce((sum, g) => sum + (g.cost ?? 0), 0)).toBe(20);
    });
});

describe('computeBaseLoadouts / targetRanges / mergeRanges / scoreAndRank — worker-split equivalence', () => {
    it('splitting the combo set across two "workers" and merging ranges produces the SAME top result as the single-threaded path', () => {
        const c = char();
        const pool = [gear(10), gear(200), gear(50), gear(30), gear(20), gear(5), gear(80)];
        const config = baseConfig({ topN: 3 });
        const k = gearSlotsFor(pool.length);

        // Single-threaded reference.
        const reference = optimize(c, pool, config);

        // Simulate a 2-worker split by first-index parity.
        const combosA = combinations(pool, k, new Set([0, 2, 4]));
        const combosB = combinations(pool, k, new Set([1, 3, 5]));
        const baseA = computeBaseLoadouts(c, combosA, config, 0);
        const baseB = computeBaseLoadouts(c, combosB, config, combosA.length);
        const maxTargets = config.targets.filter((t) => t.mode === 'max');
        const rangesA = targetRanges(baseA, maxTargets);
        const rangesB = targetRanges(baseB, maxTargets);
        const merged = mergeRanges([rangesA, rangesB]);
        const rankedA = scoreAndRank(baseA, merged, config.topN);
        const rankedB = scoreAndRank(baseB, merged, config.topN);
        const combinedTop = [...rankedA, ...rankedB].sort((x, y) => (Number(y.meets) - Number(x.meets)) || (y.score - x.score)).slice(0, config.topN);

        expect(combinedTop[0].score).toBeCloseTo(reference[0].score, 6);
        expect(combinedTop[0].gear.map((g) => g.mainStat.value).sort()).toEqual(reference[0].gear.map((g) => g.mainStat.value).sort());
    });

    it('mergeRanges takes the true min/max across all parts, not just one part\'s', () => {
        const t: Target = { id: 't1', kind: 'stat', key: 'atk', label: 'ATK', mode: 'max' };
        const partA = [{ t, lo: 10, hi: 50 }];
        const partB = [{ t, lo: 5, hi: 80 }];
        const merged = mergeRanges([partA, partB]);
        expect(merged).toEqual([{ t, lo: 5, hi: 80 }]);
    });
});
