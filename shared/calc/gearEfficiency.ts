/**
 * @fileoverview Gear roll-quality scoring — independent of any character or
 * build target, answers "how well did this piece roll" rather than "how good
 * is it for X". `rollPct` works for any piece; `critValue` (the community-
 * standard Crit Rate*2 + Crit DMG formula) is included only when the piece
 * actually carries those substats.
 * @module shared/calc/gearEfficiency
 */

import type { GearCatalog } from '../types/game-bundle';

export interface GearEfficiency {
    /** 0-100 — average of (actual roll / max possible roll at this rarity) across the piece's rolled substats. */
    rollPct: number;
    /** Crit Rate*2 + Crit DMG (raw percentage points) — present only when the piece has at least one of those substats. */
    critValue?: number;
}

/** One substat's own roll ratio (0-1, actual/max at this rarity) — the same
 * lookup `gearEfficiency` averages across every substat, exposed standalone
 * so a caller can grade EACH substat individually (e.g. the build card's
 * per-line color grade) instead of only a piece-wide blend. Returns
 * undefined when the stat has no catalog range at this rarity (nothing to
 * compare against — never fabricate a ratio). */
export function subStatRollRatio(
    key: string,
    value: number,
    rarity: number,
    catalog: Pick<GearCatalog, 'subs'>,
): number | undefined {
    const range = catalog.subs.find((s) => s.key === key)?.byRarity[rarity];
    return range && range.max > 0 ? Math.min(1, value / range.max) : undefined;
}

export function gearEfficiency(
    gear: { rarity: number; subStats: Array<{ key: string; value: number }> },
    catalog: Pick<GearCatalog, 'subs'>,
): GearEfficiency {
    const ratios: number[] = [];
    let critRate = 0;
    let critDmg = 0;
    let hasCrit = false;

    for (const sub of gear.subStats) {
        const ratio = subStatRollRatio(sub.key, sub.value, gear.rarity, catalog);
        if (ratio != null) ratios.push(ratio);
        if (sub.key === 'critRate') { critRate = sub.value; hasCrit = true; }
        if (sub.key === 'critDmg') { critDmg = sub.value; hasCrit = true; }
    }

    const rollPct = ratios.length > 0 ? (ratios.reduce((a, b) => a + b, 0) / ratios.length) * 100 : 0;
    return hasCrit ? { rollPct, critValue: critRate * 2 + critDmg } : { rollPct };
}
