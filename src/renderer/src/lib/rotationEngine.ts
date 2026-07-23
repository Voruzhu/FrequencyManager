/**
 * Pure rotation-timeline simulation helpers — cooldown-reuse warnings
 * (this file), auto-triggered buff windows, and wave/overflow simulation
 * (added by later tasks in the same feature). Kept separate from
 * `RotationScreen.tsx`/`RotationBuilder.tsx` so each piece of logic is
 * unit-testable in isolation.
 */
import type { RotationStepSpec } from '../types';
import { getEnemies, DUMMY, type Enemy } from '../data/enemies';

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

/** One enemy target in a rotation's Wave/Boss config. `hp` optional — when
 * unset, this wave never triggers an overflow/transition (damage just
 * applies with nothing to discard against), same as today's plain
 * single-target behavior. `level`/`def`/`res` are custom defensive overrides
 * for THIS wave specifically (mirrors the Calculator's per-enemy Configure
 * dialog) — unset falls back to `enemyId`'s catalog preset, see
 * `resolveWaveEnemy`. Independent per rotation/wave: this no longer shares
 * the Calculator screen's single global enemy setting. */
export interface WaveConfig {
    enemyId: string;
    hp?: number;
    level?: number;
    def?: number;
    res?: number;
}

/** Resolves a wave's actual enemy for damage computation: the catalog preset
 * for `wave.enemyId`, with any custom `level`/`def`/`res` override applied
 * (real per-element `resByElement` always comes from the preset — there's no
 * per-wave override for that, matching the Calculator's own Configure dialog,
 * which shows it read-only). Falls back to the Training Dummy if `enemyId`
 * doesn't match any known enemy (e.g. a stale/removed catalog id). */
export function resolveWaveEnemy(wave: WaveConfig, gameId: string): Enemy {
    const preset = getEnemies(gameId).find((e) => e.id === wave.enemyId) ?? DUMMY;
    return {
        ...preset,
        level: wave.level ?? preset.level,
        def: wave.def ?? preset.def,
        res: wave.res ?? preset.res,
    };
}

/**
 * Single-step wave-transition decision: given this step's raw damage and the
 * current wave/remaining-HP state, how much of it lands on the CURRENT wave,
 * how much overflows (discarded, never carried to the next wave), and what
 * the next step's wave/remaining state should be. Pure and side-effect-free
 * so the exact same rule can drive both the Rotation screen's progressive
 * per-step damage computation (which needs to know WHICH wave's enemy to use
 * for step N+1 before computing its damage) and `simulateWaves`' post-hoc
 * summary bucketing below, without duplicating the transition logic twice.
 */
export function applyWaveTransition(
    dmg: number,
    waves: WaveConfig[],
    currentWave: number,
    remaining: number | undefined,
): { appliedToCurrentWave: number; overflow: number; nextWave: number; nextRemaining: number | undefined } {
    if (remaining == null) {
        // No HP tracked for this wave — apply in full, nothing to discard.
        return { appliedToCurrentWave: dmg, overflow: 0, nextWave: currentWave, nextRemaining: undefined };
    }
    // Strictly LESS than, not <=: an EXACT-lethal hit (dmg === remaining)
    // must fall through to the overkill branch below so the wave transition
    // happens THIS step. Deferring it to "next step notices remaining is
    // already 0" (a `<=` here) would mean the very next step's entire damage
    // gets computed as `overflow = dmg - 0 = dmg` against the already-dead
    // wave and silently discarded, instead of landing on the wave that
    // should already be current.
    if (dmg < remaining) {
        return { appliedToCurrentWave: dmg, overflow: 0, nextWave: currentWave, nextRemaining: remaining - dmg };
    }
    // Overkill (or an exact kill, overflow = 0) this step.
    const overflow = dmg - remaining;
    const nextWave = currentWave + 1;
    if (nextWave < waves.length) {
        // The overflow does NOT carry to the next wave — it's simply lost, not re-applied.
        return { appliedToCurrentWave: remaining, overflow, nextWave, nextRemaining: waves[nextWave]?.hp };
    }
    // No next wave — nothing left to discard into; the excess just never
    // counts, and there's no further HP tracking for any remaining steps.
    return { appliedToCurrentWave: remaining, overflow, nextWave: currentWave, nextRemaining: undefined };
}

/**
 * Per-step-granularity overflow simulation (a stated, permanent
 * simplification — see this feature's spec, Section 4 — NOT per
 * individual hit within a multi-hit skill). A thin driver over
 * `applyWaveTransition` above — kept as its own function since callers
 * (the Rotation screen's summary card) just want the aggregate bucketing
 * over an already-computed damage array, not the step-by-step decision.
 */
export function simulateWaves(stepDamages: number[], waves: WaveConfig[]): { waveIndexForStep: number[]; damageByWave: number[]; overflowDiscarded: number } {
    const waveIndexForStep: number[] = [];
    const damageByWave: number[] = waves.map(() => 0);
    let overflowDiscarded = 0;
    let currentWave = 0;
    let remaining = waves[0]?.hp;

    for (const dmg of stepDamages) {
        waveIndexForStep.push(currentWave);
        const t = applyWaveTransition(dmg, waves, currentWave, remaining);
        damageByWave[currentWave] += t.appliedToCurrentWave;
        overflowDiscarded += t.overflow;
        currentWave = t.nextWave;
        remaining = t.nextRemaining;
    }
    return { waveIndexForStep, damageByWave, overflowDiscarded };
}
