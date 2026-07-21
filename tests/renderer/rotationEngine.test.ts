import { elapsedTimes, cooldownWarningFor, isAutoBuffActiveAtStep, simulateWaves, type WaveConfig } from '../../src/renderer/src/lib/rotationEngine';
import type { RotationStepSpec } from '../../src/renderer/src/types';

const step = (characterId: string, skillId: string, duration: number): RotationStepSpec =>
    ({ characterId, actionType: 'skill', skillId, duration });

describe('elapsedTimes', () => {
    it('returns cumulative elapsed time BEFORE each step starts', () => {
        const steps = [step('a', 's1', 2), step('a', 's2', 3), step('a', 's3', 1)];
        expect(elapsedTimes(steps)).toEqual([0, 2, 5]);
    });

    it('returns an empty array for no steps', () => {
        expect(elapsedTimes([])).toEqual([]);
    });
});

describe('cooldownWarningFor', () => {
    const cooldowns = { ult: 24 };

    it('no warning for a skill with no known cooldown', () => {
        const steps = [step('a', 'basic', 1), step('a', 'basic', 1)];
        const elapsed = elapsedTimes(steps);
        expect(cooldownWarningFor(steps, elapsed, 1, cooldowns)).toBeUndefined();
    });

    it('no warning on first use', () => {
        const steps = [step('a', 'ult', 2)];
        expect(cooldownWarningFor(steps, elapsedTimes(steps), 0, cooldowns)).toBeUndefined();
    });

    it('warns when reused before cooldown elapsed', () => {
        const steps = [step('a', 'ult', 2), step('a', 'basic', 5), step('a', 'ult', 1)];
        const elapsed = elapsedTimes(steps); // [0, 2, 7] — 2nd 'ult' starts at t=7, 1st completed at t=2, CD=24 -> not up until t=26
        expect(cooldownWarningFor(steps, elapsed, 2, cooldowns)).toMatch(/CD not up/);
    });

    it('no warning once cooldown has genuinely elapsed', () => {
        const steps = [step('a', 'ult', 2), step('a', 'basic', 30), step('a', 'ult', 1)];
        const elapsed = elapsedTimes(steps); // [0, 2, 32] — 1st completed at t=2, CD up at t=26, 2nd starts at t=32
        expect(cooldownWarningFor(steps, elapsed, 2, cooldowns)).toBeUndefined();
    });

    it('only compares against the SAME character\'s prior use of the SAME skill', () => {
        const steps = [step('a', 'ult', 2), step('b', 'ult', 1)]; // different character, same skillId
        expect(cooldownWarningFor(steps, elapsedTimes(steps), 1, cooldowns)).toBeUndefined();
    });
});

describe('isAutoBuffActiveAtStep', () => {
    const trigger = { skillIds: ['skill'], durationSeconds: 15 };

    it('inactive before any trigger has been cast', () => {
        const steps = [step('a', 'basic', 1), step('a', 'ult', 1)];
        expect(isAutoBuffActiveAtStep(steps, elapsedTimes(steps), 1, trigger, 'a')).toBe(false);
    });

    it('active within the window after the triggering skill completes', () => {
        const steps = [step('a', 'skill', 2), step('a', 'ult', 1)]; // skill completes at t=2, ult starts at t=2
        expect(isAutoBuffActiveAtStep(steps, elapsedTimes(steps), 1, trigger, 'a')).toBe(true);
    });

    it('inactive once the window has passed', () => {
        const steps = [step('a', 'skill', 2), step('a', 'basic', 20), step('a', 'ult', 1)]; // ult starts at t=22, window ends at t=17
        expect(isAutoBuffActiveAtStep(steps, elapsedTimes(steps), 2, trigger, 'a')).toBe(false);
    });

    it('a self-buff (restrictToCharacterId set) ignores a different character\'s trigger cast', () => {
        const steps = [step('b', 'skill', 2), step('a', 'ult', 1)];
        expect(isAutoBuffActiveAtStep(steps, elapsedTimes(steps), 1, trigger, 'a')).toBe(false);
    });

    it('a team-wide buff (no restrictToCharacterId) counts any character\'s trigger cast', () => {
        const steps = [step('b', 'skill', 2), step('a', 'ult', 1)];
        expect(isAutoBuffActiveAtStep(steps, elapsedTimes(steps), 1, trigger)).toBe(true);
    });
});

describe('simulateWaves', () => {
    it('single wave, no HP set — behaves like today, no tracking, all damage counted', () => {
        const waves: WaveConfig[] = [{ enemyId: 'boss-1' }];
        const result = simulateWaves([100, 200, 300], waves);
        expect(result.waveIndexForStep).toEqual([0, 0, 0]);
        expect(result.damageByWave).toEqual([600]);
        expect(result.overflowDiscarded).toBe(0);
    });

    it('single wave with HP, damage never exceeds it — no overflow', () => {
        const waves: WaveConfig[] = [{ enemyId: 'boss-1', hp: 1000 }];
        const result = simulateWaves([100, 200, 300], waves);
        expect(result.waveIndexForStep).toEqual([0, 0, 0]);
        expect(result.damageByWave).toEqual([600]);
        expect(result.overflowDiscarded).toBe(0);
    });

    it('two waves, a step overkills wave 1 — overflow discarded, wave advances', () => {
        const waves: WaveConfig[] = [{ enemyId: 'mob-1', hp: 150 }, { enemyId: 'mob-2', hp: 500 }];
        // step0: 100 dmg -> wave0 remaining 150-100=50. step1: 200 dmg > 50 remaining ->
        // wave0 gets only its last 50 (total wave0 = 100+50 = 150, exactly its own HP,
        // never more), overflow = 200-50 = 150 discarded, wave advances. step2: 300 dmg,
        // well within wave1's 500 HP -> wave1 gets the full 300.
        const result = simulateWaves([100, 200, 300], waves);
        expect(result.waveIndexForStep).toEqual([0, 0, 1]); // step1 is the killing blow, STILL attributed to wave 0 (the wave it killed); step2 is wave 1
        expect(result.overflowDiscarded).toBe(150);
        expect(result.damageByWave).toEqual([150, 300]); // wave0 capped at exactly its own HP (150); wave1 got step2's 300
        // Invariant worth re-checking on any future change to this function:
        // damageByWave.reduce(sum) + overflowDiscarded === stepDamages.reduce(sum).
        // Here: (150+300) + 150 === 100+200+300 === 600.
    });

    it('regression: an EXACT-lethal hit (dmg === remaining HP) advances the wave immediately, not on the next step', () => {
        // Before the fix, an exact kill left `remaining` at 0 without advancing
        // `currentWave` — the NEXT step then computed `overflow = dmg - 0 = dmg`
        // against the already-dead wave and discarded the ENTIRE next step's
        // damage instead of crediting it to the following wave.
        const waves: WaveConfig[] = [{ enemyId: 'mob-1', hp: 100 }, { enemyId: 'mob-2', hp: 200 }];
        const result = simulateWaves([100, 50], waves);
        expect(result.waveIndexForStep).toEqual([0, 1]);
        expect(result.damageByWave).toEqual([100, 50]);
        expect(result.overflowDiscarded).toBe(0);
    });

    it('last wave exhausted — remaining steps still deal (uncapped) damage, just no further wave-transition tracking', () => {
        // Per this feature's spec (Section 4): "If no next wave exists, remaining
        // steps just deal full damage with no further tracking" — the damage still
        // COUNTS (toward the last wave's total, since there's no next wave to move
        // to), it just stops being capped/discarded against anything from here on.
        const waves: WaveConfig[] = [{ enemyId: 'mob-1', hp: 50 }];
        const result = simulateWaves([100, 200], waves);
        expect(result.waveIndexForStep).toEqual([0, 0]); // currentWave never advances past the last real wave
        expect(result.damageByWave).toEqual([250]); // 50 (capped portion of step0) + 200 (step1, uncapped post-exhaustion) = 250
        expect(result.overflowDiscarded).toBe(50); // ONLY step0's actual overkill (100-50); step1 has nothing left to overflow against, so all of it counts
        // Invariant: (250) + 50 === 100+200 === 300.
    });
});
