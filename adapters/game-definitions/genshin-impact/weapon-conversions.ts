/**
 * @fileoverview Genshin weapon stat conversions (authored)
 * @module adapters/game-definitions/genshin-impact/weapon-conversions
 *
 * The always-on "X% of stat A as stat B" bonuses that the fuzzy/curated selfBuff
 * pass can't express (they depend on another final stat). Merged onto the weapon
 * entries in bundle.ts and applied in `computeBuildStats`. Only the UNCONDITIONAL
 * portion is modeled here (e.g. Homa's base 0.8% HP→ATK, not the extra 1% below
 * 50% HP; Scarlet Sands' base 52% EM→ATK, not the +28%×3 skill-hit stacks).
 *
 * `pct` is a percentage of the wielder's final `from` stat added flat to `to`.
 */
export const WEAPON_CONVERSIONS: Record<string, Array<{ from: string; to: string; pct: number; label?: string }>> = {
    'staff-of-homa': [{ from: 'hp', to: 'atk', pct: 0.8, label: 'ATK from 0.8% Max HP' }],
    'primordial-jade-cutter': [{ from: 'hp', to: 'atk', pct: 1.2, label: 'ATK from 1.2% Max HP' }],
    'staff-of-the-scarlet-sands': [{ from: 'elementalMastery', to: 'atk', pct: 52, label: 'ATK from 52% EM' }],
};
