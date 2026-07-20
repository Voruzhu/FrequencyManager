/**
 * Pure rotation-timeline simulation helpers — cooldown-reuse warnings
 * (this file), auto-triggered buff windows, and wave/overflow simulation
 * (added by later tasks in the same feature). Kept separate from
 * `RotationScreen.tsx`/`RotationBuilder.tsx` so each piece of logic is
 * unit-testable in isolation.
 */
import type { RotationStepSpec } from '../types';

/** Cumulative elapsed time BEFORE each step starts (prefix sum of prior
 * steps' `duration`). `elapsedTimes(steps)[i]` is when step `i` begins. */
export function elapsedTimes(steps: RotationStepSpec[]): number[] {
    const out: number[] = [];
    let t = 0;
    for (const s of steps) {
        out.push(t);
        t += s.duration ?? 0;
    }
    return out;
}

/**
 * A non-blocking warning if step `index` reuses a skill before its
 * cooldown (seconds) has elapsed since the SAME character's last use of
 * the SAME skill earlier in the rotation. Only compares against the same
 * character — a different character with the same `skillId` (unlikely,
 * but not impossible with shared generic ids) never counts. Cooldown
 * starts counting once the triggering cast COMPLETES (its elapsed start
 * time + its own duration), not when it starts.
 */
export function cooldownWarningFor(
    steps: RotationStepSpec[],
    elapsed: number[],
    index: number,
    cooldownsBySkillId: Record<string, number>,
): string | undefined {
    const step = steps[index];
    if (!step.skillId) return undefined;
    const cooldown = cooldownsBySkillId[step.skillId];
    if (cooldown == null) return undefined;
    const tNow = elapsed[index];
    for (let j = index - 1; j >= 0; j--) {
        const prior = steps[j];
        if (prior.characterId !== step.characterId || prior.skillId !== step.skillId) continue;
        const readyAt = elapsed[j] + (prior.duration ?? 0) + cooldown;
        if (tNow < readyAt) return `⚠ CD not up — ${(readyAt - tNow).toFixed(1)}s left`;
        return undefined; // found the most recent prior use, it's already off cooldown
    }
    return undefined;
}

/**
 * True if an auto-triggered buff is active at `stepIndex`, given the
 * rotation's steps and their precomputed `elapsedTimes`. The buff becomes
 * active once its triggering skill COMPLETES (trigger step's elapsed start
 * + its own duration) and stays active for `durationSeconds` after that.
 * `restrictToCharacterId`: for a SELF buff, only that character's steps
 * count as valid triggers; omit for a TEAM-wide buff, where any party
 * member's step counts.
 */
export function isAutoBuffActiveAtStep(
    steps: RotationStepSpec[],
    elapsed: number[],
    stepIndex: number,
    autoTrigger: { skillIds: string[]; durationSeconds: number },
    restrictToCharacterId?: string,
): boolean {
    const tNow = elapsed[stepIndex];
    for (let j = 0; j < stepIndex; j++) {
        const s = steps[j];
        if (restrictToCharacterId && s.characterId !== restrictToCharacterId) continue;
        if (!s.skillId || !autoTrigger.skillIds.includes(s.skillId)) continue;
        const triggerCompletesAt = elapsed[j] + (s.duration ?? 0);
        if (tNow >= triggerCompletesAt && tNow - triggerCompletesAt <= autoTrigger.durationSeconds) return true;
    }
    return false;
}
