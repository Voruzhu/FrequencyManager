import { elapsedTimes, cooldownWarningFor, isAutoBuffActiveAtStep } from '../../src/renderer/src/lib/rotationEngine';
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
