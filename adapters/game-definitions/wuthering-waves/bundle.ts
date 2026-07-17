/**
 * @fileoverview Wuthering Waves UI data bundle (derived from the module)
 * @module adapters/game-definitions/wuthering-waves/bundle
 *
 * Assembles the renderer-ready {@link GameBundle} from the Wuthering Waves game
 * module — the roster (`uiOptions.characters`), character base stats
 * (characters.ts), weapons (weapons.ts), set names, combat actions and
 * equipment rules all come from the module. The parts the module doesn't define
 * (gear stat ranges, stat catalog, enemies, buffs, passives) are authored here
 * as supplements. See `shared/game-data/derive.ts`.
 */

import type { GameBundle, GameCatalogSupplements } from '@shared/types/game-bundle';
import { buildGameBundle } from '@shared/game-data/derive';
import { WW_GEAR_CATALOG, STARTER_CHARACTER } from '@shared/game-data/gear-catalogs';
import { wutheringWaves } from './definition';
import { CHARACTERS } from './characters';
import { WEAPONS } from './weapons';
import { CHARACTER_SKILLS } from './skills';
import { CHARACTER_STAT_OVERRIDES } from './character-stats.generated';
import { SKILL_MULTIPLIER_OVERRIDES } from './skill-multipliers.generated';
import { SEQUENCE_OVERRIDES } from './sequences.generated';
import { CHARACTER_SELF_BUFFS } from './character-passives.generated';
import { CHARACTER_SKILL_TREE_BUFFS } from './character-skilltree.generated';

/**
 * Apply imported accurate base stats (Dimbreath datamine, lvl-90 base x growth)
 * over the authored character. Our authored ATK was ~2x too high and DEF ~2x too
 * low; this is the config-accurate PURE base — skill-tree stat nodes are
 * deliberately excluded here (they're optional player investment, not automatic
 * base stats) and instead surfaced as toggleable conditional selfBuffs via
 * CHARACTER_SKILL_TREE_BUFFS below.
 */
function accurateChar(c: typeof CHARACTERS[number]) {
    const st = CHARACTER_STAT_OVERRIDES[c.id];
    const base = st ? { ...c, baseAtk: st.baseAtk, baseHp: st.baseHp, baseDef: st.baseDef } : c;
    const authored = CHARACTER_SKILLS[c.id];
    const withSkills = (() => {
        if (!authored) return base;
        // Skill multipliers from the datamine (real game values; primary DMG component
        // per skill, multi-hit summed). Keep authored where no override exists.
        const ov = SKILL_MULTIPLIER_OVERRIDES[c.id];
        const skills = ov ? authored.map((s) => (ov[s.id] ? { ...s, multipliers: ov[s.id] } : s)) : authored;
        return { ...base, skills };
    })();
    const constellations = SEQUENCE_OVERRIDES[c.id];
    const withConst = constellations ? { ...withSkills, constellations } : withSkills;
    const selfBuffs = [...(CHARACTER_SELF_BUFFS[c.id] ?? []), ...(CHARACTER_SKILL_TREE_BUFFS[c.id] ?? [])];
    return selfBuffs.length ? { ...withConst, selfBuffs } : withConst;
}

const supplements: GameCatalogSupplements = {
    gearRanges: WW_GEAR_CATALOG,
    // `WW_GEAR_CATALOG.sets` already carries per-set icon paths — surface them
    // as a name -> icon lookup so `buildGameBundle` can attach one to each of
    // `def.uiOptions.setNames`'s REAL sets (the canonical, always-in-sync-with-
    // `SET_BONUSES` list) without `gearRanges.sets` itself needing to be that
    // canonical list too.
    setIcons: Object.fromEntries(
        WW_GEAR_CATALOG.sets.filter((set) => set.icon).map((set) => [set.name, set.icon as string]),
    ),
    // WuWa has NO Elemental Mastery. `elemDmg` is the generic elemental slot.
    statCatalog: [
        { key: 'atk', label: 'ATK' },
        { key: 'hp', label: 'HP' },
        { key: 'def', label: 'DEF' },
        { key: 'critRate', label: 'Crit Rate', percent: true },
        { key: 'critDmg', label: 'Crit DMG', percent: true },
        { key: 'energyRegen', label: 'Energy Regen', percent: true },
        { key: 'elemDmg', label: 'Elemental DMG', percent: true },
        // ADDED 2026-07-17 — a real rollable echo main-stat (cost-4 slot,
        // see WW_GEAR_CATALOG) had no stat-catalog entry, so gear rolling it
        // was invisible in Build Stats and unselectable as an optimize
        // target. Doesn't affect damage output (no healing-amount formula
        // exists in this calculator) — purely for visibility/support-build
        // theorycrafting.
        { key: 'healingBonus', label: 'Healing Bonus', percent: true },
    ],
    enemies: [
        { id: 'ww-crownless', name: 'Crownless', level: 90, def: 900, res: 10 },
        { id: 'ww-aix', name: 'Mourning Aix', level: 90, def: 950, res: 10 },
        { id: 'ww-beringal', name: 'Feilian Beringal', level: 90, def: 920, res: 20 },
        { id: 'ww-mephis', name: 'Tempest Mephis', level: 90, def: 1000, res: 20 },
        { id: 'ww-inferno', name: 'Inferno Rider', level: 90, def: 880, res: 20 },
        { id: 'ww-lampylumen', name: 'Lampylumen Myriad', level: 90, def: 860, res: 20 },
        { id: 'ww-dreamless', name: 'Dreamless', level: 90, def: 1050, res: 15 },
        { id: 'ww-hecate', name: 'Hecate', level: 90, def: 1150, res: 20 },
    ],
    buffs: {
        basic: [
            { id: 'b-atkp', name: 'ATK% Buff', source: 'Basic', stat: 'atkPct', value: 20 },
            { id: 'b-atk', name: 'Flat ATK', source: 'Basic', stat: 'atk', value: 120 },
            { id: 'b-defp', name: 'DEF% Buff', source: 'Basic', stat: 'defPct', value: 20 },
            { id: 'b-def', name: 'Flat DEF', source: 'Basic', stat: 'def', value: 60 },
            { id: 'b-cr', name: 'Crit Rate', source: 'Basic', stat: 'critRate', value: 12 },
            { id: 'b-cd', name: 'Crit DMG', source: 'Basic', stat: 'critDmg', value: 24 },
            { id: 'b-er', name: 'Energy Regen', source: 'Basic', stat: 'energyRegen', value: 20 },
            { id: 'b-elem', name: 'Elemental DMG', source: 'Basic', stat: 'elemDmg', value: 18 },
        ],
        // KIT buffs a resonator deploys to the PARTY (matched to a member by
        // display name). Best-effort values at typical investment; verify.
        // Two flavours:
        //  • Global stat buffs — { stat, value } (ATK/Crit/DMG/EM).
        //  • Per-attack-type DMG% amps — add `appliesTo: [<type>]` (e.g. ['basic']).
        //    The engine applies these only to matching skills (not global stats).
        character: [
            { id: 'cb-ww-verina', name: 'Gift of Nature (ATK)', source: 'Verina', stat: 'atkPct', value: 20, description: 'Casting Heavy/Mid-air Attack, Liberation, or Outro grants all team members +20% ATK for 20s (fixed passive, verified exact — Skill.json 1000305).' },
            { id: 'cb-ww-verina-outro', name: 'Blossom (DMG amp)', source: 'Verina', stat: 'elemDmg', value: 15, description: 'Outro Skill amplifies the incoming resonator’s (and nearby team’s) DMG by 15% for 30s (verified exact — Skill.json 1000309).' },
            { id: 'cb-ww-shorekeeper', name: 'End Loop / Inner Stellarealm (Crit Rate)', source: 'Shorekeeper', stat: 'critRate', value: 12.5, description: 'Inner Stellarealm: for every 0.2% of Shorekeeper’s own Energy Regen, the team gains 0.01% Crit Rate, capped at 12.5% (verified exact — Skill.json 1002503; scales with her real ER via scaleOff).', scaleOff: { sourceStat: 'energyRegen', basis: 'total', ratio: 0.05, cap: 12.5 } },
            // ADDED 2026-07-16 — her innate Outro Skill "Binary Butterfly"
            // had NO buff entry anywhere (only the ER->Crit-Rate kit ability
            // above was modeled); this is the same "team DMG amp" pattern as
            // Verina's Outro right above it (verified exact — Skill.json 1002509).
            { id: 'cb-ww-shorekeeper-outro', name: 'Binary Butterfly (DMG amp)', source: 'Shorekeeper', stat: 'elemDmg', value: 15, description: 'Outro Skill amplifies all nearby party members’ DMG by 15% for up to 30s (verified exact — Skill.json 1002509).' },
            // ADDED 2026-07-16 — Resonance Liberation "Supernal Stellarealm"
            // has a second, separate ER-scaled tier beyond the Crit Rate one
            // above (same skill, same scaleOff mechanic, different stat/cap).
            { id: 'cb-ww-shorekeeper-critdmg', name: 'Supernal Stellarealm (Crit DMG)', source: 'Shorekeeper', stat: 'critDmg', value: 25, description: 'Supernal Stellarealm: for every 0.1% of Shorekeeper’s own Energy Regen, the team gains 0.01% Crit DMG, capped at 25% (verified exact — Skill.json 1002503; scales with her real ER via scaleOff).', scaleOff: { sourceStat: 'energyRegen', basis: 'total', ratio: 0.1, cap: 25 } },
            { id: 'cb-ww-yinlin', name: 'Strategist (Electro DMG amp)', source: 'Yinlin', stat: 'elemDmg', value: 20, description: 'Outro Skill amplifies the incoming resonator’s Electro DMG by 20% for 14s (verified exact — Skill.json 1001509).' },
            { id: 'cb-ww-yinlin-outro-ult', name: 'Strategist (Liberation DMG amp)', source: 'Yinlin', stat: 'dmgBonus', value: 25, appliesTo: ['ult'], description: 'Same Outro also amplifies Resonance Liberation DMG by 25% for 14s (verified exact — Skill.json 1001509).' },
            { id: 'cb-ww-zhezhi', name: 'Carve and Draw (Glacio DMG amp)', source: 'Zhezhi', stat: 'elemDmg', value: 20, description: 'Outro Skill amplifies the incoming resonator’s Glacio DMG by 20% for 14s — corrected from a wrong Crit-Rate assumption (verified exact — Skill.json 1002209).' },
            { id: 'cb-ww-zhezhi-outro-skill', name: 'Carve and Draw (Res.-Skill DMG amp)', source: 'Zhezhi', stat: 'dmgBonus', value: 25, appliesTo: ['skill'], description: 'Same Outro also amplifies Resonance Skill DMG by 25% for 14s (verified exact — Skill.json 1002209).' },
            { id: 'cb-ww-roccia', name: 'Applause, Please! (Havoc DMG amp)', source: 'Roccia', stat: 'elemDmg', value: 20, description: 'Outro Skill amplifies the incoming resonator’s Havoc DMG by 20% for 14s (verified exact — Skill.json 1002709).' },
            { id: 'cb-ww-roccia-outro-basic', name: 'Applause, Please! (Basic-Atk DMG amp)', source: 'Roccia', stat: 'dmgBonus', value: 25, appliesTo: ['basic'], description: 'Same Outro also amplifies Basic Attack DMG by 25% for 14s (verified exact — Skill.json 1002709).' },
            // Resonance Liberation "Commedia Improvviso!": for every 0.1% of
            // Roccia's Crit. Rate over 50%, all Resonators in the team gain 1
            // flat ATK, up to 200 — now modeled via `scaleOff`'s 'critRate'
            // sourceStat (added 2026-07-16, alongside atk/EM/ER/HP/DEF).
            { id: 'cb-ww-roccia-liberation', name: 'Commedia Improvviso! (flat ATK)', source: 'Roccia', stat: 'atk', value: 200, description: 'Resonance Liberation grants all Resonators in the team 1 flat ATK for every 0.1% of Roccia\'s own Crit. Rate over 50%, up to 200 (verified exact — Skill.json 1002705; scales with her real Crit Rate via scaleOff).', scaleOff: { sourceStat: 'critRate', basis: 'total', ratio: 10, cap: 200, offset: 50 } },
            { id: 'cb-ww-cantarella', name: 'Gentle Tentacles (Havoc DMG amp)', source: 'Cantarella', stat: 'elemDmg', value: 20, description: 'Outro Skill amplifies the incoming resonator’s Havoc DMG by 20% for 14s (verified exact — Skill.json 1003109).' },
            { id: 'cb-ww-cantarella-outro-skill', name: 'Gentle Tentacles (Res.-Skill DMG amp)', source: 'Cantarella', stat: 'dmgBonus', value: 25, appliesTo: ['skill'], description: 'Same Outro also amplifies Resonance Skill DMG by 25% for 14s (verified exact — Skill.json 1003109).' },
            { id: 'cb-ww-aalto', name: 'Dissolving Mist (Aero DMG amp)', source: 'Aalto', stat: 'elemDmg', value: 23, description: 'Outro Skill amplifies the incoming resonator’s Aero DMG by 23% for 14s (verified exact — Skill.json 1001009).' },
            { id: 'cb-ww-changli', name: 'Strategy of Duality (Fusion DMG amp)', source: 'Changli', stat: 'elemDmg', value: 20, description: 'Outro Skill amplifies the incoming resonator’s Fusion DMG by 20% for 10s — corrected from a wrong flat-ATK% assumption (verified exact — Skill.json 1002109).' },
            { id: 'cb-ww-changli-outro-ult', name: 'Strategy of Duality (Liberation DMG amp)', source: 'Changli', stat: 'dmgBonus', value: 25, appliesTo: ['ult'], description: 'Same Outro also amplifies Resonance Liberation DMG by 25% for 10s (verified exact — Skill.json 1002109).' },
            // ADDED 2026-07-16 — had no Outro entry at all despite the same
            // "team DMG amp" pattern as every other resonator on this list
            // (verified exact — Skill.json 1000809).
            { id: 'cb-ww-danjin-outro', name: 'Duality (Havoc DMG amp)', source: 'Danjin', stat: 'elemDmg', value: 23, description: 'Outro Skill amplifies the incoming resonator’s Havoc DMG by 23% for 14s (verified exact — Skill.json 1000809).' },
            // ADDED 2026-07-16 — universal (not element-scoped) DMG amp, per
            // the raw SkillDescribe text having no element word/icon; `elemDmg`
            // is this engine's generic "boost outgoing DMG" slot regardless
            // (verified exact — Skill.json 1000409).
            { id: 'cb-ww-baizhi-outro', name: 'Rejuvinating Flow (DMG amp)', source: 'Baizhi', stat: 'elemDmg', value: 15, description: 'Outro Skill heals the incoming resonator (1.54% of Baizhi’s max HP every 3s for 30s) and amplifies their DMG by 15% for 6s per heal tick (verified exact — Skill.json 1000409).' },
            // Rover (Spectro) previously had a "Spectro Frazzle (DMG amp)" entry here —
            // REMOVED 2026-07-10: checked all 9 of her skill types (1,2,3,4,4,5,6,11,12)
            // against the Dimbreath datamine and found no team-wide DMG buff anywhere in
            // her kit ("Frazzle" is a generic Spectro elemental-reaction name, not a
            // Rover-specific mechanic). The removed entry didn't correspond to any real
            // skill — leaving a fabricated buff in place is worse than having none.
            // ── Per-attack-type DMG amps (need the scoped-buff engine) ──
            { id: 'cb-ww-sanhua', name: 'Silversnow (Basic-Atk DMG)', source: 'Sanhua', stat: 'dmgBonus', value: 38, appliesTo: ['basic'], description: 'Outro Skill increases the incoming resonator’s Basic Attack DMG by 38% for 14s (confirmed exact 2026-07-16, replacing an earlier "~38%" approximation and the wrong Outro name “Eternal Frost” — that’s actually her Resonance Skill’s name).' },
            { id: 'cb-ww-mortefi', name: 'Passionate Variation (Heavy-Atk DMG)', source: 'Mortefi', stat: 'dmgBonus', value: 38, appliesTo: ['heavy'], description: 'Outro Skill increases the incoming resonator’s Heavy Attack DMG by 38% for 14s (confirmed exact 2026-07-16, replacing an earlier "~38%" approximation — Skill.json 1001209).' },
            { id: 'cb-ww-taoqi', name: 'Unflinching (Res.-Skill DMG)', source: 'Taoqi', stat: 'dmgBonus', value: 38, appliesTo: ['skill'], description: 'Outro Skill increases the incoming resonator’s Resonance Skill DMG by 38% for 14s (confirmed exact 2026-07-16, replacing an earlier "~38%" approximation — Skill.json 1000909).' },
            // ADDED 2026-07-16 — Iuno/Buling had zero entries anywhere in
            // this array before this pass (verified exact via encore.moe).
            { id: 'cb-ww-iuno-outro', name: 'From Gloom to Gleam (Heavy-Atk DMG amp)', source: 'Iuno', stat: 'dmgBonus', value: 50, appliesTo: ['heavy'], description: 'Outro Skill amplifies the incoming resonator’s Heavy Attack DMG by 50% for 14s; ends early if they switch off-field (verified exact — Skill.json 1003809).' },
            // Added 2026-07-17 — base-kit Forte resource "Blessing of the Wan
            // Light" (team-wide, not self) had no entry anywhere; the
            // Sequence 2 entry only covers its own ADDITIONAL +40% at exactly
            // 10 stacks, stacking on top of this. Modeled at max stacks (10)
            // per this file's "assume best-case" convention (wuthering.gg).
            { id: 'cb-ww-iuno-blessing', name: 'Blessing of the Wan Light (Team DMG Amp)', source: 'Iuno', stat: 'elemDmg', value: 40, description: 'Passive Forte resource grants the whole team 4% All DMG Amplification per stack, up to 10 stacks (+40%); modeled at max stacks (verified — wuthering.gg).' },
            { id: 'cb-ww-buling-outro', name: 'Exorcism Spell (DMG amp)', source: 'Buling', stat: 'elemDmg', value: 15, description: 'Outro Skill amplifies all nearby resonators’ DMG by 15% for 30s (verified exact — Skill.json 1004309).' },
            { id: 'cb-ww-lumi-outro', name: 'Escorting (Res.-Skill DMG amp)', source: 'Lumi', stat: 'dmgBonus', value: 38, appliesTo: ['skill'], description: 'Outro Skill amplifies the incoming resonator’s Resonance Skill DMG by 38% for 10s or until they’re switched out (verified exact — Skill.json 1002609).' },
            // Youhu's Outro ("Timeless Classics") is a confirmed real, large
            // buff (100% Coordinated-Attack DMG amp for 28s — Skill.json
            // 1002409) deliberately NOT added here: `appliesTo` has no
            // recognized "Coordinated Attack" category anywhere in the
            // damage engine (skills.ts tags those instances only by
            // type:'Ultimate'/'Skill' + a name substring), so the entry
            // would silently no-op rather than actually apply. Needs an
            // engine change (a real appliesTo tag + retagging the affected
            // skill instances) before this can be added correctly.
            { id: 'cb-ww-lupa', name: 'Nowhere to Run?! (Fusion DMG amp)', source: 'Lupa', stat: 'elemDmg', value: 20, description: 'Outro Skill amplifies the incoming resonator’s Fusion DMG by 20% for 14s (verified exact — Skill.json 1003609).' },
            { id: 'cb-ww-lupa-outro-basic', name: 'Nowhere to Run?! (Basic-Atk DMG amp)', source: 'Lupa', stat: 'dmgBonus', value: 25, appliesTo: ['basic'], description: 'Same Outro also amplifies Basic Attack DMG by 25% for 14s (verified exact — Skill.json 1003609).' },
            { id: 'cb-ww-phrolova', name: 'Suite of Quietus Outro (Havoc DMG amp)', source: 'Phrolova', stat: 'elemDmg', value: 20, description: 'Outro Skill amplifies the incoming resonator’s Havoc DMG by 20% for 14s (verified exact — Skill.json 1003709).' },
            { id: 'cb-ww-phrolova-outro-heavy', name: 'Suite of Quietus Outro (Heavy-Atk DMG amp)', source: 'Phrolova', stat: 'dmgBonus', value: 25, appliesTo: ['heavy'], description: 'Same Outro also amplifies Heavy Attack DMG by 25% for 14s (verified exact — Skill.json 1003709).' },
            // Conditional on the target carrying a Negative Status (e.g.
            // Erosion) — modeled unconditionally like every other Outro amp
            // here since Cartethyia's own kit self-applies Aero Erosion, so
            // it's realistically active whenever this Outro matters; same
            // "assume best-case, note the assumption" convention already
            // used for conditional 5pc set effects elsewhere in this file.
            { id: 'cb-ww-cartethyia', name: 'Outro Skill (Aero DMG amp vs. Negative-Status targets)', source: 'Cartethyia', stat: 'elemDmg', value: 17.5, requiresTargetStatus: ['frazzle', 'erosion', 'chafe', 'flare', 'bane', 'fusionburst'], description: 'Outro Skill amplifies Aero DMG dealt by the active resonator to targets with Negative Statuses by 17.5% for 20s — conditional on the target carrying one (Cartethyia’s own kit applies Aero Erosion, so typically active) (verified exact — Skill.json 1003509).' },
            { id: 'cb-ww-augusta', name: 'Outro Skill (All-Attribute DMG amp)', source: 'Augusta', stat: 'elemDmg', value: 15, description: 'Outro Skill grants the next resonator switched onto the field +15% DMG Amplification for ALL Attributes (not element-restricted) for 14s, ending immediately if they’re switched out (verified exact — Skill.json 1003909).' },
            { id: 'cb-ww-suisui-outro', name: 'Rippling Waters (All DMG amp)', source: 'Suisui', stat: 'elemDmg', value: 25, description: 'Outro Skill grants all resonators in the team 25% All DMG Amplification for 30s (verified exact — Skill.json 1005709).' },
            // Conditional — the amp only procs after the incoming resonator
            // inflicts a Negative Status (consuming the granted "Electro
            // Core"); modeled as a normal toggle like the rest of this array,
            // same "buffs are opt-in toggles" convention documented for the
            // Calculator/Rotation Builder.
            { id: 'cb-ww-rover-electro-outro', name: 'Rumbling Thunders (All DMG amp)', source: 'Rover (Electro)', stat: 'elemDmg', value: 25, description: 'Outro Skill grants the incoming resonator Electro Core for 20s; after they inflict a Negative Status, Electro Core is consumed and they gain 25% All DMG Amplification for 14s (verified exact — Skill.json 1005509).' },
            // ADDED 2026-07-16 — the press-cast variant of Forte Circuit
            // "Myriad Omens' Mandate" (distinct from the held-cast variant
            // already modeled as a self buff in character-passives.generated.ts)
            // grants a team-wide ATK buff that had no entry anywhere.
            { id: 'cb-ww-rover-electro-forte', name: 'Myriad Omens\' Mandate (ATK, press-cast)', source: 'Rover (Electro)', stat: 'atkPct', value: 10, description: 'If Resonance Skill Overshock is cast by pressing the button, clear all Electric Surge to grant all Resonators in the team 10% ATK Bonus for 20s (verified exact — Skill.json 1005507).' },
            { id: 'cb-ww-lynae-outro', name: "Let's Hit the Road! (DMG amp)", source: 'Lynae', stat: 'elemDmg', value: 15, description: 'Outro Skill grants the next incoming resonator 15% All DMG Amplification for 14s or until they switch out (verified exact — Skill.json 1004509).' },
            { id: 'cb-ww-lynae-outro-ult', name: "Let's Hit the Road! (Liberation DMG amp)", source: 'Lynae', stat: 'dmgBonus', value: 25, appliesTo: ['ult'], description: 'Same Outro also amplifies the incoming resonator’s Resonance Liberation DMG by 25% for 14s (verified exact — Skill.json 1004509).' },
            { id: 'cb-ww-mornye-outro', name: 'Recursion (DMG amp)', source: 'Mornye', stat: 'elemDmg', value: 25, description: 'Outro Skill grants ALL resonators in the team 25% All DMG Amplification for 30s, not just the incoming member (verified exact — Skill.json 1004409).' },
            // ADDED 2026-07-16 — Sigrika had ZERO entries anywhere despite a
            // real, sourced kit mechanic (Inherent Skill "True Names Aligned",
            // Blessing of Runes stacks). Both halves are now modeled: Aero
            // DMG via the normal element key, Echo Skill DMG via the new
            // 'echo' appliesTo scope (added 2026-07-16 — see optimizer.ts's
            // canonScope()). The Echo-Skill-DMG buff is correctly inert for
            // now since no skill in this engine is scoped 'echo' yet (Echo
            // Skill's own damage isn't modeled — depends on the equipped
            // Echo, out of scope for this pass) — not wrong, just shovel-
            // ready for whenever that gets modeled.
            { id: 'cb-ww-sigrika', name: 'True Names Aligned (Aero DMG amp)', source: 'Sigrika', stat: 'elemDmg', value: 18, description: 'When nearby Resonators in the team cast Echo Skill, Sigrika gains a stack of Blessing of Runes (up to 6). Each stack grants the active Resonator in the team 3% Aero DMG Bonus and 3% Echo Skill DMG Bonus, up to 18% each at max stacks (verified exact — Skill.json 1005105).' },
            { id: 'cb-ww-sigrika-echo', name: 'True Names Aligned (Echo Skill DMG amp)', source: 'Sigrika', stat: 'dmgBonus', value: 18, appliesTo: ['echo'], description: 'Same mechanic also grants 3% Echo Skill DMG Bonus per stack of Blessing of Runes, up to 18% at max stacks (verified exact — Skill.json 1005105).' },
            // Qiuyuan's Outro ("Strike Before Ready") grants a confirmed real
            // 50% Echo Skill DMG amp (Skill.json 1004109) — now modeled via
            // the 'echo' appliesTo scope (see note above).
            { id: 'cb-ww-qiuyuan-outro', name: 'Strike Before Ready (Echo Skill DMG amp)', source: 'Qiuyuan', stat: 'dmgBonus', value: 50, appliesTo: ['echo'], description: 'Outro Skill grants the incoming resonator 50% Echo Skill DMG Amplification for 14s (verified exact — Skill.json 1004109).' },
            // NOTE (2026-07-16): the Outro Skill "Strike Before Ready" also
            // deals its OWN damage instance (Qiuyuan's ATK, "considered as
            // Echo Skill DMG"), which has no entry in skills.ts at all yet —
            // NOT added because encore.moe's tooltip text says 100% of ATK
            // but the raw DamageList.RateLv field for the same skill says
            // 500%, a real, unresolved 5x discrepancy. Needs a second look
            // before picking a value; guessing wrong here matters a lot.
            { id: 'cb-ww-lucy-outro', name: 'Countermeasure Program (Basic-Atk DMG amp)', source: 'Lucy', stat: 'dmgBonus', value: 25, appliesTo: ['basic'], description: 'Outro Skill grants the incoming resonator 25% Basic Attack DMG Amplification for 14s or until they’re switched out (verified exact — Skill.json 1004909).' },
            { id: 'cb-ww-rebecca-outro', name: 'Preem Choom (All DMG amp)', source: 'Rebecca', stat: 'elemDmg', value: 15, description: 'Outro Skill grants the incoming resonator 15% All DMG Amplification for 14s (verified exact — Skill.json 1004809).' },
            // ADDED 2026-07-16 — Inherent Skill "Left an Opening!" had no
            // entry anywhere despite granting a real team-wide ATK buff.
            { id: 'cb-ww-rebecca-inherent', name: 'Left an Opening! (ATK)', source: 'Rebecca', stat: 'atkPct', value: 20, description: 'When Rebecca casts Resonance Liberation - Party \'til Dawn!, the ATK of all nearby Resonators in the team is increased by 20% for 30s (verified exact — Skill.json 1004805).' },
            { id: 'cb-ww-lucilla-outro', name: 'Montage (Glacio Chafe DMG amp)', source: 'Lucilla', stat: 'elemDmg', value: 60, description: 'Outro Skill, when Lucilla is in Resonance Mode - Glacio Chafe, amplifies Glacio Chafe DMG against nearby targets by 60% for 30s (verified exact — Skill.json 1000909).' },
            // Same Outro's Echo-mode sibling variant — now modeled via the
            // 'echo' appliesTo scope (see note near Sigrika/Qiuyuan above).
            { id: 'cb-ww-lucilla-outro-echo', name: 'Montage (Echo Skill DMG amp)', source: 'Lucilla', stat: 'dmgBonus', value: 50, appliesTo: ['echo'], description: 'Outro Skill, when Lucilla is in Resonance Mode - Echo, grants the incoming resonator 50% Echo Skill DMG Bonus for 14s (corrected 2026-07-16 from "nearby resonators in the team... 30s" — wuthering.gg + independent corroboration, value unchanged — Skill.json 1000909).' },
            // ADDED 2026-07-16 — Inherent Skill "Slow Motion" had no entry
            // anywhere. Echo-mode half (team Echo Skill DMG) added below.
            // FIXED 2026-07-17 — the Glacio-Chafe-mode half (-8% target
            // Glacio RES, 30s) now modeled via `resShred` (new engine
            // primitive): this schema's `EnemyEntry` only tracks one flat
            // `res` regardless of attacking element (no per-element enemy
            // RES anywhere), so a generic team-wide `resShred` is the same
            // level of approximation already used for every other stat here.
            { id: 'cb-ww-lucilla-inherent-echo', name: 'Slow Motion (Echo Skill DMG amp)', source: 'Lucilla', stat: 'dmgBonus', value: 25, appliesTo: ['echo'], description: 'In Resonance Mode - Echo, grants all nearby Resonators in the team 25% Echo Skill DMG Bonus for 30s (wuthering.gg, confirmed 2026-07-16).' },
            { id: 'cb-ww-lucilla-inherent-chafe', name: 'Slow Motion (Target Glacio RES -8%)', source: 'Lucilla', stat: 'resShred', value: 8, description: 'In Resonance Mode - Glacio Chafe, reduces the target’s Glacio RES by 8% for 30s (wuthering.gg, confirmed 2026-07-16).' },
            { id: 'cb-ww-brant-outro', name: 'The Course is Set! (Fusion DMG amp)', source: 'Brant', stat: 'elemDmg', value: 20, description: 'Outro Skill amplifies the incoming resonator’s Fusion DMG by 20% for 14s (verified exact — Skill.json 1002909).' },
            { id: 'cb-ww-brant-outro-skill', name: 'The Course is Set! (Res.-Skill DMG amp)', source: 'Brant', stat: 'dmgBonus', value: 25, appliesTo: ['skill'], description: 'Same Outro also amplifies Resonance Skill DMG by 25% for 14s (verified exact — Skill.json 1002909).' },
            { id: 'cb-ww-zani-outro', name: 'Beacon For the Future (Spectro DMG amp)', source: 'Zani', stat: 'elemDmg', value: 20, description: 'Outro Skill: after clearing all Heliacal Ember stacks from the marked target, other team members’ Spectro DMG to that target is amplified by 20% for 20s (verified exact — Skill.json 1003309).' },
            // Phoebe's Outro ("Confession Enhancement" variant) grants 100%
            // DMG amp scoped to "Spectro Frazzle" procs specifically — now
            // modeled via the 'frazzle' appliesTo scope added 2026-07-16 (see
            // optimizer.ts's canonScope()). The Outro's separate 10% Spectro
            // RES shred on enemies still isn't added — no RES-shred primitive
            // in this schema (same gap as Chevreuse/Faruzan's DEF-shred-style
            // effects, which are folded into elemDmg instead since RES shred
            // has no dedicated stat here).
            { id: 'cb-ww-phoebe-outro-frazzle', name: 'Confession Enhancement (Spectro Frazzle DMG amp)', source: 'Phoebe', stat: 'dmgBonus', value: 100, appliesTo: ['frazzle'], description: 'Outro Skill (Confession variant) amplifies Spectro Frazzle DMG dealt by nearby resonators by 100% for 15s (verified exact — Skill.json 1005609).' },
            // Ciaccona's Outro ("Windcalling Tune") similarly amplifies
            // "Aero Erosion" DMG by 100% — now modeled via the 'erosion'
            // appliesTo scope. Erosion is her own exclusive DoT mechanic (no
            // other roster character applies it), so this is arguably
            // self-only in practice despite the "team" wording — kept
            // unscoped-by-character (any teammate's Erosion ticks benefit)
            // since nothing else in the roster can trigger Erosion anyway.
            { id: 'cb-ww-ciaccona-outro-erosion', name: 'Windcalling Tune (Aero Erosion DMG amp)', source: 'Ciaccona', stat: 'dmgBonus', value: 100, appliesTo: ['erosion'], description: 'Outro Skill amplifies Aero Erosion DMG dealt by nearby resonators by 100% for 30s (duration corrected 2026-07-16 from 15s to 30s — wuthering.gg + game8.co, value unchanged — Skill.json 1002609).' },
            // Two-tier conditional (guaranteed baseline + an escalated value
            // for whoever procs a specific follow-up condition) — modeled at
            // the guaranteed baseline only, consistent with this file's
            // "don't fabricate the conditional escalation" convention.
            { id: 'cb-ww-aemeath-outro', name: 'Silent Protection (All-DMG amp)', source: 'Aemeath', stat: 'elemDmg', value: 10, description: 'Outro Skill grants all resonators in the team except Aemeath 10% All-DMG Amplification for 20s (escalates to 20% for whoever inflicts Tune Rupture/Fusion Burst - Shifting, not modeled here) (verified exact — Skill.json 1004609).' },
            { id: 'cb-ww-denia-outro', name: 'Unfinished Lies (All-DMG amp, Tune Strain mode)', source: 'Denia', stat: 'elemDmg', value: 15, description: 'Outro Skill, when Denia is in Resonance Mode - Tune Strain, amplifies the incoming resonator’s All DMG by 15% for 16s or until they switch out (escalates to 40% after they inflict Tune Strain - Shifting, not modeled here; her Fusion Burst-mode alternate, a 60% amp scoped to "Fusion Burst DMG," also isn’t modeled — no matching appliesTo bucket, same class of gap as Youhu’s Coordinated-Attack amp) (verified exact — Skill.json 1005309).' },
            // Conditional on the target carrying Glacio Chafe — modeled
            // unconditionally since Hiyuki's own Intro Skill self-applies it
            // on hit, so it's typically active (same convention as Cartethyia).
            { id: 'cb-ww-hiyuki-outro', name: 'Snowlight Blessing (Glacio DMG amp)', source: 'Hiyuki', stat: 'elemDmg', value: 20, requiresTargetStatus: ['chafe'], description: 'Outro Skill amplifies Glacio DMG dealt by nearby team members other than Hiyuki by 20% for 20s, against targets affected by Glacio Chafe (verified exact — Skill.json 1005209).' },
            { id: 'cb-ww-jianxin-outro', name: 'Transcendence (Liberation DMG amp)', source: 'Jianxin', stat: 'dmgBonus', value: 38, appliesTo: ['ult'], description: 'Outro Skill amplifies the incoming resonator’s Resonance Liberation DMG by 38% for 14s or until they switch out (verified exact — Skill.json 1001909).' },
        ],
    },
    passives: [
        { id: 'ww-p1', name: 'Inherent Skill I', description: 'Unlocks a permanent stat or effect at Ascension.' },
        { id: 'ww-p2', name: 'Inherent Skill II', description: 'A second inherent effect for the kit.' },
    ],
};

// WuWa has no Genshin-style elemental reaction system. Every character's
// precise skill list uses the short ids basic/skill/ult/forte — these are the
// universal action types (Heavy Attack = the "empowered basic attack", plus
// Outro/Intro) any authored character might be missing.
const BACKFILL_SKILL_IDS = [
    { id: 'basic', actionId: 'basicAttack' },
    { id: 'heavy', actionId: 'heavyAttack' },
    { id: 'outro', actionId: 'outroSkill' },
    { id: 'intro', actionId: 'introSkill' },
];

/**
 * The exact input `buildGameBundle` derives from — exported standalone (not
 * just inlined below) so `scripts/build-game-package.js` can require the
 * compiled version of this module and re-serialize it as an external
 * game-module package (see docs/GAME_MODULES.md), without reverse-engineering
 * these pieces from anywhere else. Every field here is plain data.
 */
export const wutheringWavesModuleInput = {
    def: wutheringWaves,
    charDB: CHARACTERS.map(accurateChar),
    weaponDB: WEAPONS,
    defaultElement: 'Spectro',
    defaultWeapon: 'Sword',
    hasElementalMastery: false,
    supportsReactions: false,
    backfillSkillIds: BACKFILL_SKILL_IDS,
    setPieces: 5,
    partyTeammates: 2,
    starterCharacterId: STARTER_CHARACTER['wuthering-waves'],
    sequenceLabel: 'Sequence',
    sequenceMax: 6,
    supplements,
};

export const wutheringWavesBundle: GameBundle = buildGameBundle(wutheringWavesModuleInput);

export default wutheringWavesBundle;
