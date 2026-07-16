/**
 * @fileoverview AUTO-GENERATED WW skill-tree stat-node self-buffs (api.encore.moe)
 * @module adapters/game-definitions/wuthering-waves/character-skilltree.generated
 *
 * Each resonator's optional skill-tree "Property Nodes" (flat %-stat bonuses
 * gated behind in-game resource costs, e.g. Jiyan's "ATK+1.80%" node) — NOT
 * automatic base stats (character-stats.generated.ts deliberately excludes
 * these, see bundle.ts's accurateChar doc comment). Every resonator has exactly
 * 8 nodes across 2 stat categories; values here are the FULLY-INVESTED sum of
 * all nodes for that stat (matches the "typical/max investment" convention used
 * for every other conditional buff in this codebase). Modeled as toggleable
 * conditional selfBuffs — reuses the existing selfBuffs UI/engine unchanged, no
 * new primitives needed. Source: https://api.encore.moe/en/character/{roleId}
 * SkillTree[] field. DO NOT edit by hand — re-run scripts/import-ww-skilltree.cjs.
 * 55 characters, 110 entries (11 added 2026-07-12, see [[ww-encore-api-source]]).
 */
import type { BuffEntry } from '@shared/types/game-bundle';
type BuffScaleOff = BuffEntry['scaleOff'];

export const CHARACTER_SKILL_TREE_BUFFS: Record<string, Array<{ stat: string; label: string; value: number; conditional?: boolean; appliesTo?: string[]; scaleOff?: BuffScaleOff }>> = {
    "rover-spectro": [{"stat":"elemDmg","label":"Skill Tree: Elemental DMG+12% (fully invested)","value":12,"conditional":true}, {"stat":"atkPct","label":"Skill Tree: ATK+12% (fully invested)","value":12,"conditional":true}],
    "jinhsi": [{"stat":"critRate","label":"Skill Tree: Crit Rate+8% (fully invested)","value":8,"conditional":true}, {"stat":"atkPct","label":"Skill Tree: ATK+12% (fully invested)","value":12,"conditional":true}],
    "yinlin": [{"stat":"critRate","label":"Skill Tree: Crit Rate+8% (fully invested)","value":8,"conditional":true}, {"stat":"atkPct","label":"Skill Tree: ATK+12% (fully invested)","value":12,"conditional":true}],
    "changli": [{"stat":"critRate","label":"Skill Tree: Crit Rate+8% (fully invested)","value":8,"conditional":true}, {"stat":"atkPct","label":"Skill Tree: ATK+12% (fully invested)","value":12,"conditional":true}],
    "camellya": [{"stat":"critDmg","label":"Skill Tree: Crit DMG+16% (fully invested)","value":16,"conditional":true}, {"stat":"atkPct","label":"Skill Tree: ATK+12% (fully invested)","value":12,"conditional":true}],
    "jiyan": [{"stat":"critRate","label":"Skill Tree: Crit Rate+8% (fully invested)","value":8,"conditional":true}, {"stat":"atkPct","label":"Skill Tree: ATK+12% (fully invested)","value":12,"conditional":true}],
    "calcharo": [{"stat":"atkPct","label":"Skill Tree: ATK+12% (fully invested)","value":12,"conditional":true}, {"stat":"critDmg","label":"Skill Tree: Crit DMG+16% (fully invested)","value":16,"conditional":true}],
    "encore": [{"stat":"elemDmg","label":"Skill Tree: Elemental DMG+12% (fully invested)","value":12,"conditional":true}, {"stat":"atkPct","label":"Skill Tree: ATK+12% (fully invested)","value":12,"conditional":true}],
    "verina": [{"stat":"healingBonus","label":"Skill Tree: Healing Bonus+12% (fully invested)","value":12,"conditional":true}, {"stat":"atkPct","label":"Skill Tree: ATK+12% (fully invested)","value":12,"conditional":true}],
    "sanhua": [{"stat":"elemDmg","label":"Skill Tree: Elemental DMG+12% (fully invested)","value":12,"conditional":true}, {"stat":"atkPct","label":"Skill Tree: ATK+12% (fully invested)","value":12,"conditional":true}],
    "baizhi": [{"stat":"healingBonus","label":"Skill Tree: Healing Bonus+12% (fully invested)","value":12,"conditional":true}, {"stat":"hpPct","label":"Skill Tree: HP+12% (fully invested)","value":12,"conditional":true}],
    "yangyang": [{"stat":"atkPct","label":"Skill Tree: ATK+12% (fully invested)","value":12,"conditional":true}, {"stat":"elemDmg","label":"Skill Tree: Elemental DMG+12% (fully invested)","value":12,"conditional":true}],
    "chixia": [{"stat":"elemDmg","label":"Skill Tree: Elemental DMG+12% (fully invested)","value":12,"conditional":true}, {"stat":"atkPct","label":"Skill Tree: ATK+12% (fully invested)","value":12,"conditional":true}],
    "danjin": [{"stat":"elemDmg","label":"Skill Tree: Elemental DMG+12% (fully invested)","value":12,"conditional":true}, {"stat":"atkPct","label":"Skill Tree: ATK+12% (fully invested)","value":12,"conditional":true}],
    "mortefi": [{"stat":"elemDmg","label":"Skill Tree: Elemental DMG+12% (fully invested)","value":12,"conditional":true}, {"stat":"atkPct","label":"Skill Tree: ATK+12% (fully invested)","value":12,"conditional":true}],
    "aalto": [{"stat":"elemDmg","label":"Skill Tree: Elemental DMG+12% (fully invested)","value":12,"conditional":true}, {"stat":"atkPct","label":"Skill Tree: ATK+12% (fully invested)","value":12,"conditional":true}],
    "taoqi": [{"stat":"elemDmg","label":"Skill Tree: Elemental DMG+12% (fully invested)","value":12,"conditional":true}, {"stat":"defPct","label":"Skill Tree: DEF+15.2% (fully invested)","value":15.2,"conditional":true}],
    "xiangli-yao": [{"stat":"critDmg","label":"Skill Tree: Crit DMG+16% (fully invested)","value":16,"conditional":true}, {"stat":"atkPct","label":"Skill Tree: ATK+12% (fully invested)","value":12,"conditional":true}],
    "zhezhi": [{"stat":"critRate","label":"Skill Tree: Crit Rate+8% (fully invested)","value":8,"conditional":true}, {"stat":"atkPct","label":"Skill Tree: ATK+12% (fully invested)","value":12,"conditional":true}],
    "shorekeeper": [{"stat":"healingBonus","label":"Skill Tree: Healing Bonus+12% (fully invested)","value":12,"conditional":true}, {"stat":"hpPct","label":"Skill Tree: HP+12% (fully invested)","value":12,"conditional":true}],
    "carlotta": [{"stat":"critRate","label":"Skill Tree: Crit Rate+8% (fully invested)","value":8,"conditional":true}, {"stat":"atkPct","label":"Skill Tree: ATK+12% (fully invested)","value":12,"conditional":true}],
    "roccia": [{"stat":"critDmg","label":"Skill Tree: Crit DMG+16% (fully invested)","value":16,"conditional":true}, {"stat":"atkPct","label":"Skill Tree: ATK+12% (fully invested)","value":12,"conditional":true}],
    "cantarella": [{"stat":"critRate","label":"Skill Tree: Crit Rate+8% (fully invested)","value":8,"conditional":true}, {"stat":"atkPct","label":"Skill Tree: ATK+12% (fully invested)","value":12,"conditional":true}],
    "lingyang": [{"stat":"elemDmg","label":"Skill Tree: Elemental DMG+12% (fully invested)","value":12,"conditional":true}, {"stat":"atkPct","label":"Skill Tree: ATK+12% (fully invested)","value":12,"conditional":true}],
    "yuanwu": [{"stat":"elemDmg","label":"Skill Tree: Elemental DMG+12% (fully invested)","value":12,"conditional":true}, {"stat":"defPct","label":"Skill Tree: DEF+15.2% (fully invested)","value":15.2,"conditional":true}],
    "lumi": [{"stat":"critRate","label":"Skill Tree: Crit Rate+8% (fully invested)","value":8,"conditional":true}, {"stat":"atkPct","label":"Skill Tree: ATK+12% (fully invested)","value":12,"conditional":true}],
    "youhu": [{"stat":"critRate","label":"Skill Tree: Crit Rate+8% (fully invested)","value":8,"conditional":true}, {"stat":"atkPct","label":"Skill Tree: ATK+12% (fully invested)","value":12,"conditional":true}],
    "brant": [{"stat":"critRate","label":"Skill Tree: Crit Rate+8% (fully invested)","value":8,"conditional":true}, {"stat":"atkPct","label":"Skill Tree: ATK+12% (fully invested)","value":12,"conditional":true}],
    "phoebe": [{"stat":"critDmg","label":"Skill Tree: Crit DMG+16% (fully invested)","value":16,"conditional":true}, {"stat":"atkPct","label":"Skill Tree: ATK+12% (fully invested)","value":12,"conditional":true}],
    "ciaccona": [{"stat":"critDmg","label":"Skill Tree: Crit DMG+16% (fully invested)","value":16,"conditional":true}, {"stat":"atkPct","label":"Skill Tree: ATK+12% (fully invested)","value":12,"conditional":true}],
    "zani": [{"stat":"critRate","label":"Skill Tree: Crit Rate+8% (fully invested)","value":8,"conditional":true}, {"stat":"atkPct","label":"Skill Tree: ATK+12% (fully invested)","value":12,"conditional":true}],
    "lupa": [{"stat":"critRate","label":"Skill Tree: Crit Rate+8% (fully invested)","value":8,"conditional":true}, {"stat":"atkPct","label":"Skill Tree: ATK+12% (fully invested)","value":12,"conditional":true}],
    "phrolova": [{"stat":"critRate","label":"Skill Tree: Crit Rate+8% (fully invested)","value":8,"conditional":true}, {"stat":"atkPct","label":"Skill Tree: ATK+12% (fully invested)","value":12,"conditional":true}],
    "cartethyia": [{"stat":"critRate","label":"Skill Tree: Crit Rate+8% (fully invested)","value":8,"conditional":true}, {"stat":"hpPct","label":"Skill Tree: HP+12% (fully invested)","value":12,"conditional":true}],
    "augusta": [{"stat":"critRate","label":"Skill Tree: Crit Rate+8% (fully invested)","value":8,"conditional":true}, {"stat":"atkPct","label":"Skill Tree: ATK+12% (fully invested)","value":12,"conditional":true}],
    "iuno": [{"stat":"critRate","label":"Skill Tree: Crit Rate+8% (fully invested)","value":8,"conditional":true}, {"stat":"atkPct","label":"Skill Tree: ATK+12% (fully invested)","value":12,"conditional":true}],
    "buling": [{"stat":"healingBonus","label":"Skill Tree: Healing Bonus+12% (fully invested)","value":12,"conditional":true}, {"stat":"atkPct","label":"Skill Tree: ATK+12% (fully invested)","value":12,"conditional":true}],
    "galbrena": [{"stat":"critDmg","label":"Skill Tree: Crit DMG+16% (fully invested)","value":16,"conditional":true}, {"stat":"atkPct","label":"Skill Tree: ATK+12% (fully invested)","value":12,"conditional":true}],
    "chisa": [{"stat":"critRate","label":"Skill Tree: Crit Rate+8% (fully invested)","value":8,"conditional":true}, {"stat":"atkPct","label":"Skill Tree: ATK+12% (fully invested)","value":12,"conditional":true}],
    "qiuyuan": [{"stat":"critRate","label":"Skill Tree: Crit Rate+8% (fully invested)","value":8,"conditional":true}, {"stat":"atkPct","label":"Skill Tree: ATK+12% (fully invested)","value":12,"conditional":true}],
    "lynae": [{"stat":"critRate","label":"Skill Tree: Crit Rate+8% (fully invested)","value":8,"conditional":true}, {"stat":"atkPct","label":"Skill Tree: ATK+12% (fully invested)","value":12,"conditional":true}],
    "mornye": [{"stat":"healingBonus","label":"Skill Tree: Healing Bonus+12% (fully invested)","value":12,"conditional":true}, {"stat":"defPct","label":"Skill Tree: DEF+15.2% (fully invested)","value":15.2,"conditional":true}],
    "luuk-herssen": [{"stat":"critRate","label":"Skill Tree: Crit Rate+8% (fully invested)","value":8,"conditional":true}, {"stat":"atkPct","label":"Skill Tree: ATK+12% (fully invested)","value":12,"conditional":true}],
    "aemeath": [{"stat":"critRate","label":"Skill Tree: Crit Rate+8% (fully invested)","value":8,"conditional":true}, {"stat":"atkPct","label":"Skill Tree: ATK+12% (fully invested)","value":12,"conditional":true}],
    "denia": [{"stat":"critDmg","label":"Skill Tree: Crit DMG+16% (fully invested)","value":16,"conditional":true}, {"stat":"atkPct","label":"Skill Tree: ATK+12% (fully invested)","value":12,"conditional":true}],
    "hiyuki": [{"stat":"critRate","label":"Skill Tree: Crit Rate+8% (fully invested)","value":8,"conditional":true}, {"stat":"atkPct","label":"Skill Tree: ATK+12% (fully invested)","value":12,"conditional":true}],
    "jianxin": [{"stat":"critRate","label":"Skill Tree: Crit Rate+8% (fully invested)","value":8,"conditional":true}, {"stat":"atkPct","label":"Skill Tree: ATK+12% (fully invested)","value":12,"conditional":true}],
    "lucilla": [{"stat":"critRate","label":"Skill Tree: Crit Rate+8% (fully invested)","value":8,"conditional":true}, {"stat":"atkPct","label":"Skill Tree: ATK+12% (fully invested)","value":12,"conditional":true}],
    "lucy": [{"stat":"critRate","label":"Skill Tree: Crit Rate+8% (fully invested)","value":8,"conditional":true}, {"stat":"atkPct","label":"Skill Tree: ATK+12% (fully invested)","value":12,"conditional":true}],
    "rebecca": [{"stat":"critRate","label":"Skill Tree: Crit Rate+8% (fully invested)","value":8,"conditional":true}, {"stat":"atkPct","label":"Skill Tree: ATK+12% (fully invested)","value":12,"conditional":true}],
    "sigrika": [{"stat":"critRate","label":"Skill Tree: Crit Rate+8% (fully invested)","value":8,"conditional":true}, {"stat":"atkPct","label":"Skill Tree: ATK+12% (fully invested)","value":12,"conditional":true}],
    "suisui": [{"stat":"healingBonus","label":"Skill Tree: Healing Bonus+12% (fully invested)","value":12,"conditional":true}, {"stat":"hpPct","label":"Skill Tree: HP+12% (fully invested)","value":12,"conditional":true}],
    "rover-aero": [{"stat":"healingBonus","label":"Skill Tree: Healing Bonus+12% (fully invested)","value":12,"conditional":true}, {"stat":"atkPct","label":"Skill Tree: ATK+12% (fully invested)","value":12,"conditional":true}],
    "rover-havoc": [{"stat":"atkPct","label":"Skill Tree: ATK+12% (fully invested)","value":12,"conditional":true}, {"stat":"elemDmg","label":"Skill Tree: Elemental DMG+12% (fully invested)","value":12,"conditional":true}],
    "rover-electro": [{"stat":"critRate","label":"Skill Tree: Crit Rate+8% (fully invested)","value":8,"conditional":true}, {"stat":"atkPct","label":"Skill Tree: ATK+12% (fully invested)","value":12,"conditional":true}],
};
