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

export function gearEfficiency(
    gear: { rarity: number; subStats: Array<{ key: string; value: number }> },
    catalog: Pick<GearCatalog, 'subs'>,
): GearEfficiency {
    const ratios: number[] = [];
    let critRate = 0;
    let critDmg = 0;
    let hasCrit = false;

    for (const sub of gear.subStats) {
        const range = catalog.subs.find((s) => s.key === sub.key)?.byRarity[gear.rarity];
        if (range && range.max > 0) ratios.push(Math.min(1, sub.value / range.max));
        if (sub.key === 'critRate') { critRate = sub.value; hasCrit = true; }
        if (sub.key === 'critDmg') { critDmg = sub.value; hasCrit = true; }
    }

    const rollPct = ratios.length > 0 ? (ratios.reduce((a, b) => a + b, 0) / ratios.length) * 100 : 0;
    return hasCrit ? { rollPct, critValue: critRate * 2 + critDmg } : { rollPct };
}
