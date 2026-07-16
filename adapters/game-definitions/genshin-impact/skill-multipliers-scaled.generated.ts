/**
 * @fileoverview AUTO-GENERATED HP/DEF-scaled skill multipliers (Genshin Impact)
 * @module adapters/game-definitions/genshin-impact/skill-multipliers-scaled.generated
 *
 * Real DAMAGE-component multipliers (per level) for HP/DEF-scaled skills, from
 * genshin-db — the labeled component matching the authored scaling stat, excluding
 * heal/shield/absorb. Our previous authored values here were largely fabricated.
 * Merged over authored tables in bundle.ts alongside the ATK overrides. DO NOT edit
 * by hand — re-run scripts/import-gi-scaled-multipliers.cjs. 13 entries.
 *
 * EXTENDED to 15 levels (2026-07-10, scripts/extend-gi-multipliers-to-15.cjs) — see
 * skill-multipliers.generated.ts's header for why (Constellation 3/5's "+3 skill
 * levels, max 15" needs 11-15; fingerprint-matched against genshin-db, not re-derived).
 */

export const SCALED_SKILL_MULTIPLIER_OVERRIDES: Record<string, Record<string, number[]>> = {
    "noelle": {
        skill: [1.2, 1.29, 1.38, 1.5, 1.59, 1.68, 1.8, 1.92, 2.04, 2.16, 2.28, 2.4, 2.55, 2.7, 2.85],
    },
    "nilou": {
        skill: [0.0334, 0.0359, 0.0384, 0.0417, 0.0442, 0.0467, 0.0501, 0.0534, 0.0568, 0.0601, 0.0634, 0.0668, 0.071, 0.0751, 0.0793],
        burst: [0.1843, 0.1981, 0.212, 0.2304, 0.2442, 0.258, 0.2765, 0.2949, 0.3133, 0.3318, 0.3502, 0.3686, 0.3917, 0.4147, 0.4378],
    },
    "candace": {
        skill: [0.12, 0.129, 0.138, 0.15, 0.159, 0.168, 0.18, 0.192, 0.204, 0.216, 0.228, 0.24, 0.255, 0.27, 0.285],
        burst: [0.0661, 0.0711, 0.076, 0.0826, 0.0876, 0.0925, 0.0992, 0.1058, 0.1124, 0.119, 0.1256, 0.1322, 0.1405, 0.1487, 0.157],
    },
    "layla": {
        burst: [0.0465, 0.05, 0.0535, 0.0581, 0.0616, 0.0651, 0.0697, 0.0744, 0.079, 0.0837, 0.0883, 0.093, 0.0988, 0.1046, 0.1104],
    },
    "neuvillette": {
        skill: [0.1286, 0.1383, 0.1479, 0.1608, 0.1704, 0.1801, 0.193, 0.2058, 0.2187, 0.2316, 0.2444, 0.2573, 0.2734, 0.2894, 0.3055],
        burst: [0.2226, 0.2393, 0.256, 0.2782, 0.2949, 0.3116, 0.3339, 0.3561, 0.3784, 0.4006, 0.4229, 0.4452, 0.473, 0.5008, 0.5286],
    },
    "furina": {
        skill: [0.0786, 0.0845, 0.0904, 0.0983, 0.1042, 0.1101, 0.118, 0.1258, 0.1337, 0.1416, 0.1494, 0.1573, 0.1671, 0.1769, 0.1868],
        burst: [0.1141, 0.1226, 0.1312, 0.1426, 0.1511, 0.1597, 0.1711, 0.1825, 0.1939, 0.2053, 0.2167, 0.2281, 0.2424, 0.2566, 0.2709],
    },
    "sigewinne": {
        skill: [0.0228, 0.0245, 0.0262, 0.0285, 0.0302, 0.0319, 0.0342, 0.0365, 0.0388, 0.041, 0.0433, 0.0456, 0.0485, 0.0513, 0.0542],
        burst: [0.1177, 0.1265, 0.1354, 0.1471, 0.156, 0.1648, 0.1766, 0.1883, 0.2001, 0.2119, 0.2236, 0.2354, 0.2501, 0.2648, 0.2796],
    },
    "yelan": {
        burst: [0.0731, 0.0786, 0.084, 0.0914, 0.0968, 0.1023, 0.1096, 0.1169, 0.1242, 0.1315, 0.1389, 0.1462, 0.1553, 0.1644, 0.1736],
    },
};

export default SCALED_SKILL_MULTIPLIER_OVERRIDES;
