/**
 * @fileoverview Hand-curated GI character passive-talent self-buffs
 * @module adapters/game-definitions/genshin-impact/character-passives.generated
 *
 * SELF stat buffs from a character's OWN (non-weapon, non-constellation) passive
 * talents — e.g. Zhongli's "Dominance of Earth" (Normal/Charged/Plunge/Skill/Burst
 * DMG scaled by his own Max HP). Unlike weapons/constellations there is no
 * structured-vs-prose split to exploit; genshin-db's passive-talent text is prose
 * only, same as constellations, so this is a plain hand-authored table — see
 * scripts/curate-gi-character-passives.cjs for the curation methodology and
 * rejection categories (mirrors curate-gi-constellations.cjs).
 * DO NOT edit by hand — re-run scripts/curate-gi-character-passives.cjs.
 * 35 characters, 47 buff entries.
 */
import type { BuffEntry } from '@shared/types/game-bundle';

export const CHARACTER_SELF_BUFFS: Record<string, Array<{ stat: string; label: string; value: number; conditional?: boolean; appliesTo?: string[]; scaleOff?: BuffEntry['scaleOff'] }>> = {
    // Added 2026-07-11, GI character-passive re-verification vs gi.yatta.moe (full
    // 121-char roster) — see DATA_PROGRESS.md for methodology + rejection categories.
    "xilonen": [{"stat":"defPct","label":"DEF, 15s after nearby ally Nightsoul Burst (P2)","value":20,"conditional":true}],
    "amber": [{"stat":"atkPct","label":"ATK, 10s after Aimed Shot weak-point hit (P2)","value":15,"conditional":true}],
    "razor": [{"stat":"energyRegen","label":"Energy Recharge, while Energy<50% (P2)","value":30,"conditional":true}],
    "xingqiu": [{"stat":"elemDmg","label":"Hydro DMG (P1)","value":20,"conditional":false}],
    "arliecino": [{"stat":"elemDmg","label":"Pyro DMG, while in combat (P2)","value":40,"conditional":false}],
    "sigewinne": [{"stat":"elemDmg","label":"Hydro DMG, 18s after Rebound Hydrotherapy (P1)","value":8,"conditional":true}],
    "iansan": [{"stat":"atkPct","label":"ATK, 15s after Swift Stormflight hit (P1)","value":20,"conditional":true}],
    "diluc": [{"stat":"elemDmg","label":"Pyro DMG · Dawn infusion active (P2)","value":20,"conditional":true}],
    "mona": [{"stat":"elemDmg","label":"Hydro DMG · 20% of own ER (P2)","value":12,"conditional":true,"scaleOff":{"sourceStat":"energyRegen","basis":"total","ratio":0.2}}],
    "keqing": [{"stat":"critRate","label":"Crit Rate · post-Starward-Sword (P2)","value":15,"conditional":true},{"stat":"energyRegen","label":"Energy Recharge · post-Starward-Sword (P2)","value":15,"conditional":true}],
    "zhongli": [{"stat":"flatDmgAdd","label":"Normal/Charged/Plunge DMG · flat add, 1.39% of own Max HP (P2)","value":200,"conditional":false,"appliesTo":["normal","charged","plunge"],"scaleOff":{"sourceStat":"hp","basis":"total","ratio":0.0139}},{"stat":"flatDmgAdd","label":"Skill DMG · flat add, 1.9% of own Max HP (P2)","value":280,"conditional":false,"appliesTo":["skill"],"scaleOff":{"sourceStat":"hp","basis":"total","ratio":0.019}},{"stat":"flatDmgAdd","label":"Burst DMG · flat add, 33% of own Max HP (P2)","value":4850,"conditional":false,"appliesTo":["ult"],"scaleOff":{"sourceStat":"hp","basis":"total","ratio":0.33}}],
    "xiao": [{"stat":"elemDmg","label":"DMG · max ramp, Bane of All Evil (P1)","value":25,"conditional":true},{"stat":"elemDmg","label":"Skill DMG · 3 stacks (P2)","value":45,"conditional":true,"appliesTo":["skill"]}],
    "hu_tao": [{"stat":"elemDmg","label":"Pyro DMG · HP<=50% (P2)","value":33,"conditional":true}],
    "yoimiya": [{"stat":"elemDmg","label":"Pyro DMG · max 10 stacks (P1)","value":20,"conditional":true}, {"stat":"dmgBonus","label":"Niwabi Enshou (NA DMG, Skill, lvl 10)","value":61.744,"conditional":true,"appliesTo":["normal"]}],
    "ayaka": [{"stat":"elemDmg","label":"Normal/Charged DMG · post-Burst (P1)","value":30,"conditional":true,"appliesTo":["normal","charged"]},{"stat":"elemDmg","label":"Cryo DMG · post-Skill-Cryo-application (P2)","value":18,"conditional":true}],
    "itto": [{"stat":"flatDmgAdd","label":"Charged DMG · flat add, 35% of own DEF, Arataki Kesagiri (P2)","value":280,"conditional":false,"appliesTo":["charged"],"scaleOff":{"sourceStat":"def","basis":"total","ratio":0.35}}],
    "yae_miko": [{"stat":"elemDmg","label":"Skill DMG · 0.15% per own EM point (P2)","value":15,"conditional":false,"appliesTo":["skill"],"scaleOff":{"sourceStat":"elementalMastery","basis":"total","ratio":0.15}}],
    "cyno": [{"stat":"flatDmgAdd","label":"Normal DMG · flat add, 150% of own EM, Pactsworn Pathclearer state (P2)","value":1500,"conditional":true,"appliesTo":["normal"],"scaleOff":{"sourceStat":"elementalMastery","basis":"total","ratio":1.5}}],
    "alhaitham": [{"stat":"elemDmg","label":"Skill/Burst DMG · 0.1% per own EM point, capped (P2)","value":100,"conditional":false,"appliesTo":["skill","ult"],"scaleOff":{"sourceStat":"elementalMastery","basis":"total","ratio":0.1,"cap":100}}],
    "baizhu": [{"stat":"elemDmg","label":"Dendro DMG · active character HP>=50% (P1)","value":25,"conditional":true}],
    "lyney": [{"stat":"elemDmg","label":"DMG · vs Pyro-affected, guaranteed portion (P2)","value":60,"conditional":true}],
    "neuvillette": [{"stat":"elemDmg","label":"Charged DMG · 3 stacks (P1)","value":60,"conditional":true,"appliesTo":["charged"]},{"stat":"elemDmg","label":"Hydro DMG · HP>=80% of Max, capped (P2)","value":30,"conditional":true}],
    "wriothesley": [{"stat":"atkPct","label":"ATK% · 5 stacks (P2)","value":30,"conditional":true}],
    "navia": [{"stat":"elemDmg","label":"Normal/Charged/Plunge DMG · Geo infusion active (P1)","value":40,"conditional":true,"appliesTo":["normal","charged","plunge"]},{"stat":"atkPct","label":"ATK% · 2 elemental teammates (P2)","value":40,"conditional":true}],
    "chiori": [{"stat":"elemDmg","label":"Geo DMG · post-ally-Geo-Construct (P2)","value":20,"conditional":true}],
    "clorinde": [{"stat":"flatDmgAdd","label":"Normal/Burst DMG · flat add, 60% of own ATK, capped (P1)","value":1800,"conditional":true,"appliesTo":["normal","ult"],"scaleOff":{"sourceStat":"atk","basis":"total","ratio":0.6,"cap":1800}},{"stat":"critRate","label":"Crit Rate · 2 stacks, Bond of Life (P2)","value":20,"conditional":true}],
    "emilie": [{"stat":"elemDmg","label":"DMG · vs Burning, 0.015% per own ATK point, capped (P2)","value":36,"conditional":true,"scaleOff":{"sourceStat":"atk","basis":"total","ratio":0.015,"cap":36}}],
    "kinich": [{"stat":"flatDmgAdd","label":"Skill DMG · flat add, up to 640% of own ATK, 2 stacks, Scalespiker Cannon (P2)","value":6400,"conditional":true,"appliesTo":["skill"],"scaleOff":{"sourceStat":"atk","basis":"total","ratio":6.4}}],
    "mualani": [{"stat":"flatDmgAdd","label":"Burst DMG · flat add, 45% of own Max HP, 3 stacks (P2)","value":5500,"conditional":true,"appliesTo":["ult"],"scaleOff":{"sourceStat":"hp","basis":"total","ratio":0.45}}],
    "citlali": [{"stat":"flatDmgAdd","label":"Skill DMG · flat add, 90% of own EM (P2)","value":900,"conditional":false,"appliesTo":["skill"],"scaleOff":{"sourceStat":"elementalMastery","basis":"total","ratio":0.9}},{"stat":"flatDmgAdd","label":"Burst DMG · flat add, 1200% of own EM (P2)","value":12000,"conditional":false,"appliesTo":["ult"],"scaleOff":{"sourceStat":"elementalMastery","basis":"total","ratio":12}}],
    "mavuika": [{"stat":"atkPct","label":"ATK% · post-ally-Nightsoul-Burst (P1)","value":30,"conditional":true},{"stat":"elemDmg","label":"DMG · max Fighting Spirit, post-Burst (P2)","value":40,"conditional":true}],
    "yelan": [{"stat":"hpPct","label":"HP% · 4 elemental types (P1)","value":30,"conditional":true}],
    "aloy": [{"stat":"atkPct","label":"ATK% · post-Coil-effect (P1)","value":16,"conditional":true},{"stat":"elemDmg","label":"Cryo DMG · max ramp, Rushing Ice (P2)","value":35,"conditional":true}],
    "columbina": [{"stat":"critRate","label":"Crit Rate · 3 stacks (P1)","value":15,"conditional":true}],
    "flins": [{"stat":"elementalMastery","label":"EM · 8% of own ATK, capped (P2)","value":160,"conditional":false,"scaleOff":{"sourceStat":"atk","basis":"total","ratio":0.08,"cap":160}}],
    "lohen": [{"stat":"atkPct","label":"ATK% · post-ally-Cryo-reaction, Masterstroke mode (P2)","value":15,"conditional":true}],
    "sandrone": [{"stat":"elementalMastery","label":"EM · 8% of own ATK, capped (P2)","value":160,"conditional":false,"scaleOff":{"sourceStat":"atk","basis":"total","ratio":0.08,"cap":160}}],
    "tighnari": [{"stat":"elementalMastery","label":"EM · post-Wreath-Arrow (P1)","value":50,"conditional":true},{"stat":"elemDmg","label":"Charged/Burst DMG · 0.06% per own EM point, capped (P2)","value":60,"conditional":false,"appliesTo":["charged","ult"],"scaleOff":{"sourceStat":"elementalMastery","basis":"total","ratio":0.06,"cap":60}}],
    "varesa": [{"stat":"atkPct","label":"ATK% · post-ally-Nightsoul-Burst, 2 stacks (P2)","value":70,"conditional":true}],
    "zibai": [{"stat":"defPct","label":"DEF% · 3 other Geo teammates (P2)","value":45,"conditional":true}],
    "raiden": [{"stat":"elemDmg","label":"Electro DMG · 0.4% per 1% ER above 100% (P2)","value":0,"conditional":false,"scaleOff":{"sourceStat":"energyRegen","basis":"total","ratio":0.4,"offset":100}}],
    "nahida": [{"stat":"elemDmg","label":"Skill DMG · 0.1% per own EM point above 200, capped (P2)","value":0,"conditional":false,"appliesTo":["skill"],"scaleOff":{"sourceStat":"elementalMastery","basis":"total","ratio":0.1,"offset":200,"cap":80}}],
};

export default CHARACTER_SELF_BUFFS;
