/**
 * @fileoverview Genshin Impact combat mechanics & scaling formulas
 * @module adapters/game-definitions/genshin-impact/mechanics
 *
 * Game-specific math that doesn't fit in the generic GameDefinition contract.
 * The damage calculator can import these alongside the base definition when a
 * GI-specific formula is needed. This does NOT modify the shared StatType file.
 */

import type { StatType } from '@shared/types/game-definition';

/**
 * GI-specific scaling multipliers applied during damage calculation.
 */
export const SCALING = {
    /** Base resistance multiplier before set bonuses. */
    baseResistMult: 0.9,
    /** Level-based defense scaling factor. */
    defScalingFactor: 0.7,
    /** Energy recharge threshold for burst availability. */
    energyThreshold: 80,
} as const;

/**
 * GI-specific damage formula hook.
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
 * GI stat aliases that extend the shared StatType vocabulary with
 * game-specific names. Merged at load time; does not touch shared types.
 */
export const STAT_ALIASES: Record<string, string> = {
    'ATK %': 'ATK%',
    'HP %': 'HP%',
    'DEF %': 'DEF%',
    'Crit Rate': 'CRIT Rate',
    'Crit DMG': 'CRIT DMG',
    'Crit RATE': 'CRIT Rate',
    'Energy Recharge': 'Energy Regen',
    'ElementalMastery': 'Elemental Mastery',
    'EM': 'Elemental Mastery',
};

/**
 * The list of stats that GI uses. Subset of the shared StatType union.
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
    'Elemental Mastery',
    'Healing Bonus',
];
