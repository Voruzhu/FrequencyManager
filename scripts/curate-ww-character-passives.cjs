/**
 * curate-ww-character-passives.cjs
 *
 * Hand-curated SELF stat buffs from WW resonators' own Inherent Skills — the WW
 * equivalent of GI's CharacterEntry.selfBuffs (see curate-gi-character-passives.cjs).
 *
 * Sourced from the Dimbreath datamine's Skill.json: every resonator has exactly 2
 * `SkillType===4` records ("Inherent Skill I/II") reachable via their
 * SkillTreeGroupId's SkillTree nodes. Confirmed via direct inspection this is a
 * DIFFERENT skill-type numbering than the stale comment in
 * scripts/import-wuwa-skills.cjs assumed (`TYPE_TO_ID: {4:'forte'}` is WRONG —
 * type 4 records have ZERO DamageList/BuffList, pure passive text; the REAL Forte
 * (with a real DamageList) is SkillType 6. Left uninvestigated/unfixed here since
 * it's a separate pre-existing bug outside this feature's scope — noted in
 * DATA_PROGRESS for a future pass, not blindly "fixed" without per-character
 * verification). SkillType 11 is the Outro Skill (already fully modeled as WW kit
 * team-buffs in bundle.ts's `character:` array, sourced independently — no overlap
 * with Inherent Skill data). SkillType 12 ("Tune Break: <Weapon>") is a shared
 * weapon-type-generic ability, not character kit — excluded by construction (only
 * SkillType 4 was ever surveyed).
 *
 * Read all 88 Inherent Skill I/II text entries (44 resonators) by hand — same
 * discipline as every other curation pass this session, no blind extraction.
 * Rejection categories match GI's precedent (proc/summon damage, defensive-only
 * stats with no offensive primitive, stacking without a stated max, compound
 * multi-variable/multi-mode mechanics, pickup/RNG-dependent triggers too
 * unreliable to assume) plus one WW-specific one: buffs scoped ONLY to "Intro
 * Skill" DMG — this calc has no `intro` skill entry in any WW character's
 * `skills[]` (only basic/skill/ult/forte are authored), so such a buff would be
 * structurally inapplicable, same class as GI's off-field-only rejection (e.g.
 * Jinhsi's "Converged Flash", Lingyang's "Lion's Pride").
 *
 * Team-wide finding note: exactly ONE Inherent Skill was team-wide (Verina's
 * "Gift of Nature", ATK%+20 to all team members) — already modeled as the
 * existing `cb-ww-verina` kit buff (sourced independently via her Outro Skill,
 * same numeric effect described by both skills in Verina's kit design) — verified
 * via grep before writing this file, correctly NOT duplicated here.
 *
 * This file directly WRITES the whole character-passives.generated.ts content
 * (mirrors curate-gi-character-passives.cjs — no separate structured-import step
 * exists for this text, same as GI).
 * Re-run: node scripts/curate-ww-character-passives.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'adapters', 'game-definitions', 'wuthering-waves', 'character-passives.generated.ts');

const b = (stat, label, value, opts) => {
    const o = Array.isArray(opts) ? { appliesTo: opts } : (opts || {});
    const out = { stat, label, value, conditional: o.uncond ? false : true };
    if (o.appliesTo) out.appliesTo = o.appliesTo;
    return out;
};

const META = {
    'rover-spectro': [
        b('dmgBonus', 'Basic Atk (Resonating Echoes) DMG +60% (Inherent I)', 60, { appliesTo: ['basic'], uncond: true }),
        b('atkPct', 'ATK +15%, 5s after Heavy Attack Resonance (Inherent II)', 15),
    ],
    jinhsi: [
        b('elemDmg', 'Spectro DMG Bonus +20% (Inherent I)', 20, { uncond: true }),
    ],
    yinlin: [
        b('critRate', 'Crit Rate +15%, 5s after Resonance Skill (Inherent I)', 15),
        b('dmgBonus', 'Resonance Skill DMG +10% vs Sinner\'s-Mark targets (Inherent II)', 10, ['skill']),
        b('atkPct', 'ATK +10%, 4s, on Sinner\'s-Mark trigger (Inherent II)', 10),
    ],
    changli: [
        b('elemDmg', 'Fusion DMG Bonus +20%, after Heavy Atk/Liberation cast (Inherent II)', 20),
    ],
    camellya: [
        b('elemDmg', 'Havoc DMG Bonus +15% (Inherent I)', 15, { uncond: true }),
        b('dmgBonus', 'Basic Atk DMG +15% (Inherent II)', 15, { appliesTo: ['basic'], uncond: true }),
    ],
    jiyan: [
        b('atkPct', 'ATK +10%, 15s after Intro Skill (Inherent I)', 10),
        b('critDmg', 'Crit DMG +12%, 8s on hit (Inherent II)', 12),
    ],
    calcharo: [
        b('dmgBonus', 'Liberation DMG +10%, 15s after Heavy Atk Mercy (Inherent I)', 10, ['ult']),
    ],
    encore: [
        b('dmgBonus', 'Liberation DMG +10% while HP>70%, during Cosmos Rave (Inherent I)', 10, ['ult']),
        // Real text: "Encore's Fusion DMG Bonus is increased by 10%" — a global
        // elemental DMG Bonus, not scoped to Resonance Skill specifically.
        // Corrected 2026-07-11 recheck (was dmgBonus/appliesTo:['skill']).
        b('elemDmg', 'Fusion DMG Bonus +10%, 10s after Resonance Skill cast (Inherent II)', 10),
    ],
    sanhua: [
        b('dmgBonus', 'Res. Skill DMG +20%, 8s after Intro Skill (Inherent I)', 20, ['skill']),
        b('dmgBonus', 'Forte Circuit DMG +20%, 8s after Basic Atk 5 (Inherent II)', 20, ['forte']),
    ],
    yangyang: [
        b('elemDmg', 'Aero DMG Bonus +8%, 8s after Intro Skill (Inherent II)', 8),
    ],
    chixia: [
        b('dmgBonus', 'Resonance Skill DMG +50% (Inherent I)', 50, { appliesTo: ['skill'], uncond: true }),
        b('atkPct', 'ATK +30% (max 30 stacks), during Resonance Skill (Inherent II)', 30),
    ],
    danjin: [
        b('dmgBonus', 'Res. Skill DMG +20%, via Dodge-Counter trigger (Inherent I)', 20, ['skill']),
        b('dmgBonus', 'Heavy Atk DMG +30%, 5s after Res. Skill (Inherent II)', 30, ['heavy']),
    ],
    mortefi: [
        b('dmgBonus', 'Res. Skill DMG +25%, 8s after casting (Inherent I)', 25, ['skill']),
        b('dmgBonus', 'Liberation DMG +75% (max 50 stacks), during Burning Rhapsody (Inherent II)', 75, ['ult']),
    ],
    taoqi: [
        b('defPct', 'DEF +15% while Rocksteady Shield active (Inherent I)', 15),
    ],
    'xiangli-yao': [
        b('elemDmg', 'Electro DMG Bonus +20% (max 4 stacks), 8s after Res. Skill (Inherent I)', 20),
    ],
    zhezhi: [
        b('atkPct', 'ATK +18% (max 3 stacks), 27s after Res. Skill (Inherent I)', 18),
    ],
    shorekeeper: [
        b('energyRegen', 'Energy Regen +10%, near Stellarealm (Inherent II)', 10),
    ],
    roccia: [
        b('atkPct', 'ATK +20%, 12s after Res. Skill/Heavy Atk (Inherent I)', 20),
    ],
    cantarella: [
        b('healingBonus', 'Healing Bonus +20% (Inherent I)', 20, { uncond: true }),
        b('elemDmg', 'Havoc DMG Bonus +12% (max 2 stacks), 10s after Echo Skill (Inherent II)', 12),
    ],
    yuanwu: [
        b('dmgBonus', 'Res. Skill (Thunder Uprising) DMG +40% (Inherent II)', 40, { appliesTo: ['skill'], uncond: true }),
    ],
    lumi: [
        b('elemDmg', 'Electro DMG Bonus +10%, in Red Light Mode (Inherent I)', 10),
        b('atkPct', 'ATK +10%, 5s after Energized Pounce/Rebound (Inherent II)', 10),
    ],
    youhu: [
        b('elemDmg', 'Glacio DMG Bonus +15%, 14s after Intro Skill (Inherent II)', 15),
    ],
    brant: [
        b('elemDmg', 'Fusion DMG Bonus +15%, during Mid-air Attacks (Inherent II)', 15),
    ],
    phoebe: [
        b('elemDmg', 'Spectro DMG Bonus +12%, in Absolution+Confession status (Inherent II)', 12),
    ],
    ciaccona: [
        b('dmgBonus', 'Heavy Atk (Quadruple Downbeat) DMG +30% (Inherent II)', 30, ['heavy']),
    ],
    zani: [
        b('elemDmg', 'Spectro DMG Bonus +12%, 14s after Intro Skill (Inherent I)', 12),
    ],
    phrolova: [
        b('critDmg', 'Crit DMG +25% (10 Aftersound stacks on combat entry) (Inherent II)', 25, { uncond: true }),
    ],
    cartethyia: [
        b('elemDmg', 'DMG Amplified +60% vs max-stack Aero-Erosion targets (Inherent II)', 60),
    ],
    buling: [
        b('healingBonus', 'Healing Bonus +25% vs targets <50% HP (Inherent I)', 25),
    ],
    galbrena: [
        b('elemDmg', 'DMG Amplified +20% (max 4 stacks) (Inherent I)', 20),
    ],
    chisa: [
        b('elemDmg', 'Havoc DMG Bonus +20%, 12s after Intro Skill/Liberation (Inherent II)', 20),
        b('healingBonus', 'Healing Bonus +20%, 12s after Intro Skill/Liberation (Inherent II)', 20),
    ],
    qiuyuan: [
        b('dmgBonus', 'Heavy Atk DMG +50%, after entering Inksplash of Mind (Inherent I)', 50, ['heavy']),
        b('atkPct', 'ATK +10%, 20s on Flowing Panacea consume (Inherent II)', 10),
    ],
    lynae: [
        b('elemDmg', 'Spectro DMG Bonus +25%, 9s after Intro Skill (Inherent II)', 25),
    ],
    mornye: [
        b('energyRegen', 'Energy Regen +10% (Inherent I)', 10, { uncond: true }),
    ],
    'luuk-herssen': [
        b('atkPct', 'ATK +25%, 20s after ally Tune Strain-Shifting/Tune Break (Inherent II)', 25),
    ],
    aemeath: [
        b('dmgBonus', 'Heavy Atk DMG Amplification +200%, in Instant Response state (Inherent I)', 200, ['heavy']),
    ],
    // 11 characters added 2026-07-12, sourced from api.encore.moe's Inherent
    // Skill text (see [[ww-encore-api-source]]). Same rejection criteria as
    // above, read by hand — plus one new rejection this batch: Denia's/
    // Rebecca's team-wide Inherent Skills (Etched Colors, Left an Opening!)
    // were excluded for being team-wide, same as Verina's precedent (this
    // file is SELF-only; no parallel "kit buff" was authored for them this
    // pass — a known gap, not an oversight). 4 of the 11 (Denia, Lucilla,
    // Sigrika, Suisui) genuinely have ZERO Inherent Skill buffs clearing the
    // bar (resource/proc/defensive-only mechanics, or team-wide) — correctly
    // omitted rather than forcing an entry.
    hiyuki: [
        b('critDmg', 'Crit DMG +40%, at 1+ stacks of Snow Rust (Inherent I)', 40),
    ],
    jianxin: [
        b('dmgBonus', 'Liberation DMG +20% (Inherent I)', 20, { appliesTo: ['ult'], uncond: true }),
    ],
    lucy: [
        b('elemDmg', 'All DMG Amplification +15% (max 2 stacks), via Network Backdoor (Inherent II)', 15),
    ],
    rebecca: [
        b('atkPct', 'ATK +20% (max 2 stacks), 12s after trigger (Inherent I)', 20),
    ],
    'rover-aero': [
        b('atkPct', 'ATK +20%, 10s after Intro Skill (Inherent I)', 20),
    ],
    'rover-havoc': [
        b('elemDmg', 'Havoc DMG Bonus +20%, in Dark Surge state (Inherent I)', 20),
    ],
    'rover-electro': [
        b('dmgBonus', 'Res. Skill DMG +20%, 20s after held-cast Overshock (Inherent II)', 20, ['skill']),
    ],
};

const body = Object.entries(META).map(([id, buffs]) => `    ${JSON.stringify(id)}: ${JSON.stringify(buffs)},`).join('\n');
const ts = `/**
 * @fileoverview Hand-curated WW resonator Inherent Skill self-buffs
 * @module adapters/game-definitions/wuthering-waves/character-passives.generated
 *
 * SELF stat buffs from a resonator's own Inherent Skills (SkillType 4 in the
 * Dimbreath datamine) — the WW equivalent of GI's character passive-talent
 * selfBuffs. See scripts/curate-ww-character-passives.cjs for methodology,
 * rejection categories, and the SkillType-4-is-not-Forte correction note.
 * DO NOT edit by hand — re-run scripts/curate-ww-character-passives.cjs.
 * ${Object.keys(META).length} resonators, ${Object.values(META).reduce((n, a) => n + a.length, 0)} buff entries.
 */

export const CHARACTER_SELF_BUFFS: Record<string, Array<{ stat: string; label: string; value: number; conditional?: boolean; appliesTo?: string[] }>> = {
${body}
};

export default CHARACTER_SELF_BUFFS;
`;
fs.writeFileSync(OUT, ts);
console.log(`curated ${Object.keys(META).length} resonators | ${Object.values(META).reduce((n, a) => n + a.length, 0)} buff entries`);
