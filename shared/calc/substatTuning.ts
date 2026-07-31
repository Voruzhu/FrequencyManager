/**
 * Wuthering Waves echo "Tuning" odds — WW ONLY. A Tuner re-rolls ONE existing
 * substat to a uniformly random value among that stat's fixed grade pool; this
 * is a real mechanic Kuro Games disclosed in full under Korean gacha-odds law
 * (see wuwa.uk/articles/echo-substat-math, cross-referencing that disclosure).
 * Every substat has 8 possible grades EXCEPT flat ATK and flat DEF, which have
 * only 4 — both counts and the "uniform per grade" model are the sourced,
 * disclosed mechanic, not an assumption.
 *
 * Genshin Impact artifact substats are deliberately NOT modeled here: each
 * roll instance draws from its own small discrete set (e.g. Crit Rate:
 * 2.7/3.0/3.3/3.6/3.9 per roll, several roll instances summed), and unlike WW,
 * no official per-value weight table for that draw has been found — modeling
 * it would mean guessing weights, which this project's data doesn't do.
 */

/** Flat ATK and DEF have only 4 tuning grades; every other substat has 8. */
const FEWER_GRADE_STATS = new Set(['atk', 'def']);

export function gradeCountFor(statKey: string): number {
    return FEWER_GRADE_STATS.has(statKey) ? 4 : 8;
}

/** The full set of values a Tuner can land on for this stat, evenly spaced
 * from the catalog's sourced min to max (grade 1 = min, last grade = max). */
export function gradeValues(min: number, max: number, statKey: string): number[] {
    const n = gradeCountFor(statKey);
    const decimals = Number.isInteger(min) && Number.isInteger(max) ? 0 : 1;
    const scale = 10 ** decimals;
    return Array.from({ length: n }, (_, i) => Math.round((min + (max - min) * (i / (n - 1))) * scale) / scale);
}

/** Which grade a rolled value is closest to (for locating a real gear piece's
 * current roll on the ladder — real values can round slightly differently
 * than this evenly-spaced reconstruction). */
export function nearestGradeIndex(value: number, grades: number[]): number {
    let best = 0;
    let bestDiff = Infinity;
    grades.forEach((g, i) => {
        const d = Math.abs(g - value);
        if (d < bestDiff) { bestDiff = d; best = i; }
    });
    return best;
}

export interface TuningOdds {
    grades: number[];
    currentIndex: number;
    /** Chance a single Tuner use rolls STRICTLY higher than the current grade. */
    probUpgrade: number;
    /** Chance a single Tuner use rolls the maximum grade (1 / grade count). */
    probMax: number;
    /** Average value across all grades — the expected result of one reroll, ignoring the current value. */
    expectedValue: number;
}

export function tuningOdds(currentValue: number, min: number, max: number, statKey: string): TuningOdds {
    const grades = gradeValues(min, max, statKey);
    const currentIndex = nearestGradeIndex(currentValue, grades);
    const higherCount = grades.filter((g) => g > grades[currentIndex]).length;
    return {
        grades,
        currentIndex,
        probUpgrade: higherCount / grades.length,
        probMax: 1 / grades.length,
        expectedValue: grades.reduce((a, b) => a + b, 0) / grades.length,
    };
}

/** Monte Carlo: `rerolls` independent draws from the real uniform distribution
 * over `grades` — a genuine simulation of the disclosed mechanic, not a
 * fabricated one. `rng` is injectable for deterministic tests. */
export function simulateTuning(grades: number[], rerolls: number, rng: () => number = Math.random): number[] {
    return Array.from({ length: rerolls }, () => grades[Math.floor(rng() * grades.length)]);
}
