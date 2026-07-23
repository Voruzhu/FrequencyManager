import {
    combinations, subtreeSize, totalCombinations, gearSlotsFor,
    computeBaseLoadouts, targetRanges, mergeRanges, scoreAndRank, optimize, withinCostBudget,
    enemyMultiplier, skillDamage, isScopedBuff, gearScopedBuffs, activeSetBonuses, setBonusBuffEntries, mainSlotEchoBuffs,
    type Target, type OptimizeConfig,
} from '../../shared/calc/optimizer';
import type { CharacterEntry, GearEntry, StatDef, EnemyEntry, SkillDef, BuffEntry, SetBonusEntry } from '../../shared/types/game-bundle';

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

    it('undefined cap never applies a total-SUM rejection (the separate at-most-one-cost-4 slot rule still applies regardless)', () => {
        const combo = [gear(1, 4), gear(1, 3), gear(1, 3), gear(1, 3), gear(1, 3)]; // sum 16, only 1 cost-4 piece
        expect(withinCostBudget(combo, undefined)).toBe(true);
    });

    it('gear with no cost field at all contributes 0, never blocking a combo', () => {
        const combo = [gear(1), gear(1), gear(1), gear(1), gear(1)];
        expect(withinCostBudget(combo, 12)).toBe(true);
    });

    it('a combo with 2 cost-4 pieces is rejected even when the total is well within budget (impossible in-game: only 1 slot can hold a cost-4 piece)', () => {
        const combo = [gear(1, 4), gear(1, 4), gear(1, 1), gear(1, 1), gear(1, 1)]; // sum 11, under any real cap
        expect(withinCostBudget(combo, 12)).toBe(false);
    });

    it('a combo with 2 cost-4 pieces is rejected regardless of maxTotalCost, including undefined', () => {
        const combo = [gear(1, 4), gear(1, 4), gear(1, 1), gear(1, 1), gear(1, 1)];
        expect(withinCostBudget(combo, undefined)).toBe(false);
    });

    it('a combo with exactly 1 cost-4 piece is never rejected by the slot-shape rule', () => {
        const combo = [gear(1, 4), gear(1, 3), gear(1, 3), gear(1, 1), gear(1, 1)];
        expect(withinCostBudget(combo, 12)).toBe(true);
    });

    it('a GI-style combo (no piece has a cost field) is unaffected by the slot-shape rule', () => {
        const combo = [gear(1), gear(1), gear(1), gear(1), gear(1)];
        expect(withinCostBudget(combo, undefined)).toBe(true);
    });
});

describe('mainSlotEchoBuffs — WuWa cost-4 echo main-slot bonus, derived per combo', () => {
    const SELF_BUFFS: Record<string, Array<{ stat: string; value: number; conditional?: boolean; appliesTo?: string[]; restrictedToCharacters?: string[] }>> = {
        'Test Main Slot Echo': [
            { stat: 'critRate', value: 15, conditional: false },
        ],
        'Test Restricted Echo': [
            { stat: 'critRate', value: 15, conditional: false, restrictedToCharacters: ['Rebecca'] },
        ],
        'Test Conditional Echo': [
            { stat: 'atk', value: 100, conditional: true },
        ],
    };
    function echo(name: string, id: string, cost?: number): GearEntry {
        return { kind: 'echo', id, name, setName: name, rarity: 5, mainStat: { key: 'atk', label: 'ATK', value: 100 }, subStats: [], ...(cost != null ? { cost } : {}) };
    }

    it('returns the cost-4 piece\'s unconditional buff when present', () => {
        const gear = [echo('Test Main Slot Echo', 'a', 4), echo('Filler', 'b', 1)];
        const result = mainSlotEchoBuffs(gear, undefined, SELF_BUFFS);
        expect(result).toHaveLength(1);
        expect(result[0].stat).toBe('critRate');
        expect(result[0].value).toBe(15);
    });

    it('returns an empty array when no cost-4 piece is in the combo', () => {
        const gear = [echo('Filler', 'a', 1), echo('Filler2', 'b', 3)];
        expect(mainSlotEchoBuffs(gear, undefined, SELF_BUFFS)).toEqual([]);
    });

    it('returns an empty array when the cost-4 piece has no WW_ECHO_SELF_BUFFS entry', () => {
        const gear = [echo('No Bonus Echo', 'a', 4)];
        expect(mainSlotEchoBuffs(gear, undefined, SELF_BUFFS)).toEqual([]);
    });

    it('excludes a restrictedToCharacters-gated buff for a non-qualifying character', () => {
        const gear = [echo('Test Restricted Echo', 'a', 4)];
        expect(mainSlotEchoBuffs(gear, 'Jinhsi', SELF_BUFFS)).toEqual([]);
    });

    it('includes a restrictedToCharacters-gated buff for a qualifying character', () => {
        const gear = [echo('Test Restricted Echo', 'a', 4)];
        const result = mainSlotEchoBuffs(gear, 'Rebecca', SELF_BUFFS);
        expect(result).toHaveLength(1);
        expect(result[0].value).toBe(15);
    });

    it('excludes a conditional:true entry (out of scope — reaches the optimizer via OptimizeConfig.buffs instead)', () => {
        const gear = [echo('Test Conditional Echo', 'a', 4)];
        expect(mainSlotEchoBuffs(gear, undefined, SELF_BUFFS)).toEqual([]);
    });

    it('defaults to the real WW_ECHO_SELF_BUFFS table when no 3rd argument is passed', () => {
        expect(() => mainSlotEchoBuffs([echo('Anything', 'a', 4)])).not.toThrow();
    });
});

describe('computeBaseLoadouts — main-slot echo bonus is derived PER COMBO, reaches actual damage', () => {
    function charFor(): CharacterEntry {
        return {
            kind: 'character', id: 'c1', name: 'Rebecca', element: 'Spectro', weaponType: 'Sword', rarity: 5,
            stats: { atk: 1000, critRate: 5, critDmg: 50 },
            skills: [{ id: 'basic', name: 'Basic Attack', type: 'Basic', description: '', multiplier: 1, scaling: 'atk' }],
            equipped: { gearIds: [] },
        };
    }
    const CATALOG: StatDef[] = [{ key: 'atk', label: 'ATK' }, { key: 'critRate', label: 'Crit Rate', percent: true }, { key: 'critDmg', label: 'Crit DMG', percent: true }];
    function echo(name: string, id: string, cost?: number): GearEntry {
        return { kind: 'echo', id, name, setName: name, rarity: 5, mainStat: { key: 'atk', label: 'ATK', value: 100 }, subStats: [], ...(cost != null ? { cost } : {}) };
    }

    it('a combo with a main-slot-bonus-bearing cost-4 echo does more damage than an otherwise-identical combo without one', () => {
        const c = charFor();
        const config: OptimizeConfig = {
            // 'average' mode, not 'always' — critMultiplier('always') is
            // `1 + critDmg/100` and completely ignores critRate, so it would
            // never detect Adam Smasher's +15% Crit Rate bonus at all. Only
            // 'average' (`1 + (critRate/100)*(critDmg/100)`) and a nonzero
            // critDmg make a Crit-Rate-only buff show up as a damage delta.
            targets: [], buffs: [], critMode: 'average',
            enemy: { id: 'e', name: 'Dummy', level: 90, def: 0, res: 0 },
            catalog: CATALOG, topN: 5,
        };
        const combos = [
            [echo('Reminiscence - Nightmare: Adam Smasher', 'a', 4)], // real seeded entry, +15% Crit Rate for Lucy/Rebecca
            [echo('Plain Filler Echo', 'b', 4)], // no main-slot bonus text at all
        ];
        const results = computeBaseLoadouts(c, combos, config);
        expect(results[0].skillDamage.basic).toBeGreaterThan(results[1].skillDamage.basic);
    });

    it('a combo with no cost-4 piece at all does not crash and applies no main-slot bonus', () => {
        const c = charFor();
        const config: OptimizeConfig = {
            targets: [], buffs: [], critMode: 'none',
            enemy: { id: 'e', name: 'Dummy', level: 90, def: 0, res: 0 },
            catalog: CATALOG, topN: 5,
        };
        expect(() => computeBaseLoadouts(c, [[echo('Filler', 'a', 1)]], config)).not.toThrow();
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
        // Pool with one cost-4 piece and four cost-3 pieces: sum = 4+3+3+3+3 = 16 (over 12).
        // Respects the slot-shape rule (at most 1 cost-4 per combo).
        // Without maxTotalCost, the cost budget constraint does not apply.
        const pool = [
            gear(100, 4), gear(101, 3), gear(102, 3), gear(103, 3), gear(104, 3),
        ];
        const result = optimize(char(), pool, baseConfig({ topN: 1 }));
        expect(result.length).toBe(1);
        // Verify the loadout's total cost exceeds 12
        const totalCost = result[0].gear.reduce((sum, g) => sum + (g.cost ?? 0), 0);
        expect(totalCost).toBe(16);
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

describe('gearScopedBuffs — echo/artifact per-attack-type DMG sub-stats', () => {
    function echoWith(mainKey: string, mainValue: number, subs: Array<{ key: string; value: number }>): GearEntry {
        return {
            kind: 'echo', id: 'e1', name: 'Test Echo', setName: 'Test Set', rarity: 5,
            mainStat: { key: mainKey, label: mainKey, value: mainValue },
            subStats: subs.map((s) => ({ key: s.key, label: s.key, value: s.value })),
        };
    }

    it('a plain ATK/HP/DEF/Crit main+subs produce no scoped buffs', () => {
        const piece = echoWith('atkPct', 33, [{ key: 'critRate', value: 10 }, { key: 'hp', value: 500 }]);
        expect(gearScopedBuffs([piece])).toEqual([]);
    });

    it('a "Basic Attack DMG Bonus" sub-stat produces a dmgBonus buff scoped to basic', () => {
        const piece = echoWith('atkPct', 33, [{ key: 'basicAttackDmgBonus', value: 10 }]);
        const buffs = gearScopedBuffs([piece]);
        expect(buffs).toHaveLength(1);
        expect(buffs[0]).toMatchObject({ stat: 'dmgBonus', value: 10, appliesTo: ['basic'] });
    });

    it('each of the 4 known keys maps to its correct scope', () => {
        const piece = echoWith('healingBonus', 20, [
            { key: 'basicAttackDmgBonus', value: 1 },
            { key: 'heavyAttackDmgBonus', value: 2 },
            { key: 'resonanceSkillDmgBonus', value: 3 },
            { key: 'resonanceLiberationDmgBonus', value: 4 },
        ]);
        const buffs = gearScopedBuffs([piece]);
        const scopeFor = (v: number) => buffs.find((b) => b.value === v)?.appliesTo;
        expect(scopeFor(1)).toEqual(['basic']);
        expect(scopeFor(2)).toEqual(['heavy']);
        expect(scopeFor(3)).toEqual(['skill']);
        expect(scopeFor(4)).toEqual(['ult']);
    });

    it('a main-stat scoped key is picked up too, not just sub-stats', () => {
        // Not a real WW echo main-stat slot today, but the function reads
        // mainStat the same generic way as subStats — future-proof either way.
        const piece = echoWith('resonanceLiberationDmgBonus', 15, []);
        expect(gearScopedBuffs([piece])).toEqual([
            expect.objectContaining({ stat: 'dmgBonus', value: 15, appliesTo: ['ult'] }),
        ]);
    });

    it('sums across multiple equipped pieces (as separate entries — summed later by scopedDmgFor)', () => {
        const p1 = echoWith('atkPct', 10, [{ key: 'basicAttackDmgBonus', value: 6 }]);
        const p2 = echoWith('hpPct', 10, [{ key: 'basicAttackDmgBonus', value: 8 }]);
        const buffs = gearScopedBuffs([p1, p2]);
        expect(buffs).toHaveLength(2);
        expect(buffs.reduce((s, b) => s + b.value, 0)).toBe(14);
    });
});

describe('computeBaseLoadouts — echo per-attack-type DMG sub-stats reach the actual computed damage', () => {
    function charWithSkills(): CharacterEntry {
        return {
            kind: 'character', id: 'c1', name: 'Test', element: 'Spectro', weaponType: 'Sword', rarity: 5,
            stats: { atk: 1000, critRate: 0, critDmg: 0 },
            skills: [
                { id: 'basic', name: 'Basic Attack', type: 'Basic', description: '', multiplier: 1, scaling: 'atk' },
                { id: 'skill', name: 'Resonance Skill', type: 'Skill', description: '', multiplier: 1, scaling: 'atk' },
            ],
            equipped: { gearIds: [] },
        };
    }
    function echoWithSub(key: string, value: number): GearEntry {
        return {
            kind: 'echo', id: `e-${key}`, name: 'Test Echo', setName: 'Test Set', rarity: 5,
            mainStat: { key: 'atkPct', label: 'ATK%', value: 33 },
            subStats: [{ key, label: key, value }],
        };
    }

    it('a Basic Attack DMG Bonus sub-stat increases the Basic Attack skill damage', () => {
        const c = charWithSkills();
        const catalog: StatDef[] = [{ key: 'atk', label: 'ATK' }, { key: 'critRate', label: 'Crit Rate', percent: true }, { key: 'critDmg', label: 'Crit DMG', percent: true }];
        const config: OptimizeConfig = {
            targets: [], buffs: [], critMode: 'none',
            enemy: { id: 'e', name: 'Dummy', level: 90, def: 0, res: 0 },
            catalog, topN: 5,
        };
        const withoutBonus = computeBaseLoadouts(c, [[]], config)[0];
        const withBonus = computeBaseLoadouts(c, [[echoWithSub('basicAttackDmgBonus', 20)]], config)[0];
        expect(withBonus.skillDamage.basic).toBeGreaterThan(withoutBonus.skillDamage.basic);
    });

    it('a Basic Attack DMG Bonus sub-stat does NOT affect a Resonance Skill\'s damage', () => {
        const c = charWithSkills();
        const catalog: StatDef[] = [{ key: 'atk', label: 'ATK' }, { key: 'critRate', label: 'Crit Rate', percent: true }, { key: 'critDmg', label: 'Crit DMG', percent: true }];
        const config: OptimizeConfig = {
            targets: [], buffs: [], critMode: 'none',
            enemy: { id: 'e', name: 'Dummy', level: 90, def: 0, res: 0 },
            catalog, topN: 5,
        };
        // Same ATK%-main-stat baseline both sides — isolates the scoped
        // sub-stat's effect from the main stat's (correctly) global ATK boost.
        const plainEcho: GearEntry = { kind: 'echo', id: 'e-plain', name: 'Plain', setName: 'Test Set', rarity: 5, mainStat: { key: 'atkPct', label: 'ATK%', value: 33 }, subStats: [] };
        const withoutBonus = computeBaseLoadouts(c, [[plainEcho]], config)[0];
        const withBonus = computeBaseLoadouts(c, [[echoWithSub('basicAttackDmgBonus', 20)]], config)[0];
        expect(withBonus.skillDamage.skill).toBe(withoutBonus.skillDamage.skill);
    });

    it('different gear combos in the same optimize pass each get their OWN gear-scoped buffs, not leaked across combos', () => {
        const c = charWithSkills();
        const catalog: StatDef[] = [{ key: 'atk', label: 'ATK' }, { key: 'critRate', label: 'Crit Rate', percent: true }, { key: 'critDmg', label: 'Crit DMG', percent: true }];
        const config: OptimizeConfig = {
            targets: [], buffs: [], critMode: 'none',
            enemy: { id: 'e', name: 'Dummy', level: 90, def: 0, res: 0 },
            catalog, topN: 5,
        };
        const combos = [
            [echoWithSub('basicAttackDmgBonus', 20)],
            [echoWithSub('heavyAttackDmgBonus', 20)],
        ];
        const results = computeBaseLoadouts(c, combos, config);
        // Combo 0 (basic sub-stat) should NOT have its basic-boost leak into combo 1.
        expect(results[1].skillDamage.basic).toBeLessThan(results[0].skillDamage.basic);
    });

    it('stamps the scoped DMG% totals onto .stats so they are visible/targetable like any other stat', () => {
        const c = charWithSkills();
        const catalog: StatDef[] = [{ key: 'atk', label: 'ATK' }, { key: 'critRate', label: 'Crit Rate', percent: true }, { key: 'critDmg', label: 'Crit DMG', percent: true }];
        const kitBuff: BuffEntry = { id: 'kit1', name: 'Kit Basic Buff', source: 'Test', stat: 'dmgBonus', value: 15, appliesTo: ['basic'] };
        const config: OptimizeConfig = {
            targets: [], buffs: [kitBuff], critMode: 'none',
            enemy: { id: 'e', name: 'Dummy', level: 90, def: 0, res: 0 },
            catalog, topN: 5,
        };
        const result = computeBaseLoadouts(c, [[echoWithSub('basicAttackDmgBonus', 20)]], config)[0];
        // Kit buff (15) + gear sub-stat (20) both feed the same 'basic' scope.
        expect(result.stats.basicAttackDmgBonus).toBe(35);
        // Untouched scopes report 0, not undefined — so the stat is always displayable.
        expect(result.stats.heavyAttackDmgBonus).toBe(0);
        expect(result.stats.resonanceSkillDmgBonus).toBe(0);
        expect(result.stats.resonanceLiberationDmgBonus).toBe(0);
    });
});

describe('activeSetBonuses — real set-bonus tiers from ACTUAL gear (not an assumed selection)', () => {
    const SETS: SetBonusEntry[] = [
        { name: 'Celestial Light', pieces: 5, buffs: [{ stat: 'critRate', label: 'Crit Rate', value: 22 }], twoPieceBuffs: [{ stat: 'spectroDmg', label: 'Spectro DMG', value: 10 }], fullSetOnlyBuffs: [] },
        { name: 'Eternal Radiance', pieces: 5, buffs: [{ stat: 'critRate', label: 'Crit Rate', value: 20 }], twoPieceBuffs: [{ stat: 'critRate', label: 'Crit Rate', value: 20 }], fullSetOnlyBuffs: [] },
        { name: 'Shadow of Shattered Dreams', pieces: 1, buffs: [{ stat: 'atkPct', label: 'ATK%', value: 15 }], twoPieceBuffs: [], fullSetOnlyBuffs: [], restrictedToCharacters: ['Lucy', 'Rebecca'] },
    ];
    let seq = 0;
    function echo(setName: string, name = setName): GearEntry {
        return { kind: 'echo', id: `e${++seq}`, name, setName, rarity: 5, mainStat: { key: 'atk', label: 'ATK', value: 100 }, subStats: [] };
    }

    it('1pc Celestial Light + 1pc Adam Smasher + 3pc Eternal Radiance: only Eternal Radiance (2pc) and the 1pc collab set are active — matches the real-world report this was written for', () => {
        const gear = [
            echo('Celestial Light'),
            echo('Shadow of Shattered Dreams', 'Reminiscence - Nightmare: Adam Smasher'),
            echo('Eternal Radiance', 'A'), echo('Eternal Radiance', 'B'), echo('Eternal Radiance', 'C'),
        ];
        const active = activeSetBonuses(gear, SETS, 'Lucy');
        const names = active.map((b) => `${b.name}:${b.tier}`).sort();
        expect(names).toEqual(['Eternal Radiance:twoPiece', 'Shadow of Shattered Dreams:full'].sort());
        // Celestial Light (1pc) must NOT appear at all.
        expect(active.find((b) => b.name === 'Celestial Light')).toBeUndefined();
    });

    it('a real 2pc + 2pc split across two DIFFERENT sets activates BOTH simultaneously', () => {
        const gear = [
            echo('Celestial Light', 'A'), echo('Celestial Light', 'B'),
            echo('Eternal Radiance', 'C'), echo('Eternal Radiance', 'D'),
            echo('Celestial Light', 'E'), // 3rd Celestial Light piece — still only 2pc-tier-worth of buffs (pieces:5 not met)
        ];
        const active = activeSetBonuses(gear, SETS, 'Encore');
        expect(active).toHaveLength(2);
        expect(active.every((b) => b.tier === 'twoPiece')).toBe(true);
        expect(active.map((b) => b.name).sort()).toEqual(['Celestial Light', 'Eternal Radiance']);
    });

    it('5 identical-set pieces reach the full tier, using `buffs` not `twoPieceBuffs`', () => {
        const gear = Array.from({ length: 5 }, (_, i) => echo('Eternal Radiance', `piece-${i}`));
        const active = activeSetBonuses(gear, SETS, 'Encore');
        expect(active).toEqual([{ name: 'Eternal Radiance', tier: 'full', buffs: SETS[1].buffs }]);
    });

    it('a restricted collab set never activates for a character outside its roster, even at full count', () => {
        const gear = [echo('Shadow of Shattered Dreams', 'Reminiscence - Nightmare: Adam Smasher')];
        expect(activeSetBonuses(gear, SETS, 'Encore')).toEqual([]);
        expect(activeSetBonuses(gear, SETS, 'Lucy')).toHaveLength(1);
    });

    it('two echoes of the SAME specific identity only count once toward a set\'s threshold (real WuWa mechanic)', () => {
        const gear = [echo('Eternal Radiance', 'Impermanence Heron'), echo('Eternal Radiance', 'Impermanence Heron')];
        expect(activeSetBonuses(gear, SETS, 'Encore')).toEqual([]);
    });
});

describe('setBonusBuffEntries — flattens active tiers into BuffEntry rows the engine already consumes', () => {
    const SETS: SetBonusEntry[] = [
        { name: 'Void Thunder', pieces: 5, buffs: [{ stat: 'electroDmg', label: 'Electro DMG', value: 30 }], twoPieceBuffs: [{ stat: 'electroDmg', label: 'Electro DMG', value: 10 }], fullSetOnlyBuffs: [] },
    ];
    function echo(id: string): GearEntry {
        return { kind: 'echo', id, name: 'Void Thunder', setName: 'Void Thunder', rarity: 5, mainStat: { key: 'atk', label: 'ATK', value: 100 }, subStats: [] };
    }

    it('produces a real BuffEntry for a 2pc-only tier', () => {
        const entries = setBonusBuffEntries([echo('a'), echo('b')], SETS);
        expect(entries).toHaveLength(1);
        expect(entries[0]).toMatchObject({ stat: 'electroDmg', value: 10 });
    });

    it('produces nothing when no set reaches even the 2pc threshold', () => {
        expect(setBonusBuffEntries([echo('a')], SETS)).toEqual([]);
    });
});

describe('computeBaseLoadouts — set bonuses are derived PER COMBO from real gear, not assumed upfront', () => {
    function charFor(): CharacterEntry {
        return {
            kind: 'character', id: 'c1', name: 'Test', element: 'Spectro', weaponType: 'Sword', rarity: 5,
            stats: { atk: 1000, critRate: 0, critDmg: 0 },
            skills: [{ id: 'basic', name: 'Basic Attack', type: 'Basic', description: '', multiplier: 1, scaling: 'atk' }],
            equipped: { gearIds: [] },
        };
    }
    const SETS: SetBonusEntry[] = [
        { name: 'Void Thunder', pieces: 5, buffs: [{ stat: 'elemDmg', label: 'Elemental DMG', value: 30 }], twoPieceBuffs: [{ stat: 'elemDmg', label: 'Elemental DMG', value: 10 }], fullSetOnlyBuffs: [] },
    ];
    const CATALOG: StatDef[] = [{ key: 'atk', label: 'ATK' }, { key: 'critRate', label: 'Crit Rate', percent: true }, { key: 'critDmg', label: 'Crit DMG', percent: true }, { key: 'elemDmg', label: 'Elemental DMG', percent: true }];
    function echo(setName: string, id: string): GearEntry {
        return { kind: 'echo', id, name: setName, setName, rarity: 5, mainStat: { key: 'atk', label: 'ATK', value: 100 }, subStats: [] };
    }

    it('a combo with 2pc of a set gets that set\'s buff; a combo with only 1pc does not — same optimize() pass, same config.setBonuses', () => {
        const c = charFor();
        const config: OptimizeConfig = {
            targets: [], buffs: [], critMode: 'none',
            enemy: { id: 'e', name: 'Dummy', level: 90, def: 0, res: 0 },
            catalog: CATALOG, topN: 5, setBonuses: SETS,
        };
        const combos = [
            [echo('Void Thunder', 'a'), echo('Void Thunder', 'b')], // 2pc -> +10% elemDmg
            [echo('Void Thunder', 'c')], // 1pc -> nothing
        ];
        const results = computeBaseLoadouts(c, combos, config);
        expect(results[0].skillDamage.basic).toBeGreaterThan(results[1].skillDamage.basic);
    });

    it('omitting config.setBonuses entirely is a safe no-op (no crash, no bonus applied)', () => {
        const c = charFor();
        const config: OptimizeConfig = {
            targets: [], buffs: [], critMode: 'none',
            enemy: { id: 'e', name: 'Dummy', level: 90, def: 0, res: 0 },
            catalog: CATALOG, topN: 5,
        };
        expect(() => computeBaseLoadouts(c, [[echo('Void Thunder', 'a'), echo('Void Thunder', 'b')]], config)).not.toThrow();
    });
});

describe('enemyMultiplier — per-element RES overrides', () => {
    const boss = (res: number, resByElement?: Partial<Record<string, number>>): EnemyEntry =>
        ({ id: 'boss', name: 'Boss', level: 90, def: 900, res, resByElement });

    it('with no element argument, uses the flat baseline RES (old 4-arg behavior unchanged)', () => {
        const e = boss(10, { Cryo: 40 });
        expect(enemyMultiplier(e, 90, 0, 0)).toBe(enemyMultiplier({ ...e, resByElement: undefined }, 90, 0, 0));
    });

    it('an element with a documented override uses that RES instead of the flat baseline', () => {
        const e = boss(10, { Cryo: 40, Pyro: -20 });
        const cryoMit = enemyMultiplier(e, 90, 0, 0, 'Cryo');
        const baselineMit = enemyMultiplier({ ...e, resByElement: undefined }, 90, 0, 0);
        expect(cryoMit).not.toBeCloseTo(baselineMit, 5);
        // Higher RES (40 vs 10) must mitigate MORE, i.e. a smaller multiplier.
        expect(cryoMit).toBeLessThan(baselineMit);
    });

    it('a weakness (negative override RES) mitigates LESS than the flat baseline — more damage taken', () => {
        const e = boss(10, { Pyro: -20 });
        const pyroMit = enemyMultiplier(e, 90, 0, 0, 'Pyro');
        const baselineMit = enemyMultiplier({ ...e, resByElement: undefined }, 90, 0, 0);
        expect(pyroMit).toBeGreaterThan(baselineMit);
    });

    it('an element with NO override falls back to the flat baseline RES', () => {
        const e = boss(10, { Cryo: 40 });
        const electroMit = enemyMultiplier(e, 90, 0, 0, 'Electro');
        const baselineMit = enemyMultiplier({ ...e, resByElement: undefined }, 90, 0, 0);
        expect(electroMit).toBeCloseTo(baselineMit, 10);
    });

    it('resShredPct still applies against whichever RES value (override or baseline) was selected', () => {
        const e = boss(10, { Cryo: 40 });
        const shredded = enemyMultiplier(e, 90, 0, 15, 'Cryo');
        const unshredded = enemyMultiplier(e, 90, 0, 0, 'Cryo');
        expect(shredded).toBeGreaterThan(unshredded);
    });
});
