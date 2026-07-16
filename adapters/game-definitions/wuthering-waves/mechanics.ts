/**
 * @fileoverview Wuthering Waves combat mechanics & scaling formulas
 * @module adapters/game-definitions/wuthering-waves/mechanics
 *
 * Game-specific math that doesn't fit in the generic GameDefinition contract.
 * The damage calculator can import these alongside the base definition when a
 * WU-specific formula is needed. Keeping this separate means the shared
 * variables file (StatType, etc.) stays generalized for all gacha games.
 */

import type { StatType } from '@shared/types/game-definition';

/**
 * WU-specific scaling multipliers applied during damage calculation.
 * These extend (not replace) the canonical stat pipeline.
 */
export const SCALING = {
    /** Base resistance multiplier before set bonuses. */
    baseResistMult: 0.9,
    /** Level-based defense scaling factor. */
    defScalingFactor: 0.65,
    /** Concerto (energy) threshold for resonance liberation. */
    concertoThreshold: 100,
} as const;

/**
 * WU-specific damage formula hook.
 *
 * @param atk      - Final ATK after buffs
 * @param multiplier - Action multiplier from the GameDefinition
 * @param resistMul - Resistance multiplier (post set-bonus)
 * @returns raw damage before crit
 */
export function computeBaseDamage(
    atk: number,
    multiplier: number,
    resistMul: number,
): number {
    return atk * multiplier * resistMul * SCALING.defScalingFactor;
}

/**
 * WU stat aliases that extend the shared `StatType` vocabulary with
 * game-specific names. These are merged with `GameDefinition.statAliases`
 * at load time but do not modify the shared types file.
 */
export const STAT_ALIASES: Record<string, string> = {
    'ATK %': 'ATK%',
    'HP %': 'HP%',
    'DEF %': 'DEF%',
    'Energy Recharge': 'Energy Regen',
};

/**
 * The list of stats that WU uses. This is a subset of the shared
 * `StatType` union; it does not change the shared file.
 */
export const USED_STATS: StatType[] = [
    'ATK',
    'ATK%',
    'HP',
    'HP%',
    'DEF',
    'DEF%',
    'CRIT Rate',
    'CRIT DMG',
    'Energy Regen',
    'Healing Bonus',
    'Effect Hit Rate',
    'Effect RES',
];