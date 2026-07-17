/**
 * Loadout optimizer — re-exported from the shared engine (`@shared/calc/optimizer`)
 * so the renderer and the backend damage-calculator run the exact same code.
 * The renderer calls the backend `optimize` RPC when available and uses this as
 * the client-side fallback; either path yields identical results.
 */
export {
    CRIT_MODE_LABEL,
    REACTION_LABEL,
    enemyMultiplier,
    computeBuildStats,
    critMultiplier,
    skillDamage,
    skillMultiplierAt,
    effectiveSkillMultiplier,
    applyConstellationLevelBoosts,
    targetValue,
    optimize,
    elemKey,
    computeBaseLoadouts,
    targetRanges,
    scoreAndRank,
    isScopedBuff,
} from '@shared/calc/optimizer';

export type {
    CritMode,
    ReactionType,
    SkillContext,
    Target,
    OptimizeConfig,
    BuildStats,
    Loadout,
} from '@shared/calc/optimizer';
