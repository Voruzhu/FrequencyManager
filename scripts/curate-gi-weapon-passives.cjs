/**
 * curate-gi-weapon-passives.cjs
 *
 * Hand-curated conditional weapon self-buffs for Genshin's meta 5★ weapons,
 * to 100% R1 accuracy (verified against genshin-db effect templates).
 *
 * WHY: the fuzzy passive parser (import-gi-weapons-full.cjs) blindly grabbed the
 * 2nd value from genshin-db's effect `values` array, which is frequently NOT a
 * flat stat buff — it's a proc DMG% (Skyward Atlas/Harp), an EM/HP/DEF→ATK
 * conversion (Homa, Scarlet Sands, Redhorn, Jade Cutter), a Lunar/Bond-of-Life
 * reaction our engine can't model, or an attack-type-scoped DMG bonus. Showing a
 * wrong toggle (+160% ATK) is worse than showing none.
 *
 * This script REPLACES every weapon's *conditional* selfBuffs (conditional !== false)
 * with the curated META entries below (or removes them if the weapon isn't in META,
 * i.e. its conditional effect isn't cleanly modelable). It NEVER touches the
 * *unconditional* selfBuffs (conditional: false) — those come from the game's exact
 * addProps and stay as-is. Values are R1, max-stacks ("modeled as if active").
 * `appliesTo` scopes a DMG% bonus to specific attack types (engine handles it).
 *
 * Not modeled (kept as passive text only, no toggle): conversions (X% of EM/HP/DEF
 * as ATK/DMG), one-time procs, Lunar / Bond-of-Life reaction mechanics, crit-DMG
 * scoped to one attack type (engine can't scope crit), pure team/energy/atkspd buffs.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const WEAPONS_TS = path.join(__dirname, '..', 'adapters', 'game-definitions', 'genshin-impact', 'weapons.ts');

// stat 'elemDmg' = generic DMG% bonus term. When appliesTo is present the buff is
// scoped to those attack types only. Tokens: normal, charged, skill, burst, plunge.
// opts: { appliesTo, uncond: true (static, no trigger — rare in META; most conditional
// effects the fuzzy parser couldn't handle live here), scaleOff: {...} for a buff whose
// real magnitude scales with the wielder's own stat (see BuffEntry.scaleOff).
const b = (stat, label, value, opts) => {
    const o = Array.isArray(opts) ? { appliesTo: opts } : (opts || {});
    const out = { stat, label, value };
    if (o.appliesTo) out.appliesTo = o.appliesTo;
    if (o.uncond) out.conditional = false;
    if (o.scaleOff) out.scaleOff = o.scaleOff;
    return out;
};

/** weaponId -> curated conditional self-buffs (R1, max stacks). */
const META = {
    'a-thousand-blazing-suns': [b('critDmg', 'CRIT DMG (R1)', 20), b('atkPct', 'ATK% (R1)', 28)],
    'a-thousand-floating-dreams': [b('elementalMastery', 'EM · 3 same-elem allies (R1)', 96)],
    'absolution': [b('elemDmg', 'DMG · Bond of Life (R1)', 48)],
    'amos-bow': [b('elemDmg', 'Normal/Charged DMG · 5 stacks (R1)', 40, ['normal', 'charged'])],
    'aqua-simulacra': [b('elemDmg', 'DMG · enemies nearby (R1)', 20)],
    'astral-vultures-crimson-plumage': [b('atkPct', 'ATK% · post-Swirl (R1)', 24), b('elemDmg', 'Charged DMG (R1)', 48, ['charged']), b('elemDmg', 'Burst DMG (R1)', 24, ['burst'])],
    'athame-artis': [b('atkPct', 'ATK% · Blade of Daylight (R1)', 20)],
    'azurelight': [b('atkPct', 'ATK% · 0 Energy (R1)', 48), b('critDmg', 'CRIT DMG · 0 Energy (R1)', 40)],
    'beacon-of-the-reed-sea': [b('atkPct', 'ATK% (R1)', 20)],
    'calamity-queller': [b('atkPct', 'ATK% · 6 stacks (R1)', 19.2)],
    'cashflow-supervision': [b('elemDmg', 'Normal DMG · 3 stacks (R1)', 48, ['normal']), b('elemDmg', 'Charged DMG · 3 stacks (R1)', 42, ['charged'])],
    'crimson-moons-semblance': [b('elemDmg', 'DMG · Bond of Life (R1)', 36)],
    'disaster-and-remorse': [b('elemDmg', 'Normal/Charged DMG (R1)', 40, ['normal', 'charged']), b('elemDmg', 'Skill/Burst DMG (R1)', 40, ['skill', 'burst'])],
    // elegy-for-the-end's Farewell Song is a PARTY-WIDE effect, already modeled via
    // the weapon's `buffs` (team) field — deliberately NOT duplicated here as a
    // selfBuff (would double-count if both the team-buff toggle and this were on).
    'engulfing-lightning': [b('energyRegen', 'Energy Recharge · post-Burst (R1)', 30)],
    'fang-of-the-mountain-king': [b('elemDmg', 'Skill/Burst DMG · 6 stacks (R1)', 60, ['skill', 'burst'])],
    // fractured-halo also has an "all nearby party members deal 40% more Lunar-Charged
    // DMG" team effect — not modeled: DMG scoped to a REACTION type (Lunar-Charged),
    // not an attack type; the engine's `appliesTo` only scopes by attack type.
    'fractured-halo': [b('atkPct', 'ATK% (R1)', 24)],
    // freedom-sworn's Song of Resistance ("all nearby party members will obtain...")
    // is PARTY-WIDE, not self — modeled only in weapons.ts's hand-authored `buffs`
    // (team) field, deliberately NOT duplicated here (would double-count).
    'gest-of-the-mighty-wolf': [b('elemDmg', 'DMG · 4 stacks (R1)', 30)],
    // golden-frostbound-oath also has a "nearby party members gain Geo/Lunar-Crystallize
    // DMG +20%" team effect — not modeled: conditional on "Moondrifts near the equipping
    // character" (a field-state precondition our engine has no concept of).
    'golden-frostbound-oath': [b('elemDmg', 'Geo DMG (R1)', 40)],
    'haran-geppaku-futsu': [b('elemDmg', 'Normal DMG · 2 stacks (R1)', 40, ['normal'])],
    'jadefalls-splendor': [b('elemDmg', 'DMG · max HP (R1)', 12)],
    'kaguras-verity': [b('elemDmg', 'Skill DMG · 3 stacks (R1)', 36, ['skill']), b('elemDmg', 'All-Elem DMG · 3 stacks (R1)', 12)],
    'lost-prayer-to-the-sacred-winds': [b('elemDmg', 'Elemental DMG · 4 stacks (R1)', 32)],
    'lumidouce-elegy': [b('elemDmg', 'DMG · Burning (R1)', 36)],
    'memory-of-dust': [b('atkPct', 'ATK% · shielded, 5 stacks (R1)', 40)],
    'mistsplitter-reforged': [b('elemDmg', 'Elemental DMG · 3 stacks (R1)', 28)],
    // peak-patrol-song also has a "nearby party members gain All-Elem DMG Bonus scaled
    // by the wielder's DEF (up to 25.6%)" team effect — not modeled: needs a stat-scaled
    // TEAM buff (source's own stat feeding a party-wide bonus), which the engine doesn't
    // support yet (only self stat-conversions exist — see [[data-fill-milestone]]).
    'peak-patrol-song': [b('defPct', 'DEF% · 2 stacks (R1)', 16), b('elemDmg', 'Elemental DMG · 2 stacks (R1)', 20)],
    'polar-star': [b('atkPct', 'ATK% · 4 stacks (R1)', 48)],
    'primordial-jade-winged-spear': [b('atkPct', 'ATK% · 7 stacks (R1)', 22.4), b('elemDmg', 'DMG · max stacks (R1)', 12)],
    'reliquary-of-truth': [b('elementalMastery', 'EM · Secret of Lies (R1)', 80)],
    'silvershower-heartstrings': [b('hpPct', 'HP% · 3 stacks (R1)', 40)],
    // song-of-broken-pines's Banner-Hymn ("all nearby party members will obtain...")
    // is PARTY-WIDE — same treatment as freedom-sworn above, modeled only via `buffs`.
    'splendor-of-tranquil-waters': [b('elemDmg', 'Skill DMG · 3 stacks (R1)', 24, ['skill']), b('hpPct', 'HP% · 2 stacks (R1)', 28)],
    'starcallers-watch': [b('elemDmg', 'DMG · Mirror of Night (R1)', 28)],
    'summit-shaper': [b('atkPct', 'ATK% · shielded, 5 stacks (R1)', 40)],
    'sunny-morning-sleep-in': [b('elementalMastery', 'EM · post-Swirl (R1)', 120)],
    'surfs-up': [b('elemDmg', 'Normal DMG · 4 stacks (R1)', 48, ['normal'])],
    'symphonist-of-scents': [b('atkPct', 'ATK% · Sweet Echoes (R1)', 32)],
    'the-daybreak-chronicles': [b('elemDmg', 'Normal/Skill/Burst DMG · max (R1)', 60, ['normal', 'skill', 'burst'])],
    'the-first-great-magic': [b('atkPct', 'ATK% · 3 Gimmick stacks (R1)', 48)],
    'the-unforged': [b('atkPct', 'ATK% · shielded, 5 stacks (R1)', 40)],
    'thundering-pulse': [b('elemDmg', 'Normal DMG · 3 stacks (R1)', 40, ['normal'])],
    'tome-of-the-eternal-flow': [b('elemDmg', 'Charged DMG · 3 stacks (R1)', 42, ['charged'])],
    'tulaytullahs-remembrance': [b('elemDmg', 'Normal DMG · max (R1)', 48, ['normal'])],
    'uraku-misugiri': [b('elemDmg', 'Normal DMG · post-Geo (R1)', 32, ['normal']), b('elemDmg', 'Skill DMG · post-Geo (R1)', 48, ['skill'])],
    'verdict': [b('elemDmg', 'Skill DMG · 2 Seals (R1)', 36, ['skill'])],
    'vortex-vanquisher': [b('atkPct', 'ATK% · shielded, 5 stacks (R1)', 40)],

    // ── 4★ weapons (2026-07-10 accuracy pass) — same discipline: every entry read
    // against its full genshin-db effect template by hand; rejected categories match
    // the 5★ pass (proc damage, reaction-type scoping, off-field-specific mechanics —
    // don't fit our on-field damage-calc assumption, random/unpredictable effects,
    // self-debuff tradeoffs) plus a couple new ones seen only in 4★ kits: platform-
    // exclusive text (Predator/Sword of Descension, PS-only), and "Bond of Life
    // cleared" payoffs (same excluded mechanic as 5★ Absolution/Crimson Moon's).
    'akuoumaru': [b('elemDmg', 'Burst DMG · full party Energy (R1)', 40, ['ult'])],
    'mouuns-moon': [b('elemDmg', 'Burst DMG · full party Energy (R1)', 40, ['ult'])],
    'wavebreakers-fin': [b('elemDmg', 'Burst DMG · full party Energy (R1)', 40, ['ult'])],
    'ballad-of-the-boundless-blue': [b('elemDmg', 'Normal DMG · 3 stacks (R1)', 24, ['normal']), b('elemDmg', 'Charged DMG · 3 stacks (R1)', 18, ['charged'])],
    'ballad-of-the-fjords': [b('elementalMastery', 'EM · 3+ elemental types (R1)', 120)],
    'blackcliff-agate': [b('atkPct', 'ATK% · 3 stacks (R1)', 36)],
    'blackcliff-longsword': [b('atkPct', 'ATK% · 3 stacks (R1)', 36)],
    'blackcliff-pole': [b('atkPct', 'ATK% · 3 stacks (R1)', 36)],
    'blackcliff-slasher': [b('atkPct', 'ATK% · 3 stacks (R1)', 36)],
    'blackcliff-warbow': [b('atkPct', 'ATK% · 3 stacks (R1)', 36)],
    // Calamity of Eshu also grants scoped CRIT Rate+8% (Normal/Charged) — not modeled,
    // the engine can't scope CRIT stats to specific attack types (only elemDmg-family).
    'calamity-of-eshu': [b('elemDmg', 'Normal/Charged DMG · shielded (R1)', 20, ['normal', 'charged'])],
    'cloudforged': [b('elementalMastery', 'EM · 2 stacks (R1)', 80)],
    // Compound Bow also grants Normal ATK SPD+1.2%/stack — ATK SPD isn't a modeled stat.
    'compound-bow': [b('atkPct', 'ATK% · 4 stacks (R1)', 16)],
    'dawning-frost': [b('elementalMastery', 'EM · post-Charged (R1)', 72), b('elementalMastery', 'EM · post-Skill (R1)', 48)],
    'deathmatch': [b('atkPct', 'ATK% · single target (R1)', 24)],
    'dodoco-tales': [b('elemDmg', 'Charged DMG · post-Normal (R1)', 16, ['charged']), b('atkPct', 'ATK% · post-Charged (R1)', 8)],
    'dragons-bane': [b('elemDmg', 'DMG · vs Hydro/Pyro-affected (R1)', 20)],
    'earth-shaker': [b('elemDmg', 'Skill DMG · post-party-Pyro-reaction (R1)', 16, ['skill'])],
    'etherlight-spindlelute': [b('elementalMastery', 'EM · post-Skill (R1)', 100)],
    'fading-twilight': [b('elemDmg', 'DMG · Dawnblaze state (R1)', 14)],
    'festering-desire': [b('elemDmg', 'Skill DMG (R1)', 16, { appliesTo: ['skill'], uncond: true })],
    'finale-of-the-deep': [b('atkPct', 'ATK% · post-Skill (R1)', 12)],
    'flame-forged-insight': [b('elementalMastery', 'EM · post-reaction (R1)', 60)],
    'fleuve-cendre-ferryman': [b('energyRegen', 'Energy Recharge · post-Skill (R1)', 16)],
    'flower-wreathed-feathers': [b('elemDmg', 'Charged DMG · 6 stacks, aiming (R1)', 36, ['charged'])],
    // Flowing Purity also has a "Bond of Life cleared" scaling payoff — not modeled.
    'flowing-purity': [b('elemDmg', 'All-Elem DMG · post-Skill (R1)', 8)],
    'flute-of-ezpitzal': [b('defPct', 'DEF% · post-Skill (R1)', 16)],
    'footprint-of-the-rainbow': [b('defPct', 'DEF% · post-Skill (R1)', 16)],
    'forest-regalia': [b('elementalMastery', 'EM · Leaf of Consciousness (R1)', 60)],
    'sapwood-blade': [b('elementalMastery', 'EM · Leaf of Consciousness (R1)', 60)],
    // Fruitful Hook also grants scoped Plunge CRIT Rate+16% — not modeled (crit can't scope).
    'fruitful-hook': [b('elemDmg', 'Normal/Charged/Plunge DMG · post-Plunge (R1)', 16, ['normal', 'charged', 'plunge'])],
    'hamayumi': [b('elemDmg', 'Normal DMG · 100% Energy (R1)', 32, ['normal']), b('elemDmg', 'Charged DMG · 100% Energy (R1)', 24, ['charged'])],
    'ibis-piercer': [b('elementalMastery', 'EM · 2 stacks, post-Charged (R1)', 80)],
    'iron-sting': [b('elemDmg', 'DMG · 2 stacks, post-Elemental-DMG (R1)', 12)],
    // Kagotsurube Isshin also procs 180% ATK AoE DMG on hit — not modeled (proc damage).
    'kagotsurube-isshin': [b('atkPct', 'ATK% · post-hit proc (R1)', 15)],
    'katsuragikiri-nagamasa': [b('elemDmg', 'Skill DMG (R1)', 6, { appliesTo: ['skill'], uncond: true })],
    'kitain-cross-spear': [b('elemDmg', 'Skill DMG (R1)', 6, { appliesTo: ['skill'], uncond: true })],
    'lions-roar': [b('elemDmg', 'DMG · vs Pyro/Electro-affected (R1)', 20)],
    'rainslasher': [b('elemDmg', 'DMG · vs Hydro/Electro-affected (R1)', 20)],
    'lithic-blade': [b('atkPct', 'ATK% · 4 Liyue members (R1)', 28), b('critRate', 'Crit Rate · 4 Liyue members (R1)', 12)],
    'lithic-spear': [b('atkPct', 'ATK% · 4 Liyue members (R1)', 28), b('critRate', 'Crit Rate · 4 Liyue members (R1)', 12)],
    // Luxurious Sea-Lord also procs 100% ATK AoE DMG on Burst hit — not modeled (proc damage).
    'luxurious-sea-lord': [b('elemDmg', 'Burst DMG (R1)', 12, { appliesTo: ['ult'], uncond: true })],
    'mailed-flower': [b('atkPct', 'ATK% · post-Skill/reaction (R1)', 12), b('elementalMastery', 'EM · post-Skill/reaction (R1)', 48)],
    // Makhaira Aquamarine / Wandering Evenstar: self ATK = 24% of the wielder's own
    // (total) EM, plus a matching TEAM buff at 30% of that (0.24*0.3=0.072) — added to
    // `buffs` directly in weapons.ts (META only carries selfBuffs). Genuinely
    // build-dependent — the flat `value` here is only a display fallback.
    'makhaira-aquamarine': [b('atk', 'ATK · 24% of own EM (R1)', 72, { scaleOff: { sourceStat: 'elementalMastery', basis: 'total', ratio: 0.24 } })],
    'wandering-evenstar': [b('atk', 'ATK · 24% of own EM (R1)', 72, { scaleOff: { sourceStat: 'elementalMastery', basis: 'total', ratio: 0.24 } })],
    'mappa-mare': [b('elemDmg', 'DMG · 2 stacks, post-reaction (R1)', 16)],
    'master-key': [b('elementalMastery', 'EM · post-reaction (R1)', 60)],
    'snare-hook': [b('elementalMastery', 'EM · post-reaction (R1)', 60)],
    'serenitys-call': [b('hpPct', 'HP% · post-reaction (R1)', 16)],
    'missive-windspear': [b('atkPct', 'ATK% · post-reaction (R1)', 12), b('elementalMastery', 'EM · post-reaction (R1)', 48)],
    'mitternachts-waltz': [b('elemDmg', 'Skill DMG · post-Normal (R1)', 20, ['skill']), b('elemDmg', 'Normal DMG · post-Skill (R1)', 20, ['normal'])],
    'solar-pearl': [b('elemDmg', 'Skill/Burst DMG · post-Normal (R1)', 20, ['skill', 'ult']), b('elemDmg', 'Normal DMG · post-Skill/Burst (R1)', 20, ['normal'])],
    'moonpiercer': [b('atkPct', 'ATK% · Leaf of Revival (R1)', 16)],
    'moonweavers-dawn': [
        b('elemDmg', 'Burst DMG (R1)', 20, { appliesTo: ['ult'], uncond: true }),
        b('elemDmg', 'Burst DMG · Energy Cost ≤40 (R1)', 28, ['ult']),
    ],
    'mountain-bracing-bolt': [
        b('elemDmg', 'Skill DMG (R1)', 12, { appliesTo: ['skill'], uncond: true }),
        b('elemDmg', 'Skill DMG · post-ally-Skill (R1)', 12, ['skill']),
    ],
    'oathsworn-eye': [b('energyRegen', 'Energy Recharge · post-Skill (R1)', 24)],
    'portable-power-saw': [b('elementalMastery', 'EM · 3 Symbols (R1)', 120)],
    'the-dockhands-assistant': [b('elementalMastery', 'EM · 3 Symbols (R1)', 120)],
    'prospectors-drill': [b('atkPct', 'ATK% · 3 Symbols (R1)', 9), b('elemDmg', 'All-Elem DMG · 3 Symbols (R1)', 21)],
    'range-gauge': [b('atkPct', 'ATK% · 3 Symbols (R1)', 9), b('elemDmg', 'All-Elem DMG · 3 Symbols (R1)', 21)],
    'prototype-crescent': [b('atkPct', 'ATK% · post-Charged weak-point hit (R1)', 36)],
    'prototype-rancour': [b('atkPct', 'ATK% · 4 stacks (R1)', 16), b('defPct', 'DEF% · 4 stacks (R1)', 16)],
    'prototype-starglitter': [b('elemDmg', 'Normal/Charged DMG · 2 stacks, post-Skill (R1)', 16, ['normal', 'charged'])],
    // Ring of Yaxche: self Normal-Atk DMG scales with the wielder's own (total) Max
    // HP (0.6% per 1,000 HP), capped 16% — a genuine scaleOff+cap case.
    'ring-of-yaxche': [b('elemDmg', 'Normal DMG · own HP, capped (R1)', 16, { appliesTo: ['normal'], scaleOff: { sourceStat: 'hp', basis: 'total', ratio: 0.0006, cap: 16 } })],
    'royal-bow': [b('critRate', 'Crit Rate · 5 stacks, resets on CRIT (R1)', 40)],
    'royal-greatsword': [b('critRate', 'Crit Rate · 5 stacks, resets on CRIT (R1)', 40)],
    'royal-grimoire': [b('critRate', 'Crit Rate · 5 stacks, resets on CRIT (R1)', 40)],
    'royal-longsword': [b('critRate', 'Crit Rate · 5 stacks, resets on CRIT (R1)', 40)],
    'royal-spear': [b('critRate', 'Crit Rate · 5 stacks, resets on CRIT (R1)', 40)],
    // Rust also decreases Charged Attack DMG by 10% (a Normal-only weapon in practice) — not modeled.
    'rust': [b('elemDmg', 'Normal DMG (R1)', 40, { appliesTo: ['normal'], uncond: true })],
    'sacrificers-staff': [b('atkPct', 'ATK% · 3 stacks, post-Skill (R1)', 24), b('energyRegen', 'Energy Recharge · 3 stacks, post-Skill (R1)', 18)],
    // Scion of the Blazing Sun also procs a 60% ATK Sunfire Arrow hit — not modeled (proc damage).
    'scion-of-the-blazing-sun': [b('elemDmg', 'Charged DMG · Heartsearer target (R1)', 28, ['charged'])],
    'song-of-stillness': [b('elemDmg', 'DMG · post-healed (R1)', 16)],
    'talking-stick': [b('atkPct', 'ATK% · post-Pyro-affected (R1)', 16), b('elemDmg', 'All-Elem DMG · post-Hydro/Cryo/Electro/Dendro-affected (R1)', 12)],
    'tamayuratei-no-ohanashi': [b('atkPct', 'ATK% · post-Skill (R1)', 20)],
    'the-alley-flash': [b('elemDmg', 'DMG · undamaged (R1)', 12)],
    'the-bell': [b('elemDmg', 'DMG · shielded (R1)', 12)],
    'the-black-sword': [b('elemDmg', 'Normal/Charged DMG (R1)', 20, { appliesTo: ['normal', 'charged'], uncond: true })],
    'the-catch': [b('elemDmg', 'Burst DMG (R1)', 16, { appliesTo: ['ult'], uncond: true })],
    'the-stringless': [b('elemDmg', 'Skill/Burst DMG (R1)', 24, { appliesTo: ['skill', 'ult'], uncond: true })],
    'tidal-shadow': [b('atkPct', 'ATK% · post-healed (R1)', 24)],
    'toukabou-shigure': [b('elemDmg', 'DMG · Cursed Parasol target (R1)', 16)],
    // Base ATK+12% is already captured by the static-recovery pass (its template's
    // leading clause matches parseStatic's ATK-increased regex) — only the conditional
    // village-favor bonus needs a META entry, or the static gets double-counted.
    'ultimate-overlords-mega-magic-sword': [b('atkPct', 'ATK% · Merusea Village favor maxed (R1)', 12)],
    'waveriding-whirl': [b('hpPct', 'HP% · post-Skill (R1)', 20)],
    'whiteblind': [b('atkPct', 'ATK% · 4 stacks (R1)', 24), b('defPct', 'DEF% · 4 stacks (R1)', 24)],
    'windblume-ode': [b('atkPct', 'ATK% · post-Skill (R1)', 16)],
    // Wolf-Fang also grants scoped Skill/Burst CRIT Rate+2%/stack — not modeled (crit can't scope).
    'wolf-fang': [b('elemDmg', 'Skill/Burst DMG (R1)', 16, { appliesTo: ['skill', 'ult'], uncond: true })],
    // Xiphos' Moonlight: self Energy Recharge scales with the wielder's own (total) EM
    // (0.036% per point), plus a matching TEAM buff at 30% of that — team half added
    // directly in weapons.ts (see makhaira-aquamarine note above).
    'xiphos-moonlight': [b('energyRegen', 'Energy Recharge · 0.036% per own EM (R1)', 11, { scaleOff: { sourceStat: 'elementalMastery', basis: 'total', ratio: 0.00036 } })],
    // 2 more 4★ misses caught on a re-check, plus 15 sub-4★ weapons (2026-07-10) —
    // most 2★/1★ weapons genuinely have NO passive in-game (confirmed via cached
    // templates: 10/10 checked had none) and are correctly left uncurated below.
    'kings-squire': [b('elementalMastery', 'EM · Teachings of the Forest (R1)', 60)],
    // Serpent Spine's "+3% DMG taken" half is a defensive drawback, not an offensive
    // stat our DPS calc tracks — orthogonal to the DMG-dealt bonus, so only the
    // beneficial half is modeled (unlike Fruit of Fulfillment/Prized Isshin Blade,
    // which trade off OFFENSIVE stats and were rejected for that reason).
    'serpent-spine': [b('elemDmg', 'DMG · 5 stacks, on-field ~20s (R1)', 30)],
    'bloodtainted-greatsword': [b('elemDmg', 'DMG · vs Pyro/Electro-affected (R1)', 12)],
    'cool-steel': [b('elemDmg', 'DMG · vs Hydro/Cryo-affected (R1)', 12)],
    'magic-guide': [b('elemDmg', 'DMG · vs Hydro/Electro-affected (R1)', 12)],
    'raven-bow': [b('elemDmg', 'DMG · vs Hydro/Pyro-affected (R1)', 12)],
    'dark-iron-sword': [b('atkPct', 'ATK% · post-reaction (R1)', 20)],
    'emerald-orb': [b('atkPct', 'ATK% · post-reaction (R1)', 20)],
    'ferrous-shadow': [b('elemDmg', 'Charged DMG · HP < 70% (R1)', 30, ['charged'])],
    'harbinger-of-dawn': [b('critRate', 'Crit Rate · HP > 90% (R1)', 14)],
    'skyrider-greatsword': [b('atkPct', 'ATK% · 4 stacks (R1)', 24)],
    'skyrider-sword': [b('atkPct', 'ATK% · post-Burst (R1)', 12)],
    'slingshot': [b('elemDmg', 'DMG · close-range hit (R1)', 36)],
    'twin-nephrite': [b('atkPct', 'ATK% · post-kill (R1)', 12)],
    'white-tassel': [b('elemDmg', 'Normal DMG (R1)', 24, { appliesTo: ['normal'], uncond: true })],
    // Genuine flat-additive-DMG mechanics (2026-07-10) — "Skill/Normal DMG is increased
    // BY X% of [stat]" adds a flat amount to that attack's own damage (boosted by
    // crit/reaction/reduced by enemy mitigation same as the base hit), NOT a %-multiplier
    // on top of it. Uses the `flatDmgAdd` stat + `scaleOff`, resolved against the
    // WIELDER's own (total) stat via `resolveSelfScaleOff` in CalculatorScreen.tsx.
    'cinnabar-spindle': [b('flatDmgAdd', 'Skill DMG · flat add, 40% of own DEF (R1)', 600, { appliesTo: ['skill'], scaleOff: { sourceStat: 'def', basis: 'total', ratio: 0.4 } })],
    'sturdy-bone': [b('flatDmgAdd', 'Normal DMG · flat add, 16% of own ATK, post-Sprint (R1)', 190, { appliesTo: ['normal'], scaleOff: { sourceStat: 'atk', basis: 'total', ratio: 0.16 } })],
};

// ── Unconditional static recovery ──────────────────────────────────────────
// addProps (the exact source) only covers ~25 weapons; it misses "all-elemental
// DMG bonus" statics and weapons newer than the datamine snapshot. For any weapon
// WITHOUT an addProps unconditional, parse the leading static clause from the
// genshin-db effect template — this first clause is deterministic and reliable
// (unlike the conditional 2nd clauses the fuzzy parser choked on). Conversions
// ("X% of EM/HP/DEF as ATK") and scoped statics are deliberately NOT matched.
const TEMPLATES = (() => {
    try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'gi-all-weapon-templates.json'), 'utf8')); } catch { /* ignore */ }
    const p = path.join(process.env.LOCALAPPDATA || '', 'Temp', 'claude', 'c--Users-User-NVME-Personal-App', '38069055-b1e5-49b6-9398-fd7d494198b3', 'scratchpad', 'gi-all-weapon-templates.json');
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return {}; }
})();

/** Parse the leading static stat from an effect template. Returns {stat,label,value} or null. */
function parseStatic(tmpl) {
    if (!tmpl) return null;
    const t = tmpl.trim();
    let m;
    // All-elemental / generic DMG bonus (addProps can't express these as one prop).
    if ((m = t.match(/^(?:Gain(?:s)?|Obtain(?:s)?|Increases?)\s+(?:a\s+)?(\d+(?:\.\d+)?)%\s+(?:All\s+)?Elemental\s+DMG\s+Bonus/i)))
        return { stat: 'elemDmg', label: 'Elemental DMG (R1)', value: +m[1] };
    if ((m = t.match(/^Increases?\s+(?:all\s+)?DMG\s+by\s+(\d+(?:\.\d+)?)%/i)))
        return { stat: 'elemDmg', label: 'DMG Bonus (R1)', value: +m[1] };
    if ((m = t.match(/^Increases?\s+Elemental\s+DMG\s+Bonus\s+by\s+(\d+(?:\.\d+)?)%/i)))
        return { stat: 'elemDmg', label: 'Elemental DMG (R1)', value: +m[1] };
    // Flat stat statics. Negative lookahead `(?!\s+of)` rejects conversions ("28% of ER").
    if ((m = t.match(/^(?:Increases?\s+)?ATK\s+(?:is\s+)?increased\s+by\s+(\d+(?:\.\d+)?)%(?!\s+of)/i)))
        return { stat: 'atkPct', label: 'ATK% (R1)', value: +m[1] };
    if ((m = t.match(/^(?:Increases?\s+)?HP\s+(?:is\s+)?increased\s+by\s+(\d+(?:\.\d+)?)%(?!\s+of)/i)))
        return { stat: 'hpPct', label: 'HP% (R1)', value: +m[1] };
    if ((m = t.match(/^(?:Increases?\s+)?DEF\s+(?:is\s+)?increased\s+by\s+(\d+(?:\.\d+)?)%(?!\s+of)/i)))
        return { stat: 'defPct', label: 'DEF% (R1)', value: +m[1] };
    if ((m = t.match(/^Increases?\s+CRIT\s+DMG\s+by\s+(\d+(?:\.\d+)?)%/i)))
        return { stat: 'critDmg', label: 'Crit DMG (R1)', value: +m[1] };
    if ((m = t.match(/^CRIT\s+Rate\s+(?:is\s+)?increased\s+by\s+(\d+(?:\.\d+)?)%/i)))
        return { stat: 'critRate', label: 'Crit Rate (R1)', value: +m[1] };
    if ((m = t.match(/^Increases?\s+Elemental\s+Mastery\s+by\s+(\d+(?:\.\d+)?)\b/i)))
        return { stat: 'elementalMastery', label: 'EM (R1)', value: +m[1] };
    return null;
}

let src = fs.readFileSync(WEAPONS_TS, 'utf8');
// Every weapon line (regardless of whether it already has a selfBuffs key) — a weapon
// added or re-generated after the last curation run can lack the key entirely, and a
// regex that only matched an EXISTING `selfBuffs: [...]` would silently skip it forever
// even with a META entry written for it (bug found + fixed 2026-07-10: sunny-morning-
// sleep-in had a META entry that never applied because its line had no selfBuffs key).
// Lazy `[^\n]*?` bounded by the `, icon:` that always follows — correctly spans arrays
// containing nested `appliesTo` arrays (a plain `[^\]]*` would stop early).
const lineRe = /\{ id: "([^"]+)"[^\n]*?, icon:/g;
let changed = 0, curated = 0, cleared = 0, untouched = 0, recovered = 0, keyAdded = 0;
src = src.replace(lineRe, (full, id) => {
    // NOTE: a weapon can legitimately have BOTH a self effect (selfBuffs) and a
    // party-wide effect (buffs, deployed via Party Setup) — e.g. athame-artis grants
    // the wielder ATK+20% (self) AND nearby allies ATK+16% (team); wolfs-gravestone
    // grants the wielder ATK+20% unconditional (self) AND all party members ATK+40%
    // on proc (team). So the presence of a `buffs` field must NOT suppress selfBuffs
    // processing (an earlier version of this guard did — it wiped athame-artis's
    // legitimate self entry on re-run; fixed 2026-07-10). The actual invariant to
    // protect is: never let the SAME effect exist in both fields — enforced by
    // curatorial discipline in META (party-wide-ONLY effects like elegy-for-the-end,
    // freedom-sworn, song-of-broken-pines are deliberately absent from META below;
    // their party-wide portion lives only in weapons.ts's hand-authored `buffs`).
    const hasKey = /selfBuffs: \[/.test(full);
    // Bound the selfBuffs array to whichever comes next — a `buffs:` (team) field
    // (e.g. peak-patrol-song, which carries both) or the line-terminal `icon:`.
    const sbMatch = hasKey && full.match(/selfBuffs: (\[.*?\])(?:, buffs:|, icon:)/);
    if (hasKey && !sbMatch) return full; // malformed — leave untouched, don't guess
    let arr = sbMatch ? JSON.parse(sbMatch[1]) : [];
    let uncond = arr.filter((x) => x.conditional === false);
    // Recover a missing unconditional static from the template (only if none captured).
    if (uncond.length === 0) {
        const stat = parseStatic(TEMPLATES[id]);
        if (stat) { uncond = [{ ...stat, conditional: false }]; recovered++; }
    }
    const meta = (META[id] || []).map((m) => ({ ...m, conditional: m.conditional ?? true }));
    // Dedup by exact content — a META entry using `uncond:true` describes the SAME
    // static effect that `uncond` (preserved from a prior run's addProps/recovery
    // output) already carries, so without this every re-run would double-append it
    // (bug found + fixed 2026-07-10: 12 weapons had exact-duplicate unconditional
    // entries after 2 script runs, before this fix made re-runs truly idempotent).
    const seenKeys = new Set();
    const next = [...uncond, ...meta].filter((x) => {
        const key = JSON.stringify(x);
        if (seenKeys.has(key)) return false;
        seenKeys.add(key);
        return true;
    });
    if (hasKey) {
        const before = JSON.stringify(arr);
        const after = JSON.stringify(next);
        if (before === after) { untouched++; return full; }
        changed++;
        if (meta.length) curated++; else cleared++;
        return full.replace(`selfBuffs: ${sbMatch[1]}`, `selfBuffs: ${after}`);
    }
    // No existing key — only add one if there's actually something to say.
    if (next.length === 0) { untouched++; return full; }
    changed++; keyAdded++;
    if (meta.length) curated++;
    return full.replace(/, icon:/, `, selfBuffs: ${JSON.stringify(next)}, icon:`);
});

fs.writeFileSync(WEAPONS_TS, src);
console.log(`curated ${curated} weapons, cleared ${cleared} (dropped fuzzy conditional), recovered ${recovered} static uncond, added ${keyAdded} missing selfBuffs keys, left ${untouched} unchanged, ${changed} lines rewritten.`);
console.log(`META covers ${Object.keys(META).length} weapons.`);
