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

/** One enemy target in a rotation's Wave/Boss config. `hp` optional — when
 * unset, this wave never triggers an overflow/transition (damage just
 * applies with nothing to discard against), same as today's plain
 * single-target behavior. */
export interface WaveConfig {
    enemyId: string;
    hp?: number;
}

/**
 * Per-step-granularity overflow simulation (a stated, permanent
 * simplification — see this feature's spec, Section 4 — NOT per
 * individual hit within a multi-hit skill). Each step's total damage is
 * applied to the current wave's remaining HP; if it would go negative,
 * the excess is discarded and the next wave starts fresh. A step that
 * lands the killing blow is attributed to the wave IT KILLED, not the
 * next one — its own excess is what carries no further.
 */
export function simulateWaves(stepDamages: number[], waves: WaveConfig[]): { waveIndexForStep: number[]; damageByWave: number[]; overflowDiscarded: number } {
    const waveIndexForStep: number[] = [];
    const damageByWave: number[] = waves.map(() => 0);
    let overflowDiscarded = 0;
    let currentWave = 0;
    let remaining = waves[0]?.hp;

    for (const dmg of stepDamages) {
        waveIndexForStep.push(currentWave);
        if (remaining == null) {
            // No HP tracked for this wave — apply in full, nothing to discard.
            damageByWave[currentWave] += dmg;
            continue;
        }
        // Strictly LESS than, not <=: an EXACT-lethal hit (dmg === remaining)
        // must fall through to the overkill branch below so the wave
        // transition happens THIS step. Deferring it to "next step notices
        // remaining is already 0" (the old `<=` here) meant the very next
        // step's entire damage got computed as `overflow = dmg - 0 = dmg`
        // against the already-dead wave and silently discarded, instead of
        // landing on the wave that should already be current.
        if (dmg < remaining) {
            damageByWave[currentWave] += dmg;
            remaining -= dmg;
            continue;
        }
        // Overkill (or an exact kill, overflow = 0) this step.
        damageByWave[currentWave] += remaining;
        const overflow = dmg - remaining;
        const nextWave = currentWave + 1;
        if (nextWave < waves.length) {
            currentWave = nextWave;
            remaining = waves[currentWave]?.hp;
            // The overflow does NOT carry to the next wave — it's simply lost, not re-applied.
            overflowDiscarded += overflow;
        } else {
            // No next wave — nothing left to discard into; the excess just never counts.
            overflowDiscarded += overflow;
            remaining = undefined; // no further tracking for any remaining steps
        }
    }
    return { waveIndexForStep, damageByWave, overflowDiscarded };
}
