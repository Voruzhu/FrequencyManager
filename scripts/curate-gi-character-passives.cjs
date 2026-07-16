/**
 * curate-gi-character-passives.cjs
 *
 * Hand-curated SELF stat buffs from GI characters' own (non-weapon, non-
 * constellation) passive talents — e.g. Zhongli's "Dominance of Earth". Read all
 * 140 passive1/passive2 entries across the 71 5★ roster by hand (genshin-db has
 * no structured params for these, same as constellations — pure prose, so no
 * automated extraction pass). Rejection categories match constellations/weapon
 * passives, plus a few specific to this batch:
 *   - proc damage instances, enemy debuffs, ATK-SPD, crit scoped to one attack
 *     type or one sub-skill, sub-skill-component scoping (same as constellations).
 *   - team-wide effects found here were routed to `bundle.ts`'s kit `character`
 *     array instead (this file is SELF-only) — see that file for Ganyu/Hu Tao/
 *     Yoimiya/Furina's 2nd entry/Aloy's team half/Ineffa/Escoffier/Sigewinne.
 *   - compound/multi-variable scaling (2 stats feeding one formula — Kokomi's
 *     Max-HP-then-Healing-Bonus chain) or multi-branch Moonsign/reaction-state
 *     mechanics (Durin, Varka, Nefer, Nicole, Skirk, Xilonen, Lauma, Linnea,
 *     Chasca, Nilou, Wanderer) — too many compounding conditions to model
 *     without real risk of getting the interaction wrong.
 *   - "current HP as % of Max HP crossing a threshold" (Neuvillette's real
 *     formula) — this calc has no notion of "current HP" distinct from "Max
 *     HP" (it's a static build tool, not a combat simulator), so modeled at
 *     its stated CAP instead of the raw formula (the cap is reached at any
 *     HP% >= 80% of Max, a low bar under the calc's implicit "ready to fight,
 *     full HP" assumption).
 * `scaleOff` gained an `offset` field this pass (see BuffEntry.scaleOff) for
 * "each 1% ER ABOVE 100%" style effects (Raiden Shogun, Nahida's A4) where the
 * bonus is 0 below a threshold, not proportional from zero.
 *
 * This file directly WRITES the whole character-passives.generated.ts content
 * (unlike the constellation/weapon curation scripts, there's no separate base-
 * import step to preserve — every entry here is hand-authored from scratch).
 * Re-run: node scripts/curate-gi-character-passives.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'adapters', 'game-definitions', 'genshin-impact', 'character-passives.generated.ts');

const b = (stat, label, value, opts) => {
    const o = Array.isArray(opts) ? { appliesTo: opts } : (opts || {});
    const out = { stat, label, value, conditional: o.uncond ? false : true };
    if (o.appliesTo) out.appliesTo = o.appliesTo;
    if (o.scaleOff) out.scaleOff = o.scaleOff;
    return out;
};

const META = {
    diluc: [b('elemDmg', 'Pyro DMG · Dawn infusion active (P2)', 20)],
    mona: [b('elemDmg', 'Hydro DMG · 20% of own ER (P2)', 12, { scaleOff: { sourceStat: 'energyRegen', basis: 'total', ratio: 0.2 } })],
    keqing: [b('critRate', 'Crit Rate · post-Starward-Sword (P2)', 15), b('energyRegen', 'Energy Recharge · post-Starward-Sword (P2)', 15)],
    zhongli: [
        b('flatDmgAdd', 'Normal/Charged/Plunge DMG · flat add, 1.39% of own Max HP (P2)', 200, { appliesTo: ['normal', 'charged', 'plunge'], uncond: true, scaleOff: { sourceStat: 'hp', basis: 'total', ratio: 0.0139 } }),
        b('flatDmgAdd', 'Skill DMG · flat add, 1.9% of own Max HP (P2)', 280, { appliesTo: ['skill'], uncond: true, scaleOff: { sourceStat: 'hp', basis: 'total', ratio: 0.019 } }),
        b('flatDmgAdd', 'Burst DMG · flat add, 33% of own Max HP (P2)', 4850, { appliesTo: ['ult'], uncond: true, scaleOff: { sourceStat: 'hp', basis: 'total', ratio: 0.33 } }),
    ],
    xiao: [b('elemDmg', 'DMG · max ramp, Bane of All Evil (P1)', 25), b('elemDmg', 'Skill DMG · 3 stacks (P2)', 45, ['skill'])],
    hu_tao: [b('elemDmg', 'Pyro DMG · HP<=50% (P2)', 33)],
    yoimiya: [b('elemDmg', 'Pyro DMG · max 10 stacks (P1)', 20)],
    ayaka: [b('elemDmg', 'Normal/Charged DMG · post-Burst (P1)', 30, ['normal', 'charged']), b('elemDmg', 'Cryo DMG · post-Skill-Cryo-application (P2)', 18)],
    // Arataki Kesagiri (the DEF-scaled DMG) is confirmed via genshin-db's own combat1
    // attribute labels ("Arataki Kesagiri Combo/Final Slash DMG") to be part of his
    // Charged Attack, not his Elemental Skill — corrected 2026-07-11 recheck.
    itto: [b('flatDmgAdd', 'Charged DMG · flat add, 35% of own DEF, Arataki Kesagiri (P2)', 280, { appliesTo: ['charged'], uncond: true, scaleOff: { sourceStat: 'def', basis: 'total', ratio: 0.35 } })],
    yae_miko: [b('elemDmg', 'Skill DMG · 0.15% per own EM point (P2)', 15, { appliesTo: ['skill'], uncond: true, scaleOff: { sourceStat: 'elementalMastery', basis: 'total', ratio: 0.15 } })],
    // Cyno's real bonus also covers "Duststalker Bolt" DMG (+250% EM) but that's an
    // enhancement to his P1's proc-damage instance (itself unmodeled — proc damage) —
    // only the Normal Attack portion is kept. Conditional: only applies in his
    // "Pactsworn Pathclearer" transformed state, not his baseline Normal Attack.
    cyno: [b('flatDmgAdd', 'Normal DMG · flat add, 150% of own EM, Pactsworn Pathclearer state (P2)', 1500, { appliesTo: ['normal'], scaleOff: { sourceStat: 'elementalMastery', basis: 'total', ratio: 1.5 } })],
    // Real text: "increase the DMG dealt by Projection Attacks and Particular Field:
    // Fetters of Phenomena" — Projection Attacks are his Skill's Chisel-Light-Mirror
    // mechanic (combat2), Particular Field: Fetters of Phenomena is his Burst
    // (combat3) — both scopes needed, not Skill alone. Corrected 2026-07-11 recheck.
    alhaitham: [b('elemDmg', 'Skill/Burst DMG · 0.1% per own EM point, capped (P2)', 100, { appliesTo: ['skill', 'ult'], uncond: true, scaleOff: { sourceStat: 'elementalMastery', basis: 'total', ratio: 0.1, cap: 100 } })],
    baizhu: [b('elemDmg', 'Dendro DMG · active character HP>=50% (P1)', 25)],
    // Real max is 100% with 3 other Pyro teammates; kept to the team-independent
    // guaranteed 60% to avoid overstating for non-mono-Pyro comps.
    lyney: [b('elemDmg', 'DMG · vs Pyro-affected, guaranteed portion (P2)', 60)],
    neuvillette: [
        b('elemDmg', 'Charged DMG · 3 stacks (P1)', 60, ['charged']),
        // Real formula scales with CURRENT HP% above 30% of Max — this calc has no
        // "current HP" distinct from Max HP; modeled at the stated cap (30%), which
        // full-HP characters at or above ~80% Max HP would always reach.
        b('elemDmg', 'Hydro DMG · HP>=80% of Max, capped (P2)', 30),
    ],
    wriothesley: [b('atkPct', 'ATK% · 5 stacks (P2)', 30)],
    navia: [b('elemDmg', 'Normal/Charged/Plunge DMG · Geo infusion active (P1)', 40, ['normal', 'charged', 'plunge']), b('atkPct', 'ATK% · 2 elemental teammates (P2)', 40)],
    chiori: [b('elemDmg', 'Geo DMG · post-ally-Geo-Construct (P2)', 20)],
    clorinde: [
        b('flatDmgAdd', 'Normal/Burst DMG · flat add, 60% of own ATK, capped (P1)', 1800, { appliesTo: ['normal', 'ult'], scaleOff: { sourceStat: 'atk', basis: 'total', ratio: 0.6, cap: 1800 } }),
        b('critRate', 'Crit Rate · 2 stacks, Bond of Life (P2)', 20),
    ],
    emilie: [b('elemDmg', 'DMG · vs Burning, 0.015% per own ATK point, capped (P2)', 36, { scaleOff: { sourceStat: 'atk', basis: 'total', ratio: 0.015, cap: 36 } })],
    // "Scalespiker Cannon" is explicitly named in the source text as part of his
    // Elemental Skill "Canopy Hunter: Riding High," not his Burst ("Hail to the
    // Almighty Dragonlord," a separate, unrelated move). Corrected 2026-07-11 recheck.
    kinich: [b('flatDmgAdd', 'Skill DMG · flat add, up to 640% of own ATK, 2 stacks, Scalespiker Cannon (P2)', 6400, { appliesTo: ['skill'], scaleOff: { sourceStat: 'atk', basis: 'total', ratio: 6.4 } })],
    mualani: [b('flatDmgAdd', 'Burst DMG · flat add, 45% of own Max HP, 3 stacks (P2)', 5500, { appliesTo: ['ult'], scaleOff: { sourceStat: 'hp', basis: 'total', ratio: 0.45 } })],
    citlali: [
        b('flatDmgAdd', 'Skill DMG · flat add, 90% of own EM (P2)', 900, { appliesTo: ['skill'], uncond: true, scaleOff: { sourceStat: 'elementalMastery', basis: 'total', ratio: 0.9 } }),
        b('flatDmgAdd', 'Burst DMG · flat add, 1200% of own EM (P2)', 12000, { appliesTo: ['ult'], uncond: true, scaleOff: { sourceStat: 'elementalMastery', basis: 'total', ratio: 12 } }),
    ],
    mavuika: [b('atkPct', 'ATK% · post-ally-Nightsoul-Burst (P1)', 30), b('elemDmg', 'DMG · max Fighting Spirit, post-Burst (P2)', 40)],
    yelan: [b('hpPct', 'HP% · 4 elemental types (P1)', 30)],
    aloy: [b('atkPct', 'ATK% · post-Coil-effect (P1)', 16), b('elemDmg', 'Cryo DMG · max ramp, Rushing Ice (P2)', 35)],
    columbina: [b('critRate', 'Crit Rate · 3 stacks (P1)', 15)],
    flins: [b('elementalMastery', 'EM · 8% of own ATK, capped (P2)', 160, { uncond: true, scaleOff: { sourceStat: 'atk', basis: 'total', ratio: 0.08, cap: 160 } })],
    lohen: [b('atkPct', 'ATK% · post-ally-Cryo-reaction, Masterstroke mode (P2)', 15)],
    sandrone: [b('elementalMastery', 'EM · 8% of own ATK, capped (P2)', 160, { uncond: true, scaleOff: { sourceStat: 'atk', basis: 'total', ratio: 0.08, cap: 160 } })],
    tighnari: [
        b('elementalMastery', 'EM · post-Wreath-Arrow (P1)', 50),
        // Real text: "Charged Attack and Fashioner's Tanglevine Shaft DMG are
        // increased" — Fashioner's Tanglevine Shaft is his Burst (combat3), not just
        // Charged Attack. Corrected 2026-07-11 recheck.
        b('elemDmg', 'Charged/Burst DMG · 0.06% per own EM point, capped (P2)', 60, { appliesTo: ['charged', 'ult'], uncond: true, scaleOff: { sourceStat: 'elementalMastery', basis: 'total', ratio: 0.06, cap: 60 } }),
    ],
    varesa: [b('atkPct', 'ATK% · post-ally-Nightsoul-Burst, 2 stacks (P2)', 70)],
    zibai: [b('defPct', 'DEF% · 3 other Geo teammates (P2)', 45)],
    // "Each 1% ER above 100%" — 0 below the threshold, not proportional from zero;
    // uses the new scaleOff `offset`. No trigger clause in the source text (a
    // passive stat conversion based on her current ER, not a triggered event).
    // 2026-07-11 recheck: ratio was 0.004, a 100x scale error — the real text ("each
    // 1% above 100% ER grants 0.4% Electro DMG Bonus") requires ratio=0.4 to
    // reproduce "0.4 percentage points of bonus per 1 percentage point of ER,"
    // since energyRegen is stored as a raw percentage number (e.g. 200 for 200% ER),
    // not a fraction. Verified: at 0.004 the bonus was capped under 1% for any
    // realistic ER investment, functionally disabling her signature passive.
    raiden: [b('elemDmg', 'Electro DMG · 0.4% per 1% ER above 100% (P2)', 0, { uncond: true, scaleOff: { sourceStat: 'energyRegen', basis: 'total', ratio: 0.4, offset: 100 } })],
    // Real bonus also includes +0.03% Crit Rate scoped to the same skill — dropped,
    // crit stats can't be scoped to one attack type.
    // 2026-07-11 recheck: ratio was 0.001, a 100x scale error — the real text ("each
    // point of EM beyond 200 grants 0.1% Bonus DMG... max 80%") requires ratio=0.1
    // to reach the stated 80% cap at a realistic EM value (~1000); at 0.001 the cap
    // was unreachable below EM=80,200.
    nahida: [b('elemDmg', 'Skill DMG · 0.1% per own EM point above 200, capped (P2)', 0, { appliesTo: ['skill'], uncond: true, scaleOff: { sourceStat: 'elementalMastery', basis: 'total', ratio: 0.1, offset: 200, cap: 80 } })],
};

const body = Object.entries(META).map(([id, buffs]) => `    ${JSON.stringify(id)}: ${JSON.stringify(buffs)},`).join('\n');
const ts = `/**
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
 * ${Object.keys(META).length} characters, ${Object.values(META).reduce((n, a) => n + a.length, 0)} buff entries.
 */
import type { BuffEntry } from '@shared/types/game-bundle';

export const CHARACTER_SELF_BUFFS: Record<string, Array<{ stat: string; label: string; value: number; conditional?: boolean; appliesTo?: string[]; scaleOff?: BuffEntry['scaleOff'] }>> = {
${body}
};

export default CHARACTER_SELF_BUFFS;
`;
fs.writeFileSync(OUT, ts);
console.log(`curated ${Object.keys(META).length} characters | ${Object.values(META).reduce((n, a) => n + a.length, 0)} buff entries`);
