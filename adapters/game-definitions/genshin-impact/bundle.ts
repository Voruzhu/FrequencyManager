/**
 * @fileoverview Genshin Impact UI data bundle (derived from the module)
 * @module adapters/game-definitions/genshin-impact/bundle
 *
 * Assembles the renderer-ready {@link GameBundle} from the Genshin module — the
 * full 90-character roster (`uiOptions.characters`), base stats (characters.ts),
 * weapons, the 37 artifact set names, combat actions and equipment rules all
 * come from the module. Characters in the roster without base-stat data get
 * rarity defaults (flagged `approx`). Gear ranges / enemies / buffs / passives
 * are authored supplements. See `shared/game-data/derive.ts`.
 */

import type { GameBundle, GameCatalogSupplements } from '@shared/types/game-bundle';
import { buildGameBundle } from '@shared/game-data/derive';
import { GI_GEAR_CATALOG, STARTER_CHARACTER } from '@shared/game-data/gear-catalogs';
import { genshinImpact } from './definition';
import { CHARACTERS } from './characters';
import { WEAPONS } from './weapons';
import { WEAPON_CONVERSIONS } from './weapon-conversions';
import { CHARACTER_SKILLS } from './skills';
import { SKILL_MULTIPLIER_OVERRIDES } from './skill-multipliers.generated';
import { SCALED_SKILL_MULTIPLIER_OVERRIDES } from './skill-multipliers-scaled.generated';
import { CHARACTER_STAT_OVERRIDES } from './character-stats.generated';
import { CONSTELLATION_OVERRIDES } from './constellations.generated';
import { CHARACTER_SELF_BUFFS } from './character-passives.generated';

/**
 * Apply imported accurate multipliers (Project Amber) over the authored skill
 * tables — replaces only `multipliers` (keeps curated scaling/element/ids).
 * Overrides cover unambiguous ATK-scaled NA/single-hit skill/burst entries; all
 * other entries keep their authored values. See skill-multipliers.generated.ts.
 */
function withImportedMultipliers(charId: string, skills: typeof CHARACTER_SKILLS[string]) {
    // ATK overrides (Project Amber) + HP/DEF-scaled overrides (genshin-db). No overlap
    // (a skill is one or the other), so a shallow merge is safe.
    const ov = { ...SCALED_SKILL_MULTIPLIER_OVERRIDES[charId], ...SKILL_MULTIPLIER_OVERRIDES[charId] };
    if (Object.keys(ov).length === 0) return skills;
    return skills.map((s) => (ov[s.id] ? { ...s, multipliers: ov[s.id] } : s));
}

/**
 * Apply imported accurate base stats (genshin-db lvl-90) + skill multipliers over
 * the authored character. Our stored base ATK was systematically wrong; HP/DEF
 * mostly right but a few off. See character-stats.generated.ts.
 */
function accurateChar(c: typeof CHARACTERS[number]) {
    const st = CHARACTER_STAT_OVERRIDES[c.id];
    const base = st ? { ...c, baseAtk: st.baseAtk, baseHp: st.baseHp, baseDef: st.baseDef } : c;
    const withSkills = CHARACTER_SKILLS[c.id] ? { ...base, skills: withImportedMultipliers(c.id, CHARACTER_SKILLS[c.id]) } : base;
    const constellations = CONSTELLATION_OVERRIDES[c.id];
    const withConst = constellations ? { ...withSkills, constellations } : withSkills;
    const selfBuffs = CHARACTER_SELF_BUFFS[c.id];
    return selfBuffs ? { ...withConst, selfBuffs } : withConst;
}


const supplements: GameCatalogSupplements = {
    gearRanges: GI_GEAR_CATALOG,
    // See the identical comment in wuthering-waves/bundle.ts — GI_GEAR_CATALOG.sets'
    // icons are surfaced here as a name -> icon lookup for `buildGameBundle`.
    setIcons: Object.fromEntries(
        GI_GEAR_CATALOG.sets.filter((set) => set.icon).map((set) => [set.name, set.icon as string]),
    ),
    statCatalog: [
        { key: 'atk', label: 'ATK' },
        { key: 'hp', label: 'HP' },
        { key: 'def', label: 'DEF' },
        { key: 'elementalMastery', label: 'Elemental Mastery' },
        { key: 'critRate', label: 'Crit Rate', percent: true },
        { key: 'critDmg', label: 'Crit DMG', percent: true },
        { key: 'energyRegen', label: 'Energy Recharge', percent: true },
        { key: 'elemDmg', label: 'Elemental DMG', percent: true },
    ],
    enemies: [
        { id: 'gi-dvalin', name: 'Stormterror Dvalin', level: 90, def: 900, res: 10 },
        { id: 'gi-andrius', name: 'Lupus Boreas (Andrius)', level: 90, def: 920, res: 10 },
        { id: 'gi-childe', name: 'Childe (Tartaglia)', level: 90, def: 950, res: 10 },
        { id: 'gi-azhdaha', name: 'Azhdaha', level: 90, def: 1000, res: 20 },
        { id: 'gi-raiden', name: 'Raiden Shogun', level: 90, def: 1050, res: 10 },
        { id: 'gi-geovishap', name: 'Primo Geovishap', level: 90, def: 900, res: 30 },
        { id: 'gi-serpent', name: 'Ruin Serpent', level: 90, def: 980, res: 10 },
        { id: 'gi-guard', name: 'Ruin Guard', level: 90, def: 820, res: 10 },
    ],
    buffs: {
        basic: [
            { id: 'b-atkp', name: 'ATK% Buff', source: 'Basic', stat: 'atkPct', value: 20 },
            { id: 'b-atk', name: 'Flat ATK', source: 'Basic', stat: 'atk', value: 120 },
            { id: 'b-defp', name: 'DEF% Buff', source: 'Basic', stat: 'defPct', value: 20 },
            { id: 'b-def', name: 'Flat DEF', source: 'Basic', stat: 'def', value: 60 },
            { id: 'b-cr', name: 'Crit Rate', source: 'Basic', stat: 'critRate', value: 12 },
            { id: 'b-cd', name: 'Crit DMG', source: 'Basic', stat: 'critDmg', value: 24 },
            { id: 'b-er', name: 'Energy Recharge', source: 'Basic', stat: 'energyRegen', value: 20 },
            { id: 'b-em', name: 'Elemental Mastery', source: 'Basic', stat: 'elementalMastery', value: 80 },
            { id: 'b-elem', name: 'Elemental DMG', source: 'Basic', stat: 'elemDmg', value: 18 },
        ],
        // KIT buffs a character deploys to the PARTY (matched to a party member
        // by the character's display name). Only genuine team buffs belong here
        // — self-only mechanics (e.g. Hu Tao's HP→ATK) are NOT team buffs and
        // are excluded. Values are best-effort at typical investment; verify.
        // Two flavours:
        //  • Global stat buffs — { stat, value } (ATK/Crit/DMG/EM).
        //  • Per-attack-type DMG% amps — add `appliesTo: [<type>]` (e.g. ['normal'],
        //    ['plunge']). The engine applies these only to matching skills, not
        //    global stats (Yun Jin/Thoma NA-DMG, Xianyun plunge-DMG, etc.).
        character: [
            { id: 'cb-gi-bennett', name: 'Fantastic Voyage (ATK)', source: 'Bennett', stat: 'atk', value: 900, description: 'Burst field grants flat ATK = 100.8% of Bennett’s own Base ATK (talent lvl 10).', scaleOff: { sourceStat: 'atk', basis: 'base', ratio: 1.008 } },
            { id: 'cb-gi-nahida', name: 'Compassion Illuminated (EM)', source: 'Nahida', stat: 'elementalMastery', value: 200, description: 'A1: within her Shrine of Maya, the active character gains EM = 25% of the party’s highest EM member, capped at +250 — previously entirely unmodeled (verified exact — genshin-db passive1; now live via scaleOff’s partyMax basis).', scaleOff: { sourceStat: 'elementalMastery', basis: 'partyMax', ratio: 0.25, cap: 250 } },
            { id: 'cb-gi-kazuha', name: 'Poetics of Fuubutsu', source: 'Kaedehara Kazuha', stat: 'elemDmg', value: 40, description: 'A4: +0.04% swirled-element DMG per point of Kazuha’s own (total) EM.', scaleOff: { sourceStat: 'elementalMastery', basis: 'total', ratio: 0.04 } },
            { id: 'cb-gi-sucrose', name: 'Mollis Favonius (EM share)', source: 'Sucrose', stat: 'elementalMastery', value: 200, description: 'A4: shares 20% of Sucrose’s own (total) EM to the active party for a duration.', scaleOff: { sourceStat: 'elementalMastery', basis: 'total', ratio: 0.2 } },
            { id: 'cb-gi-furina', name: 'Fanfare (party DMG)', source: 'Furina', stat: 'elemDmg', value: 75, description: 'Burst’s Fanfare grants party-wide DMG bonus, capped at 75% (300 max Fanfare × 0.25%/point) — corrected from 60; verified exact cap — genshin-db combat3 param4/param5. Modeled at the cap (assumes active Fanfare generation), not a fixed constant.' },
            { id: 'cb-gi-zhongli', name: 'Jade Shield (RES shred)', source: 'Zhongli', stat: 'elemDmg', value: 20, description: 'Shield lowers enemy Physical & elemental RES by 20% — modeled as effective DMG (verified exact, fixed value — genshin-db combat2).' },
            { id: 'cb-gi-yelan', name: 'Adapt With Ease (party DMG)', source: 'Yelan', stat: 'elemDmg', value: 50, description: 'While Exquisite Throw is up, the active character deals ramping bonus DMG (+1%, then +3.5%/s), capped at 50% — corrected from a lower guess; verified exact cap — genshin-db passive2.' },
            // Faruzan's real mechanic is flat additive DMG (not a %-multiplier): "this DMG
            // is increased BASED ON 32% of Faruzan's Base ATK" — added directly to the
            // affected attack's own damage. Previously mis-modeled as a flat elemDmg%.
            { id: 'cb-gi-faruzan', name: 'Hurricane Guard (flat DMG add)', source: 'Faruzan', stat: 'flatDmgAdd', value: 400, appliesTo: ['normal', 'charged', 'plunge', 'skill', 'ult'], description: 'While Prayerful Wind’s Benefit is active, the affected character’s Anemo-DMG attacks gain flat bonus DMG = 32% of Faruzan’s own Base ATK, once every 0.8s — corrected from a wrong flat elemDmg% (verified exact — genshin-db passive2).', scaleOff: { sourceStat: 'atk', basis: 'base', ratio: 0.32 } },
            { id: 'cb-gi-mona', name: 'Omen (party DMG)', source: 'Mona', stat: 'elemDmg', value: 60, description: 'Burst’s Omen marks the target — attacks against it (from anyone) deal +60% DMG at talent lvl 10 — corrected from 42; verified exact — genshin-db combat3 param10.' },
            { id: 'cb-gi-chevreuse', name: 'Coordinated Tactics (Pyro/Electro DMG)', source: 'Chevreuse', stat: 'elemDmg', value: 40, description: 'After an Overload, mono-Pyro/Electro parties’ opponent Pyro & Electro RES is decreased by 40% — modeled as effective DMG (verified exact, fixed value — genshin-db passive1).' },
            { id: 'cb-gi-chevreuse-atk', name: 'Vertical Force Coordination (ATK)', source: 'Chevreuse', stat: 'atkPct', value: 40, description: 'After firing an Overcharged Ball, nearby Pyro/Electro party members gain +1% ATK per 1,000 of Chevreuse’s own Max HP, capped at 40% (verified — genshin-db passive2; scales with her real HP via scaleOff).', scaleOff: { sourceStat: 'hp', basis: 'total', ratio: 0.001, cap: 40 } },
            // Shenhe's real kit was mis-modeled as a flat-ATK-scaled Cryo DMG add — her
            // actual passives are much simpler, both fixed %s with no stat-scaling:
            // A1 "Deific Embrace" (Cryo DMG+15% in her skill field, unconditional once
            // the field is up) + A4 "Spirit Communion Seal" (Skill/Burst DMG+15% OR
            // Normal/Charged/Plunge DMG+15%, depending on which variant of her Skill she
            // casts — added as 2 separate toggles since they're mutually exclusive).
            { id: 'cb-gi-shenhe', name: 'Deific Embrace (Cryo DMG)', source: 'Shenhe', stat: 'elemDmg', value: 15, description: 'Active character within Divine Maiden’s Deliverance gains 15% Cryo DMG Bonus — corrected from a wrong flat-ATK-scaled assumption (verified exact — genshin-db passive1).' },
            { id: 'cb-gi-shenhe-press', name: 'Spirit Communion Seal (Skill/Burst, Press)', source: 'Shenhe', stat: 'dmgBonus', value: 15, appliesTo: ['skill', 'ult'], description: 'Press variant of Spring Spirit Summoning grants Skill/Burst DMG+15% for 10s (verified exact — genshin-db passive2).' },
            { id: 'cb-gi-shenhe-hold', name: 'Spirit Communion Seal (Normal/Charged/Plunge, Hold)', source: 'Shenhe', stat: 'dmgBonus', value: 15, appliesTo: ['normal', 'charged', 'plunge'], description: 'Hold variant of Spring Spirit Summoning grants Normal/Charged/Plunging Attack DMG+15% for 15s (verified exact — genshin-db passive2).' },
            { id: 'cb-gi-sara', name: 'Tengu Juurai (ATK)', source: 'Kujou Sara', stat: 'atk', value: 720, description: 'Skill/Burst grant the active character flat ATK = 77.3% of Sara’s own Base ATK (talent lvl 10).', scaleOff: { sourceStat: 'atk', basis: 'base', ratio: 0.77328 } },
            { id: 'cb-gi-gorou', name: 'General\'s War Banner (Geo DMG)', source: 'Gorou', stat: 'elemDmg', value: 15, description: 'Banner grants Geo DMG bonus (and DEF) to the Geo party — modeled as effective Geo DMG (verified exact, talent lvl 10 — genshin-db combat2 param3).' },
            { id: 'cb-gi-gorou-def', name: 'Heedless of the Wind and Weather (DEF)', source: 'Gorou', stat: 'defPct', value: 25, description: 'After using his Burst, nearby party members gain +25% DEF for 12s — previously entirely unmodeled (verified exact, fixed value — genshin-db passive1).' },
            { id: 'cb-gi-albedo', name: 'Homuncular Nature (EM)', source: 'Albedo', stat: 'elementalMastery', value: 125, description: 'A4: after Tectonic Tide, nearby party members gain +125 Elemental Mastery for 10s.' },
            { id: 'cb-gi-rosaria', name: 'Shadow Samaritan (Crit Rate)', source: 'Rosaria', stat: 'critRate', value: 12, description: 'A4: crit hits from her Skill grant nearby party members Crit Rate equal to 15% of Rosaria’s own (~12%).' },
            { id: 'cb-gi-citlali', name: 'Opal Radiance (Cryo/Hydro shred)', source: 'Citlali', stat: 'elemDmg', value: 20, description: 'Shield and Itzpapa lower enemy Cryo & Hydro RES — modeled as effective elemental DMG (verified exact, fixed value — genshin-db passive1).' },
            { id: 'cb-gi-lisa', name: 'Static Electricity (DEF shred)', source: 'Lisa', stat: 'elemDmg', value: 15, description: 'A4: her Charged Attacks stack a debuff that lowers enemy DEF by up to 15% — modeled as effective DMG (verified exact, fixed value — genshin-db passive2).' },
            { id: 'cb-gi-mika', name: 'Suppressive Barrage (Physical DMG)', source: 'Mika', stat: 'elemDmg', value: 30, description: 'Soulwind’s Detector effect grants +10% Physical DMG per stack, up to 3 stacks (30%) from on-rotation triggers alone — modeled as effective DMG; a 4th stack is possible but needs a same-instant CRIT while both Eagleplume and Soulwind are active, too situational to assume (corrected from 20 — genshin-db passive1).' },
            // ── Per-attack-type DMG amps (scoped) ──
            { id: 'cb-gi-yunjin', name: 'Cliffbreaker\'s Banner (NA DMG)', source: 'Yunjin', stat: 'dmgBonus', value: 45, appliesTo: ['normal'], description: 'Burst grants party Normal-Attack DMG bonus scaling with Yun Jin’s DEF (~40–55% at investment).' },
            { id: 'cb-gi-thoma', name: 'Crimson Ooyoroi (NA DMG)', source: 'Thoma', stat: 'dmgBonus', value: 25, appliesTo: ['normal'], description: 'Burst grants party Normal-Attack DMG bonus scaling with Thoma’s Max HP (~25% at investment).' },
            { id: 'cb-gi-candace', name: 'Prayer of the Crimson Crown (NA DMG)', source: 'Candace', stat: 'dmgBonus', value: 20, appliesTo: ['normal'], description: 'Burst grants party Normal-Attack DMG bonus (and a Hydro infusion) (~20%).' },
            { id: 'cb-gi-xianyun', name: 'Starwicker (Plunge DMG)', source: 'Xianyun', stat: 'dmgBonus', value: 40, appliesTo: ['plunge'], description: 'A-passive grants party members flat Plunging-Attack DMG scaling with Xianyun’s ATK — modeled as a Plunge-DMG amp.' },
            // ── Character self-passive-talent team buffs (found during the GI
            // character-selfBuffs pass — genshin-db passive1/passive2, verified exact) ──
            { id: 'cb-gi-ganyu', name: 'Celestial Shower (Cryo DMG)', source: 'Ganyu', stat: 'elemDmg', value: 20, description: 'Celestial Shower’s AoE grants party members within it Cryo DMG Bonus+20% (genshin-db passive1).' },
            { id: 'cb-gi-ningguang', name: 'Strategic Reserve (Geo DMG)', source: 'Ningguang', stat: 'elemDmg', value: 12, description: 'A character passing through the Jade Screen gains Geo DMG Bonus+12% for 10s (gi.yatta.moe passive2, verified 2026-07-11).' },
            { id: 'cb-gi-hutao', name: 'Ominous Rainfall (Crit Rate)', source: 'Hu Tao', stat: 'critRate', value: 12, description: 'After Paramita Papilio ends, all party members except Hu Tao gain Crit Rate+12% for 8s (genshin-db passive2).' },
            { id: 'cb-gi-yoimiya', name: 'Ryuukin Saxifrage (ATK)', source: 'Yoimiya', stat: 'atkPct', value: 20, description: 'After Ryuukin Saxifrage explodes at max stacks, nearby party members (excl. Yoimiya) gain ATK+20% for 10s (genshin-db passive1).' },
            { id: 'cb-gi-furina-salon', name: 'Salon Members (party DMG)', source: 'Furina', stat: 'elemDmg', value: 28, description: 'A4: Salon Solitaire members’ DMG is increased by 0.07% of Furina’s own Max HP, capped at 28% — distinct from her Fanfare burst buff (cb-gi-furina) (genshin-db passive2).', scaleOff: { sourceStat: 'hp', basis: 'total', ratio: 0.0007, cap: 28 } },
            { id: 'cb-gi-aloy-team', name: 'Prophecies of Dawn (ATK)', source: 'Aloy', stat: 'atkPct', value: 8, description: 'Coil effect also grants nearby party members ATK+8% for its duration — paired with Aloy’s own self-buff (genshin-db passive1).' },
            { id: 'cb-gi-ineffa', name: 'Thundering Tempo (EM)', source: 'Ineffa', stat: 'elementalMastery', value: 0, description: 'After Burst, self and one active-field-swapped party member gain EM = 6% of Ineffa’s own ATK (genshin-db passive2).', scaleOff: { sourceStat: 'atk', basis: 'total', ratio: 0.06 } },
            { id: 'cb-gi-escoffier', name: 'Recipe: Fresh Fruit Mix (RES shred)', source: 'Escoffier', stat: 'elemDmg', value: 55, description: 'Applies a stacking Hydro/Cryo RES shred to enemies, up to 4 same-type party members — modeled as effective DMG at max stacks (genshin-db passive1).' },
            { id: 'cb-gi-sigewinne', name: 'Undivided Arcana (Skill DMG)', source: 'Sigewinne', stat: 'flatDmgAdd', value: 0, appliesTo: ['skill'], description: 'Off-field party members’ Skill DMG gains a flat add = 8% of Sigewinne’s own Max HP above 30,000 (genshin-db passive2).', scaleOff: { sourceStat: 'hp', basis: 'total', ratio: 0.08, offset: 30000, cap: 2800 } },
        ],
    },
    passives: [
        { id: 'gi-p1', name: '1st Ascension Passive', description: 'Unlocked at Ascension 1.' },
        { id: 'gi-p4', name: '4th Ascension Passive', description: 'Unlocked at Ascension 4.' },
        { id: 'gi-put', name: 'Utility Passive', description: 'An out-of-combat convenience.' },
    ],
};

// Genshin's Vaporize/Melt/Aggravate/Spread reaction system — the Calculator's
// reaction picker only shows for games with `supportsReactions: true`.
// Precise character skill lists use the short ids na/charged/skill/burst/aimed;
// the universal action types they might omit. Aimed Shot is Bow-only.
const BACKFILL_SKILL_IDS = [
    { id: 'na', actionId: 'normalAttack' },
    { id: 'charged', actionId: 'chargedAttack' },
    { id: 'plunge', actionId: 'plungingAttack' },
    { id: 'aimed', actionId: 'aimedShot', weaponTypes: ['Bow'] },
];

/**
 * The exact input `buildGameBundle` derives from — exported standalone (not
 * just inlined below) so `scripts/build-game-package.js` can require the
 * compiled version of this module and re-serialize it as an external
 * game-module package (see docs/GAME_MODULES.md), without reverse-engineering
 * these pieces from anywhere else. Every field here is plain data.
 */
export const genshinImpactModuleInput = {
    def: genshinImpact,
    charDB: CHARACTERS.map(accurateChar),
    // Merge authored stat conversions (HP/EM→ATK) onto the generated weapon rows.
    weaponDB: WEAPONS.map((w) => (WEAPON_CONVERSIONS[w.id] ? { ...w, conversions: WEAPON_CONVERSIONS[w.id] } : w)),
    defaultElement: 'Physical',
    defaultWeapon: 'Sword',
    hasElementalMastery: true,
    supportsReactions: true,
    backfillSkillIds: BACKFILL_SKILL_IDS,
    setPieces: 4,
    partyTeammates: 3,
    starterCharacterId: STARTER_CHARACTER['genshin-impact'],
    sequenceLabel: 'Constellation',
    sequenceMax: 6,
    supplements,
};

export const genshinImpactBundle: GameBundle = buildGameBundle(genshinImpactModuleInput);

export default genshinImpactBundle;
