import { gradeCountFor, gradeValues, nearestGradeIndex, tuningOdds, simulateTuning } from '../../shared/calc/substatTuning';

describe('gradeCountFor', () => {
    it('flat ATK and DEF have 4 grades', () => {
        expect(gradeCountFor('atk')).toBe(4);
        expect(gradeCountFor('def')).toBe(4);
    });
    it('every other substat has 8 grades', () => {
        expect(gradeCountFor('critRate')).toBe(8);
        expect(gradeCountFor('hp')).toBe(8);
        expect(gradeCountFor('atkPct')).toBe(8);
    });
});

describe('gradeValues', () => {
    it('produces 8 evenly-spaced values from min to max for a percent stat', () => {
        const grades = gradeValues(6.4, 11.6, 'atkPct');
        expect(grades).toHaveLength(8);
        expect(grades[0]).toBe(6.4);
        expect(grades[7]).toBe(11.6);
        // evenly spaced: each step is (11.6-6.4)/7
        const step = (11.6 - 6.4) / 7;
        expect(grades[1]).toBeCloseTo(6.4 + step, 1);
    });

    it('produces exactly 4 evenly-spaced values for flat ATK', () => {
        const grades = gradeValues(30, 70, 'atk');
        expect(grades).toHaveLength(4);
        expect(grades[0]).toBe(30);
        expect(grades[3]).toBe(70);
        expect(grades).toEqual([30, 43, 57, 70]); // integer min/max round to whole numbers
    });

    it('rounds to whole numbers when min/max are both integers, else 1 decimal', () => {
        const flat = gradeValues(320, 580, 'hp');
        expect(flat.every((v) => Number.isInteger(v))).toBe(true);
        const pct = gradeValues(6.4, 11.6, 'critRate');
        expect(pct.every((v) => Math.round(v * 10) === v * 10)).toBe(true);
    });
});

describe('nearestGradeIndex', () => {
    it('finds the exact match', () => {
        expect(nearestGradeIndex(11.6, [6.4, 7.1, 7.9, 8.6, 9.3, 10.1, 10.8, 11.6])).toBe(7);
    });
    it('finds the closest grade for a real rolled value that doesn\'t land exactly on the reconstruction', () => {
        expect(nearestGradeIndex(9.2, [6.4, 7.1, 7.9, 8.6, 9.3, 10.1, 10.8, 11.6])).toBe(4);
    });
});

describe('tuningOdds', () => {
    it('a piece already at the max grade has 0% chance to upgrade and 1/N chance to hit max again', () => {
        const odds = tuningOdds(11.6, 6.4, 11.6, 'atkPct');
        expect(odds.currentIndex).toBe(7);
        expect(odds.probUpgrade).toBe(0);
        expect(odds.probMax).toBeCloseTo(1 / 8);
    });

    it('a piece at the minimum grade has the highest possible upgrade chance (7/8)', () => {
        const odds = tuningOdds(6.4, 6.4, 11.6, 'atkPct');
        expect(odds.currentIndex).toBe(0);
        expect(odds.probUpgrade).toBeCloseTo(7 / 8);
    });

    it('flat ATK (4 grades) has correspondingly coarser odds than an 8-grade stat', () => {
        const odds = tuningOdds(30, 30, 70, 'atk');
        expect(odds.grades).toHaveLength(4);
        expect(odds.probMax).toBeCloseTo(1 / 4);
        expect(odds.probUpgrade).toBeCloseTo(3 / 4);
    });

    it('expectedValue is the plain average across all grades', () => {
        const odds = tuningOdds(30, 30, 70, 'atk'); // grades: 30, 43, 57, 70
        expect(odds.expectedValue).toBeCloseTo((30 + 43 + 57 + 70) / 4, 1);
    });
});

describe('simulateTuning', () => {
    it('draws exactly N results, every one a real member of the grade pool', () => {
        const grades = [6.4, 7.1, 7.9, 8.6, 9.3, 10.1, 10.8, 11.6];
        const results = simulateTuning(grades, 50, () => 0.999999);
        expect(results).toHaveLength(50);
        expect(results.every((r) => grades.includes(r))).toBe(true);
    });

    it('is deterministic given an injected rng — rng()=0 always lands on the first grade, rng()~1 on the last', () => {
        const grades = [1, 2, 3, 4];
        expect(simulateTuning(grades, 3, () => 0)).toEqual([1, 1, 1]);
        expect(simulateTuning(grades, 3, () => 0.99)).toEqual([4, 4, 4]);
    });
});
