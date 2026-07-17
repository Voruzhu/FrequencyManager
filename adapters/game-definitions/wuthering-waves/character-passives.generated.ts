/**
 * @fileoverview Hand-curated WW resonator Inherent Skill self-buffs
 * @module adapters/game-definitions/wuthering-waves/character-passives.generated
 *
 * SELF stat buffs from a resonator's own Inherent Skills (SkillType 4 in the
 * Dimbreath datamine) — the WW equivalent of GI's character passive-talent
 * selfBuffs. See scripts/curate-ww-character-passives.cjs for methodology,
 * rejection categories, and the SkillType-4-is-not-Forte correction note.
 * DO NOT edit by hand — re-run scripts/curate-ww-character-passives.cjs.
 * 43 resonators, 57 buff entries (+ 3 hand-added entries, 2026-07-16/17
 * accuracy sweeps: Zhezhi's missed Forte-Circuit self-buff, Sigrika — a
 * wholly-new resonator this generator predates, and Augusta — same gap —
 * see inline comments).
 */

import type { BuffEntry } from '@shared/types/game-bundle';

export const CHARACTER_SELF_BUFFS: Record<string, Array<{ stat: string; label: string; value: number; conditional?: boolean; appliesTo?: string[]; scaleOff?: BuffEntry['scaleOff'] }>> = {
    // ADDED 2026-07-16 — Inherent Skill "Sky Over Water" had no entry at
    // all: "When Resonance Skill - Awakening Spring or Intro Skill -
    // Tinkling Jade hits the target, this attack's Crit Rate +80% and
    // Glacio DMG +240%, once every 25s" (wuthering.gg). Scoped to
    // 'skill'/'intro' — both are Suisui's only moves of each type.
    "suisui": [{"stat":"critRate","label":"Crit Rate +80%, on Awakening Spring/Tinkling Jade hit (Inherent I)","value":80,"conditional":true,"appliesTo":["skill","intro"]},{"stat":"elemDmg","label":"Glacio DMG +240%, on Awakening Spring/Tinkling Jade hit (Inherent I)","value":240,"conditional":true,"appliesTo":["skill","intro"]}],
    "rover-spectro": [{"stat":"dmgBonus","label":"Basic Atk (Resonating Echoes) DMG +60% (Inherent I)","value":60,"conditional":false,"appliesTo":["basic"]},{"stat":"atkPct","label":"ATK +15%, 5s after Heavy Attack Resonance (Inherent II)","value":15,"conditional":true}],
    "jinhsi": [{"stat":"elemDmg","label":"Spectro DMG Bonus +20% (Inherent I)","value":20,"conditional":false}],
    "yinlin": [{"stat":"critRate","label":"Crit Rate +15%, 5s after Resonance Skill (Inherent I)","value":15,"conditional":true},{"stat":"dmgBonus","label":"Resonance Skill DMG +10% vs Sinner's-Mark targets (Inherent II)","value":10,"conditional":true,"appliesTo":["skill"]},{"stat":"atkPct","label":"ATK +10%, 4s, on Sinner's-Mark trigger (Inherent II)","value":10,"conditional":true}],
    "changli": [{"stat":"elemDmg","label":"Fusion DMG Bonus +20%, 4 stacks of Enflamement (Inherent I)","value":20,"conditional":true},{"stat":"elemDmg","label":"Fusion DMG Bonus +20%, after Heavy Atk/Liberation cast (Inherent II)","value":20,"conditional":true}],
    "camellya": [{"stat":"elemDmg","label":"Havoc DMG Bonus +15% (Inherent I)","value":15,"conditional":false},{"stat":"dmgBonus","label":"Basic Atk DMG +15% (Inherent II)","value":15,"conditional":false,"appliesTo":["basic"]}],
    "jiyan": [{"stat":"atkPct","label":"ATK +10%, 15s after Intro Skill (Inherent I)","value":10,"conditional":true},{"stat":"critDmg","label":"Crit DMG +12%, 8s on hit (Inherent II)","value":12,"conditional":true}],
    "calcharo": [{"stat":"dmgBonus","label":"Liberation DMG +10%, 15s after Heavy Atk Mercy (Inherent I)","value":10,"conditional":true,"appliesTo":["ult"]}],
    "encore": [{"stat":"dmgBonus","label":"Liberation DMG +10% while HP>70%, during Cosmos Rave (Inherent I)","value":10,"conditional":true,"appliesTo":["ult"]},{"stat":"elemDmg","label":"Fusion DMG Bonus +10%, 10s after Resonance Skill cast (Inherent II)","value":10,"conditional":true}],
    "sanhua": [{"stat":"dmgBonus","label":"Res. Skill DMG +20%, 8s after Intro Skill (Inherent I)","value":20,"conditional":true,"appliesTo":["skill"]},{"stat":"dmgBonus","label":"Forte Circuit DMG +20%, 8s after Basic Atk 5 (Inherent II)","value":20,"conditional":true,"appliesTo":["forte"]}],
    "yangyang": [{"stat":"elemDmg","label":"Aero DMG Bonus +8%, 8s after Intro Skill (Inherent II)","value":8,"conditional":true}],
    "chixia": [{"stat":"dmgBonus","label":"Resonance Skill DMG +50% (Inherent I)","value":50,"conditional":false,"appliesTo":["skill"]},{"stat":"atkPct","label":"ATK +30% (max 30 stacks), during Resonance Skill (Inherent II)","value":30,"conditional":true}],
    "danjin": [{"stat":"dmgBonus","label":"Res. Skill DMG +20%, via Dodge-Counter trigger (Inherent I)","value":20,"conditional":true,"appliesTo":["skill"]},{"stat":"dmgBonus","label":"Heavy Atk DMG +30%, 5s after Res. Skill (Inherent II)","value":30,"conditional":true,"appliesTo":["heavy"]}],
    "mortefi": [{"stat":"dmgBonus","label":"Res. Skill DMG +25%, 8s after casting (Inherent I)","value":25,"conditional":true,"appliesTo":["skill"]},{"stat":"dmgBonus","label":"Liberation DMG +75% (max 50 stacks), during Burning Rhapsody (Inherent II)","value":75,"conditional":true,"appliesTo":["ult"]}],
    "taoqi": [{"stat":"defPct","label":"DEF +15% while Rocksteady Shield active (Inherent I)","value":15,"conditional":true}],
    "xiangli-yao": [{"stat":"elemDmg","label":"Electro DMG Bonus +20% (max 4 stacks), 8s after Res. Skill (Inherent I)","value":20,"conditional":true}],
    "zhezhi": [{"stat":"atkPct","label":"ATK +18% (max 3 stacks), 27s after Res. Skill (Inherent I)","value":18,"conditional":true},{"stat":"dmgBonus","label":"Basic Atk DMG +18%, 27s after Creation's Zenith (Forte Circuit)","value":18,"conditional":true,"appliesTo":["basic"]}],
    "shorekeeper": [{"stat":"energyRegen","label":"Energy Regen +10%, near Stellarealm (Inherent II)","value":10,"conditional":true}],
    "roccia": [{"stat":"atkPct","label":"ATK +20%, 12s after Res. Skill/Heavy Atk (Inherent I)","value":20,"conditional":true}],
    "cantarella": [{"stat":"healingBonus","label":"Healing Bonus +20% (Inherent I)","value":20,"conditional":false},{"stat":"elemDmg","label":"Havoc DMG Bonus +12% (max 2 stacks), 10s after Echo Skill (Inherent II)","value":12,"conditional":true}],
    "yuanwu": [{"stat":"dmgBonus","label":"Res. Skill (Thunder Uprising) DMG +40% (Inherent I)","value":40,"conditional":false,"appliesTo":["skill"]}],
    "lumi": [{"stat":"elemDmg","label":"Electro DMG Bonus +10%, in Red Light Mode (Inherent I)","value":10,"conditional":true},{"stat":"atkPct","label":"ATK +10%, 5s after Energized Pounce/Rebound (Inherent II)","value":10,"conditional":true}],
    // Confirmed 2026-07-16 (was missing entirely). "Diligent Practice"
    // (next Mountain Roamer +150% DMG) not added — a named-move-specific
    // bonus with no clean appliesTo category (Furious Punches shares
    // Mountain Roamer's 'skill' scope and would be wrongly buffed too).
    "lingyang": [{"stat":"dmgBonus","label":"Intro Skill DMG +50% (Inherent I, \"Lion's Pride\")","value":50,"conditional":false,"appliesTo":["intro"]}],
    "youhu": [{"stat":"elemDmg","label":"Glacio DMG Bonus +15%, 14s after Intro Skill (Inherent II)","value":15,"conditional":true}],
    "brant": [{"stat":"elemDmg","label":"Fusion DMG Bonus +15%, during Mid-air Attacks (Inherent II)","value":15,"conditional":true}],
    "phoebe": [{"stat":"elemDmg","label":"Spectro DMG Bonus +12%, in Absolution+Confession status (Inherent II)","value":12,"conditional":true}],
    "ciaccona": [{"stat":"dmgBonus","label":"Heavy Atk (Quadruple Downbeat) DMG +30% (Inherent II)","value":30,"conditional":true,"appliesTo":["heavy"]}],
    "zani": [{"stat":"elemDmg","label":"Spectro DMG Bonus +12%, 14s after Intro Skill (Inherent I)","value":12,"conditional":true}],
    "phrolova": [{"stat":"critDmg","label":"Crit DMG +25% (10 Aftersound stacks on combat entry) (Inherent II)","value":25,"conditional":false}],
    // FIXED 2026-07-17 — real Inherent II ("Wind's Indelible Imprint") is
    // graduated: 1-3 stacks grants +30% flat, 4-6 stacks scales +10%/stack
    // up to +60% at 6. Base-kit max Aero Erosion stack is only 3 (6 needs
    // Sequence 2 or an Aero Rover teammate), so 60% was unreachable/wrong at
    // base kit — corrected to the realistically-modelable +30% (wuthering.wiki).
    "cartethyia": [{"stat":"elemDmg","label":"DMG Amplified +30% vs Aero-Erosion targets, +10%/stack past 3 up to +60% at 6 (Inherent II)","value":30,"conditional":true}],
    // ADDED 2026-07-17 — Forte resource "Crown of Wills" base-kit effect had
    // no entry at all: "Each stack grants 15% Electro DMG Bonus" (max 1
    // stack at base) — wuthering.gg.
    "augusta": [{"stat":"elemDmg","label":"Electro DMG Bonus +15%, 1 stack of Crown of Wills","value":15,"conditional":true}],
    "buling": [{"stat":"healingBonus","label":"Healing Bonus +25% vs targets <50% HP (Inherent I)","value":25,"conditional":true}],
    "galbrena": [{"stat":"elemDmg","label":"DMG Amplified +20% (max 4 stacks) (Inherent I)","value":20,"conditional":true}],
    "chisa": [{"stat":"elemDmg","label":"Havoc DMG Bonus +20%, 12s after Intro Skill/Liberation (Inherent II)","value":20,"conditional":true},{"stat":"healingBonus","label":"Healing Bonus +20%, 12s after Intro Skill/Liberation (Inherent II)","value":20,"conditional":true}],
    // ADDED 2026-07-17 — a wholly-new resonator this generator predates
    // (v3.5 Phase 1). Inherent I "Unbroken Vow": each Havoc Bane stack on the
    // target Amplifies DMG by 10% (stacks 1-3) then 12% (stacks 4-6), max
    // +66% at 6 stacks — api.encore.moe/en/character/1610. Modeled as a flat
    // assume-max-stacks toggle, same convention as Cartethyia's similar
    // stacked-DMG-Amp Inherent above.
    "yangyang-xuanling": [{"stat":"elemDmg","label":"DMG Amplified +66% at 6 Havoc Bane stacks on target (Inherent I)","value":66,"conditional":true}],
    "qiuyuan": [{"stat":"dmgBonus","label":"Heavy Atk DMG +50%, after entering Inksplash of Mind (Inherent I)","value":50,"conditional":true,"appliesTo":["heavy"]},{"stat":"atkPct","label":"ATK +10%, 20s on Flowing Panacea consume (Inherent II)","value":10,"conditional":true}],
    "lynae": [{"stat":"elemDmg","label":"Spectro DMG Bonus +25%, 9s after Intro Skill (Inherent II)","value":25,"conditional":true}],
    // Base-kit self-scaling on her own Resonance Liberation "Critical
    // Protocol" (confirmed 2026-07-16, wuthering.gg, distinct from the
    // Sequence 2 TEAM buff above — this one only affects Mornye's own
    // ultimate): "For every 1% of Energy Regen exceeding 100%, this skill
    // gains 0.5% Crit Rate (up to 80%) and 1% Crit DMG (up to 160%)."
    "mornye": [{"stat":"energyRegen","label":"Energy Regen +10% (Inherent I)","value":10,"conditional":false},{"stat":"critRate","label":"Crit Rate (Resonance Liberation, ER-scaled)","value":0.5,"conditional":true,"appliesTo":["ult"],"scaleOff":{"sourceStat":"energyRegen","basis":"total","ratio":0.5,"offset":100,"cap":80}},{"stat":"critDmg","label":"Crit DMG (Resonance Liberation, ER-scaled)","value":1,"conditional":true,"appliesTo":["ult"],"scaleOff":{"sourceStat":"energyRegen","basis":"total","ratio":1,"offset":100,"cap":160}}],
    "luuk-herssen": [{"stat":"atkPct","label":"ATK +25%, 20s after ally Tune Strain-Shifting/Tune Break (Inherent II)","value":25,"conditional":true}],
    "aemeath": [{"stat":"dmgBonus","label":"Heavy Atk DMG Amplification +200%, in Instant Response state (Inherent I)","value":200,"conditional":true,"appliesTo":["heavy"]}],
    "hiyuki": [{"stat":"critDmg","label":"Crit DMG +40%, at 1+ stacks of Snow Rust (Inherent I)","value":40,"conditional":true}],
    "jianxin": [{"stat":"dmgBonus","label":"Liberation DMG +20% (Inherent I)","value":20,"conditional":false,"appliesTo":["ult"]}],
    "lucy": [{"stat":"elemDmg","label":"All DMG Amplification +15% (max 2 stacks), via Network Backdoor (Inherent II)","value":15,"conditional":true},{"stat":"elemDmg","label":"Hack DMG Multiplier +15% (max 2 stacks), via Network Backdoor (Inherent II)","value":15,"conditional":true}],
    "rebecca": [{"stat":"atkPct","label":"ATK +20% (max 2 stacks), 12s after trigger (Inherent I)","value":20,"conditional":true}],
    "rover-aero": [{"stat":"atkPct","label":"ATK +20%, 10s after Intro Skill (Inherent I)","value":20,"conditional":true}],
    "rover-havoc": [{"stat":"elemDmg","label":"Havoc DMG Bonus +20%, in Dark Surge state (Inherent I)","value":20,"conditional":true}],
    "rover-electro": [{"stat":"dmgBonus","label":"Res. Skill DMG +20%, 20s after held-cast Overshock (Inherent II)","value":20,"conditional":true,"appliesTo":["skill"]}],
    // ADDED 2026-07-16 — at max (6) stacks of Blessing of Runes, Sigrika
    // grants HERSELF an extra 30% Aero DMG Bonus AND 30% Echo Skill DMG
    // Bonus, on top of the team-wide per-stack tier already modeled in
    // bundle.ts's cb-ww-sigrika/cb-ww-sigrika-echo. The Echo-Skill-DMG half
    // uses the 'echo' appliesTo scope added 2026-07-16 (see optimizer.ts's
    // canonScope()) — correctly inert until Echo Skill's own damage is
    // modeled (depends on the equipped Echo, out of scope for this pass).
    // 3rd clause of "True Names Aligned" added 2026-07-16 (was missing
    // entirely): "For every 1% of Energy Regen over 125%, Sigrika gains 2%
    // Echo Skill DMG Bonus, up to 50%" (wuthering.gg).
    "sigrika": [{"stat":"elemDmg","label":"Aero DMG Bonus +30%, at 6 stacks of Blessing of Runes (Inherent I)","value":30,"conditional":true},{"stat":"dmgBonus","label":"Echo Skill DMG Bonus +30%, at 6 stacks of Blessing of Runes (Inherent I)","value":30,"conditional":true,"appliesTo":["echo"]},{"stat":"dmgBonus","label":"Echo Skill DMG Bonus (ER-scaled, over 125%)","value":2,"conditional":true,"appliesTo":["echo"],"scaleOff":{"sourceStat":"energyRegen","basis":"total","ratio":2,"offset":125,"cap":50}}],
};

export default CHARACTER_SELF_BUFFS;
