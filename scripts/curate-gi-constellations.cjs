/**
 * curate-gi-constellations.cjs
 *
 * Hand-curated stat buffs for GI Constellation 1/2/4/6 (C3/C5 are handled separately —
 * see identify-gi-constellation-skill-boosts.cjs — as the universal "+3 skill level"
 * pattern). Unlike weapon passives / WW sequences, genshin-db's constellation text has
 * NO structured params array to anchor extraction — it's pure prose. A semi-automated
 * candidate extractor found 52 "single unambiguous %-value" candidates out of 284
 * C1/C2/C4/C6 nodes (71 5★ characters); EVERY candidate was manually read against its
 * source text before being added here — most were rejected:
 *   - proc damage instances ("deals 500% of ATK as DMG") — an extra damage source, not
 *     a stat buff to an existing attack; same exclusion as weapon-passive procs.
 *   - stat-scaled conversions feeding ONE specific skill ("+30% of DEF" to one attack)
 *     — needs the conversion engine PLUS skill-scoping, neither exists for this.
 *   - enemy debuffs ("opponent's DEF decreased by X%") — not a buff to our character.
 *   - ambiguous/ATK-SPD false-positives (regex matched "ATK" inside "ATK SPD").
 *   - crit-rate/crit-dmg scoped to ONE attack type — the engine can't scope crit
 *     stats to attack types (only elemDmg-family DMG% via `appliesTo`), so applying
 *     it generically would incorrectly buff the character's OTHER attack types too.
 *   - stacking effects where the extractor only caught the PER-STACK value, not the
 *     max-stack total (corrected by hand: Cyno 10%→50% at 5 stacks, Lyney 20%→60% at
 *     3 stacks, matching the "modeled as if active, max stacks" convention used
 *     throughout weapon-passive curation).
 *   - a comma-thousands-formatted number ("1,100%") that silently truncated to
 *     "100%" in the regex — caught by manually re-reading, not trusted blindly.
 * ~15 survived this review. Given the poor signal-to-noise ratio of automated
 * extraction here, this file is a plain hand-authored table (no further automated
 * parsing pass) — extending it means reading more character text by hand, the same
 * way this list was built.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'adapters', 'game-definitions', 'genshin-impact', 'constellations.generated.ts');

// opts: a plain appliesTo array (legacy shorthand), or { appliesTo, scaleOff } for a
// buff whose real magnitude scales with the source's own stat (see BuffEntry.scaleOff).
const b = (stat, label, value, opts) => {
    const o = Array.isArray(opts) ? { appliesTo: opts } : (opts || {});
    const out = { stat, label, value, conditional: true };
    if (o.appliesTo) out.appliesTo = o.appliesTo;
    if (o.scaleOff) out.scaleOff = o.scaleOff;
    return out;
};
const bUncond = (stat, label, value) => ({ stat, label, value, conditional: false });

/** id -> level -> { self?: [...], team?: [...] } */
const META = {
    'traveler-anemo': { 2: { self: [bUncond('energyRegen', 'Energy Recharge (C2)', 16)] } },
    'mona': { 4: { team: [{ stat: 'critRate', label: 'Crit Rate · vs Omen target (C4)', value: 15 }] } },
    'keqing': {
        4: { self: [b('atkPct', 'ATK% · post-Electro-reaction (C4)', 25)] },
        6: { self: [b('elemDmg', 'Electro DMG · on any action (C6)', 6)] },
    },
    'venti': { 4: { self: [b('elemDmg', 'Anemo DMG · post-pickup (C4)', 25)] } },
    'albedo': { 4: { team: [{ stat: 'elemDmg', label: 'Plunge DMG · in Solar Isotoma field (C4)', value: 30, appliesTo: ['plunge'] }] } },
    'hu_tao': { 4: { team: [{ stat: 'critRate', label: 'Crit Rate · post Blood-Blossom kill (C4)', value: 12 }] } },
    'yoimiya': { 2: { self: [b('elemDmg', 'Pyro DMG · post-CRIT (C2)', 25)] } },
    'ayaka': { 6: { self: [b('elemDmg', 'Charged DMG · Usurahi Butou (C6)', 298, ['charged'])] } },
    'raiden': { 4: { team: [{ stat: 'atkPct', label: 'ATK% · post-Musou Isshin (C4)', value: 30 }] } },
    // Shenhe's is really "Cryo CRIT DMG" — our critDmg stat has no element-scoping, so
    // this applies to all elements (a minor overstatement for a non-Cryo recipient;
    // Shenhe is near-exclusively paired with Cryo carries in practice).
    'shenhe': { 2: { team: [{ stat: 'critDmg', label: 'Crit DMG · in skill field, Cryo (C2)', value: 15 }] } },
    'ayato': { 2: { self: [b('hpPct', 'HP% · 3+ Namisen stacks (C2)', 50)] } },
    'cyno': { 2: { self: [b('elemDmg', 'Electro DMG · 5 stacks (C2)', 50)] } },
    'lyney': { 2: { self: [b('critDmg', 'Crit DMG · 3 stacks (C2)', 60)] } },
    // Lohen/Skirk are recently-added characters — included per this session's existing
    // "best-available, may be beta" convention (see data-fill-milestone).
    'lohen': { 2: { team: [{ stat: 'elementalMastery', label: 'EM · post Evilsbane Blade (C2)', value: 200 }] } },
    'skirk': { 2: { self: [b('atkPct', 'ATK% · Seven-Phase Flash post-Extinction (C2)', 70)] } },

    // ── 4★ roster (2026-07-11) — same discipline: all 200 C1/C2/C4/C6 nodes across the
    // 50 four-star characters read by hand. Roughly 60 clean entries survived; rejected
    // the same categories as the 5★ pass, PLUS a few new ones this batch surfaced:
    //   - off-field-only self buffs (only benefit the source while THEY are off-field —
    //     structurally inapplicable to this calc's on-field-damage model, e.g. Collei C1).
    //   - sub-skill-component scoping (a bonus to one named sub-move within a skill that
    //     has other damage instances too, e.g. Xingqiu's Fatal Rainscreen alone within his
    //     whole Skill) — our engine only scopes at the whole-skill/attack-type level.
    //   - summon/pet damage (Sayu's Muji-Muji Daruma, Illuga's Aedon) — a separate damage
    //     source our per-character skill model doesn't represent at all.
    //   - relative-condition triggers too unreliable to assume ("15% more DMG to lower-HP
    //     targets than yourself" — Chongyun C6).
    // RES/DEF-shred-on-enemy effects are modeled as team elemDmg (matches the Zhongli/
    // Citlali/Lisa kit-buff precedent); element-specific DMG bonuses (e.g. "Spectro DMG
    // Bonus") are modeled as generic elemDmg (matches the whole session's convention).
    'amber': { 6: { team: [bUncond('atkPct', 'ATK% · Fiery Rain (C6)', 15)] } },
    'lisa': { 2: { self: [b('defPct', 'DEF% · holding Violet Arc (C2)', 25)] } },
    'barbara': { 2: { team: [b('elemDmg', 'Hydro DMG · during Burst (C2)', 15)] } },
    'razor': {
        1: { self: [b('elemDmg', 'DMG · post-orb-pickup (C1)', 10)] },
        2: { self: [b('critRate', 'Crit Rate · vs <30% HP enemies (C2)', 10)] },
        4: { team: [b('elemDmg', 'DMG · DEF shred on Claw-and-Thunder target (C4)', 15)] },
    },
    'bennett': {
        2: { self: [b('energyRegen', 'Energy Recharge · HP<70% (C2)', 30)] },
        // Weapon-type-gated (Sword/Claymore/Polearm only) — not enforceable by the
        // engine, documented in the label; correct for the common case.
        6: { team: [b('elemDmg', 'Pyro DMG · Sword/Claymore/Polearm only (C6)', 15)] },
    },
    'noelle': {
        2: { self: [bUncond('elemDmg', 'Charged DMG (C2)', 15, ['charged'])] },
        6: { self: [b('atk', 'ATK · 50% of own DEF, during Sweeping Time (C6)', 400, { scaleOff: { sourceStat: 'def', basis: 'total', ratio: 0.5 } })] },
    },
    'sucrose': { 6: { team: [b('elemDmg', 'Elemental DMG · post-Absorption (C6)', 20)] } },
    'beidou': {
        4: { self: [b('elemDmg', 'Normal DMG · post-being-hit (C4)', 20, ['normal'])] },
        6: { team: [b('elemDmg', 'DMG · Electro RES shred (C6)', 15)] },
    },
    'xiangling': {
        1: { team: [b('elemDmg', 'DMG · Pyro RES shred, Guoba target (C1)', 15)] },
        6: { team: [b('elemDmg', 'Pyro DMG · during Pyronado (C6)', 15)] },
    },
    'xingqiu': { 2: { team: [b('elemDmg', 'DMG · Hydro RES shred (C2)', 15)] } },
    'rosaria': {
        1: { self: [b('elemDmg', 'Normal DMG · post-CRIT (C1)', 10, ['normal'])] },
        6: { team: [b('elemDmg', 'DMG · Physical RES shred (C6)', 20)] },
    },
    'sayu': { 2: { self: [b('elemDmg', 'Skill DMG · max ramp (C2)', 66, ['skill'])] } },
    'sara': { 6: { team: [b('critDmg', 'Crit DMG · ATK-buffed by Tengu Juurai (C6)', 60)] } },
    'thoma': { 6: { team: [b('elemDmg', 'Normal/Charged/Plunge DMG · post-Blazing-Barrier (C6)', 15, ['normal', 'charged', 'plunge'])] } },
    'gorou': { 6: { team: [b('critDmg', 'Geo Crit DMG · Crunch field (C6)', 40)] } },
    'yunjin': {
        2: { team: [b('elemDmg', 'Normal DMG · Cliffbreaker\'s Banner (C2)', 15, ['normal'])] },
        4: { self: [b('defPct', 'DEF% · post-Crystallize (C4)', 20)] },
    },
    'candace': { 2: { self: [b('hpPct', 'HP% · post-Heron\'s-Sanctum-hit (C2)', 20)] } },
    'layla': { 4: { team: [b('flatDmgAdd', 'Normal/Charged DMG · flat add, 5% of Layla\'s own Max HP (C4)', 200, { appliesTo: ['normal', 'charged'], scaleOff: { sourceStat: 'hp', basis: 'total', ratio: 0.05 } })] } },
    'faruzan': { 6: { team: [b('critDmg', 'Crit DMG · dealing Anemo DMG, Prayerful Wind active (C6)', 40)] } },
    'yaoyao': {
        1: { team: [b('elemDmg', 'Dendro DMG · post-Radish-explosion (C1)', 15)] },
        4: { self: [b('elementalMastery', 'EM · 0.3% of own Max HP, capped (C4)', 120, { scaleOff: { sourceStat: 'hp', basis: 'total', ratio: 0.003, cap: 120 } })] },
    },
    'kirara': { 6: { team: [b('elemDmg', 'All-Elem DMG · post-Skill/Burst (C6)', 12)] } },
    'lynette': { 6: { self: [b('elemDmg', 'Anemo DMG · post-Enigma-Thrust (C6)', 20)] } },
    'freminet': {
        4: { self: [b('atkPct', 'ATK% · 2 stacks, post-Cryo-reaction (C4)', 18)] },
        6: { self: [b('critDmg', 'Crit DMG · 3 stacks, post-Cryo-reaction (C6)', 36)] },
    },
    'charlotte': { 2: { self: [b('atkPct', 'ATK% · 3+ opponents hit (C2)', 30)] } },
    'chevreuse': { 6: { team: [b('elemDmg', 'Pyro/Electro DMG · 3 stacks, post-healed (C6)', 60)] } },
    'gaming': { 2: { self: [b('atkPct', 'ATK% · post-overflow-heal (C2)', 20)] } },
    'sethos': {
        2: { self: [b('elemDmg', 'Electro DMG · 2 stacks (C2)', 30)] },
        4: { team: [b('elementalMastery', 'EM · post-2+-target Skill/Forte hit (C4)', 80)] },
    },
    'kachina': { 4: { team: [b('defPct', 'DEF% · 4+ enemies in field (C4)', 20)] } },
    'ororon': {
        2: { self: [b('elemDmg', 'Electro DMG · max stacks, post-Burst (C2)', 32)] },
        6: { team: [b('atkPct', 'ATK% · active character, 3 stacks, post-Hypersense (C6)', 30)] },
    },
    'lan_yan': { 4: { team: [b('elementalMastery', 'EM · post-Burst (C4)', 60)] } },
    'aino': { 1: { team: [b('elementalMastery', 'EM · post-Skill/Burst (C1)', 80)] } },
    'collei': { 4: { team: [b('elementalMastery', 'EM · post-Trump-Card-Kitty (C4)', 60)] } },
    'diona': { 6: { team: [b('elementalMastery', 'EM · characters in Signature Mix field, HP>50% (C6)', 200)] } },
    'iansan': {
        2: { team: [b('atkPct', 'ATK% · Iansan off-field, Precise Movement active (C2)', 30)] },
        6: { team: [b('elemDmg', 'DMG · Extreme Force, post-Nightsoul-overflow (C6)', 25)] },
    },
    'ifa': { 4: { self: [b('elementalMastery', 'EM · post-Burst (C4)', 100)] } },
    'illuga': {
        4: { team: [bUncond('def', 'DEF · nearby party, Oriole-Song active (C4)', 200)] },
        6: { team: [b('critRate', 'Crit Rate · Geo DMG, Lightkeeper\'s Oath (C6)', 10), b('critDmg', 'Crit DMG · Geo DMG, Lightkeeper\'s Oath (C6)', 30)] },
    },
    'jahoda': { 6: { team: [b('critRate', 'Crit Rate · Moonsign chars, Flask full (C6)', 5), b('critDmg', 'Crit DMG · Moonsign chars, Flask full (C6)', 40)] } },
    'kuki_shinobu': { 6: { self: [b('elementalMastery', 'EM · HP<25% (C6)', 150)] } },
    'prune': {
        2: { self: [b('atkPct', 'ATK% · max stacks (C2)', 40)] },
        6: { team: [b('atk', 'ATK · flat, Tolling Rally active (C6)', 350)] },
    },
    'xinyan': {
        4: { team: [b('elemDmg', 'DMG · Physical RES shred (C4)', 15)] },
        6: { self: [b('flatDmgAdd', 'Charged DMG · flat add, 50% of own DEF (C6)', 400, { appliesTo: ['charged'], scaleOff: { sourceStat: 'def', basis: 'total', ratio: 0.5 } })] },
    },
};

let src = fs.readFileSync(FILE, 'utf8');
let selfCount = 0, teamCount = 0;
for (const [id, byLevel] of Object.entries(META)) {
    for (const [level, { self, team }] of Object.entries(byLevel)) {
        // Match this character's node at this level within its array, add selfBuffs/buffs
        // right after `description: "..."` (before the closing `}` of that node object).
        const nodeRe = new RegExp(`("${id}": \\[[\\s\\S]*?\\{ level: ${level}, name: "[^"]*", description: "(?:[^"\\\\]|\\\\.)*")( \\})`);
        const m = src.match(nodeRe);
        if (!m) { console.log('NO MATCH:', id, 'L' + level); continue; }
        let extra = '';
        if (self) { extra += `, selfBuffs: ${JSON.stringify(self)}`; selfCount += self.length; }
        // Team buffs (ConstellationNode['buffs']) have no `conditional` field — b()
        // always adds one (for the self-toggle use case), so strip it here rather
        // than require every META team-array call site to remember to omit it.
        if (team) { extra += `, buffs: ${JSON.stringify(team.map(({ conditional, ...rest }) => rest))}`; teamCount += team.length; }
        src = src.replace(nodeRe, `$1${extra}$2`);
    }
}
fs.writeFileSync(FILE, src);
console.log(`curated ${Object.keys(META).length} characters | selfBuffs added: ${selfCount} | team buffs added: ${teamCount}`);
