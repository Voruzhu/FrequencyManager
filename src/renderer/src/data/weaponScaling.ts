/**
 * @fileoverview Weapon level (1-90) + refinement (R1-R5) scaling accessor.
 *
 * The per-game generated tables (baked from genshin-db / the WW datamine) store a
 * handful of deduped normalized level curves plus a per-weapon curve index and a
 * 5-length refinement multiplier. This module resolves them into concrete values so
 * the Weapon Inspector's level slider and R1-R5 selector show real in-game stats.
 *
 * Weapons with no scaling data (starters, or a game not yet baked) return null —
 * callers fall back to the shipped Lv90 / R1 values.
 */
import * as genshinImpact from './weapon-scaling.genshin-impact.generated';
import * as wutheringWaves from './weapon-scaling.wuthering-waves.generated';

interface ScalingTable {
    atkCurves: number[][];
    secCurves: number[][];
    byId: Record<string, { a: number; s: number; refine: number[] }>;
}

const TABLES: Record<string, ScalingTable> = {
    'genshin-impact': genshinImpact as ScalingTable,
    'wuthering-waves': wutheringWaves as ScalingTable,
};

export interface WeaponScaling {
    /** Normalized base-ATK curve, index [level-1]. */
    atkCurve: number[];
    /** Normalized secondary-stat curve, index [level-1]. */
    secCurve: number[];
    /** Passive multiplier per refinement, index [refine-1] (R1 = 1). */
    refine: number[];
}

export function getWeaponScaling(gameId: string, weaponId: string): WeaponScaling | null {
    const t = TABLES[gameId];
    const e = t?.byId[weaponId];
    if (!t || !e) return null;
    return { atkCurve: t.atkCurves[e.a], secCurve: t.secCurves[e.s], refine: e.refine };
}

const clampLevel = (lv: number) => Math.min(Math.max(Math.round(lv), 1), 90);

/** Base ATK at the given level (1-90), derived from the shipped Lv90 base. */
export function atkAtLevel(sc: WeaponScaling | null, base90: number, level: number): number {
    if (!sc) return base90;
    return Math.round(base90 * (sc.atkCurve[clampLevel(level) - 1] ?? 1));
}

/** Secondary-stat value at the given level (1-90), derived from the shipped Lv90 value. */
export function secAtLevel(sc: WeaponScaling | null, sec90: number, level: number): number {
    if (!sc) return sec90;
    return Math.round(sec90 * (sc.secCurve[clampLevel(level) - 1] ?? 1) * 10) / 10;
}

/** Passive-value multiplier for refinement R (1-5). 1 when no scaling data. */
export function refineMul(sc: WeaponScaling | null, refine: number): number {
    if (!sc) return 1;
    return sc.refine[Math.min(Math.max(Math.round(refine), 1), 5) - 1] ?? 1;
}

/** True when this weapon's passive actually changes with refinement (some don't). */
export function hasRefinement(sc: WeaponScaling | null): boolean {
    return !!sc && sc.refine.some((m) => Math.abs(m - 1) > 1e-6);
}
