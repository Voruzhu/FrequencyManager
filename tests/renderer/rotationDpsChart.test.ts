import { cumulativeDamageSeries } from '../../src/renderer/src/lib/rotationDpsChart';

describe('cumulativeDamageSeries', () => {
    it('starts at (0, 0) even with no steps', () => {
        expect(cumulativeDamageSeries([], [])).toEqual([{ t: 0, cumulative: 0 }]);
    });

    it('accumulates damage across steps, pairing each with its own elapsed start time', () => {
        const series = cumulativeDamageSeries([0, 1.5, 3], [{ damage: 100 }, { damage: 50 }, { damage: 200 }]);
        expect(series).toEqual([
            { t: 0, cumulative: 0 },
            { t: 0, cumulative: 100 },
            { t: 1.5, cumulative: 150 },
            { t: 3, cumulative: 350 },
        ]);
    });

    it('never decreases — damage only accumulates, even with a zero-damage step', () => {
        const series = cumulativeDamageSeries([0, 1, 2], [{ damage: 100 }, { damage: 0 }, { damage: 50 }]);
        const cumulatives = series.map((p) => p.cumulative);
        expect(cumulatives).toEqual([0, 100, 100, 150]);
    });

    it('falls back to 0 elapsed time for a step missing an entry in the elapsed array', () => {
        const series = cumulativeDamageSeries([0], [{ damage: 10 }, { damage: 20 }]);
        expect(series[2]).toEqual({ t: 0, cumulative: 30 });
    });
});
