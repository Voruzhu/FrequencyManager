/**
 * import-wuwa-weapon-passives.cjs
 *
 * FULL generator for the Wuthering Waves weapon roster (weapons.ts): accurate Lv90
 * base ATK + secondary AND parsed passive self-buffs + a readable R1 passive string.
 * (Supersedes import-wuwa-weapons-full.cjs, which produced the same file without
 * passives — this regenerates everything so the file is always internally consistent.)
 *
 * Source: Dimbreath datamine. Base ATK/secondary = WeaponConf × WeaponPropertyGrowth
 * curve, secondary type via PropertyIndex (unchanged from the base generator). Passive
 * self-buffs come from `WeaponConf.Desc` (a MultiText key with {i} placeholders) +
 * `DescParams[i].ArrayString` (exact R1-R5 values). Percentage params are stat buffs;
 * plain numbers (stacks/durations/flat energy) are skipped. Each %-param maps to a stat
 * by the text before OR after its placeholder; DEF-ignore / RES-shred / amplification /
 * reaction / healing phrasings are excluded (not wielder stat buffs). Unconditional =
 * appears before any trigger clause; attack-type DMG bonuses get an `appliesTo` scope.
 * Values are R1 (the inspector multiplies by the refinement multiplier from
 * import-wuwa-weapon-scaling.cjs).
 *
 * Run from repo root:
 *   WW_CACHE=<dir with ww-weaponconf.json + ww-multitext.json> node --max-old-space-size=3072 scripts/import-wuwa-weapon-passives.cjs
 *   (without WW_CACHE it fetches everything; the 23MB TextMap needs a long timeout.)
 * Writes: adapters/game-definitions/wuthering-waves/weapons.ts
 */
'use strict';
const fs = require('fs');
const path = require('path');
const RAW = 'https://raw.githubusercontent.com/Dimbreath/WutheringData/master/';
const OUT = path.join(process.cwd(), 'adapters', 'game-definitions', 'wuthering-waves', 'weapons.ts');
const get = async (f) => { const r = await fetch(RAW + f, { signal: AbortSignal.timeout(180000) }); if (!r.ok) throw new Error(f); return r.json(); };
const slug = (s) => s.toLowerCase().replace(/[''’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const TYPE = { 1: 'Broadblade', 2: 'Sword', 3: 'Pistols', 4: 'Gauntlets', 5: 'Rectifier' };
const KEY = { Crit: 'CRIT Rate', CritDamage: 'CRIT DMG', EnergyEfficiency: 'Energy Regen', GreenAtk: 'ATK%', GreenLifeMax: 'HP%', GreenDef: 'DEF%', Atk: 'ATK' };

// ── passive parser ───────────────────────────────────────────────────────────
const TRIGGER = /\b(when|after|upon|every|while|once|casting|is cast|dealing|providing|within|hitting|on hit|stacking|stackable)\b/i;
// "Amplif" alone is deliberately NOT excluded — WW's "gain X% <Attack Type> DMG
// Amplification" is a plain self-buff phrasing (same meaning as "DMG Bonus"), not
// inherently a reaction/enemy effect. Reaction-scoped Amplification (e.g. "Amplifies
// Spectro Frazzle DMG") is still excluded via the Frazzle/Erosion keywords below;
// enemy-targeted Amplification ("the DMG TAKEN by the target is Amplified") is still
// excluded via "DMG taken" — that needs a TEAM buff (benefits any attacker, not just
// the wielder), out of scope for this self-buff parser. Bug found + fixed
// 2026-07-11: the old blanket "Amplif" exclusion also silently dropped legitimate
// self-buffs using that phrasing (Daybreaker's Spine, Lux Umbra, Luminous Hymn).
const NOT_A_BUFF = /ignore|\bRES\b|resistance|Frazzle|Erosion|Deepen|reduc|pen\b|DMG dealt by|DMG taken|healing|heals/i;
const CONNECT = '(?:\\s+(?:is\\s+)?increased)?(?:\\s+by)?';
const PRE = '(?:of\\s+|a\\s+|an\\s+|their\\s+|the\\s+)?';
const STAT_TESTS = [
    [`Energy Regen(?:eration)?`, 'energyRegen', null, 'Energy Regen'],
    [`Crit\\.?\\s*Rate`, 'critRate', null, 'Crit Rate'],
    [`Crit\\.?\\s*DMG`, 'critDmg', null, 'Crit DMG'],
    [`Basic Attack and Heavy Attack\\s+(?:DMG(?:\\s+Bonus)?|Bonus)`, 'elemDmg', ['basic', 'heavy'], 'Basic/Heavy DMG'],
    [`Basic Attack\\s+(?:DMG(?:\\s+Bonus)?|Bonus)`, 'elemDmg', ['basic'], 'Basic DMG'],
    [`Heavy Attack\\s+(?:DMG(?:\\s+Bonus)?|Bonus)`, 'elemDmg', ['heavy'], 'Heavy DMG'],
    [`Resonance Skill\\s+(?:DMG(?:\\s+Bonus)?|Bonus)`, 'elemDmg', ['skill'], 'Res. Skill DMG'],
    [`Resonance Liberation\\s+(?:DMG(?:\\s+Bonus)?|Bonus)`, 'elemDmg', ['ult'], 'Liberation DMG'],
    [`(?:Glacio|Fusion|Electro|Aero|Spectro|Havoc)\\s+DMG(?:\\s+Bonus)?`, 'elemDmg', null, 'Elem DMG'],
    [`(?:All-Attribute|Attribute)\\s+DMG Bonus`, 'elemDmg', null, 'DMG Bonus'],
    [`DMG Bonus`, 'elemDmg', null, 'DMG Bonus'],
    [`Healing Bonus`, 'healingBonus', null, 'Healing Bonus'],
    [`ATK`, 'atkPct', null, 'ATK%'],
    [`Max\\s+HP`, 'hpPct', null, 'HP%'],
    [`HP`, 'hpPct', null, 'HP%'],
    [`DEF`, 'defPct', null, 'DEF%'],
];
function detectStat(before, after) {
    const b = before.replace(/\s+$/, '');
    for (const [core, stat, scope, label] of STAT_TESTS)
        if (new RegExp(core + CONNECT + '$', 'i').test(b)) return { stat, scope, label };
    const a = after.replace(/^[\s,]+/, '');
    if (NOT_A_BUFF.test(before.slice(-40)) || NOT_A_BUFF.test(a.slice(0, 40))) return null;
    for (const [core, stat, scope, label] of STAT_TESTS)
        if (new RegExp('^' + PRE + core + '\\b', 'i').test(a)) return { stat, scope, label };
    return null;
}
// "X%, stacking up to N times" / "stackable (for) up to N times" describes a PER-STACK
// value — WW's own DescParams only ever carry that per-stack number, never the summed
// total, unlike some GI constellation text which occasionally states the max directly.
// Matches the "modeled as if active / at max stacks" convention used everywhere else
// this session (GI constellations, weapon passives) — search a window after the
// placeholder (the phrase always follows the value in WW's phrasing) for the stack
// count and multiply. Bug found + fixed 2026-07-11: previously this multiplier was
// never applied, silently under-counting ~20 weapons' conditional stacking buffs by
// their full stack count (e.g. Verdant Summit's Heavy DMG was captured as 24%, half its
// real 48% max-stack value).
// The stack count itself is USUALLY another {i} placeholder (e.g. "stacking up to {2}
// time(s)"), not a literal digit baked into the template — only a handful of weapons
// (Ocean's Gift, Hollow Mirage) happen to write it literally. Try the placeholder form
// first and resolve it against `params`; fall back to a literal digit.
const STACK_RE_PARAM = /\bstack(?:ing|able)?\s*(?:up\s*to\s*|for\s*up\s*to\s*)?\{(\d+)\}\s*time/i;
const STACK_RE_LITERAL = /\bstack(?:ing|able)?\s*(?:up\s*to\s*|for\s*up\s*to\s*)?(\d+)\s*time/i;
function stackMultiplierNear(desc, pos, params) {
    // Bound to the current sentence, THEN extend through any immediately-following
    // "This effect ..." sentences — WW's own phrasing convention for continuing to
    // describe the SAME buff's trigger/CD/stacking rules in a separate sentence
    // (e.g. "...ATK by 4% for 10s. This effect can be triggered..., stackable up to
    // 4 times."). A sentence that does NOT start with "This effect" introduces a
    // genuinely different mechanic (e.g. moongazers-sigil's "Obtaining Shield
    // allows..." DEF-ignore effect) and must NOT be absorbed — bug found + fixed
    // 2026-07-11: an earlier, cruder fix wrongly attributed a later, unrelated
    // "stacking up to 5 times" to an earlier flat single-trigger buff (5x inflation
    // on 2 weapons); a flat sentence-boundary cutoff then broke 6 OTHER weapons
    // whose real stacking phrase legitimately lives in the following "This effect"
    // sentence. Only "This effect"-prefixed continuations are followed.
    let end = desc.indexOf('.', pos);
    end = end < 0 ? desc.length : end + 1;
    for (; ;) {
        const rest = desc.slice(end).replace(/^\s+/, '');
        if (!/^This effect\b/i.test(rest)) break;
        const nextEnd = desc.indexOf('.', end);
        if (nextEnd < 0) { end = desc.length; break; }
        end = nextEnd + 1;
    }
    const window = desc.slice(pos, Math.min(end, pos + 300));
    const pm = window.match(STACK_RE_PARAM);
    if (pm) {
        const idx = parseInt(pm[1], 10);
        const v = params[idx] && parseFloat(params[idx][0]);
        if (v && isFinite(v)) return v;
    }
    const lm = window.match(STACK_RE_LITERAL);
    return lm ? parseInt(lm[1], 10) : 1;
}
// A trigger word can appear BEFORE the value it gates ("upon X, gain Y%" — the
// original assumption) OR AFTER it ("gain Y% upon X" — e.g. Autumntrace, Static
// Mist). Checking only "is there a trigger word earlier anywhere in the WHOLE
// text" misses the second ordering — bug found + fixed 2026-07-11: it silently
// marked 2 real trigger-gated buffs as unconditional (always-on), which is a much
// worse class of error than a wrong stack count (an always-applied buff that
// actually needs a trigger overstates EVERY build using that weapon). Now checks
// the placeholder's OWN sentence for a trigger word in either direction.
function parseSelfBuffs(desc, params) {
    const trig = desc.search(TRIGGER);
    const globalTriggerPos = trig < 0 ? Infinity : trig;
    const buffs = [], seen = new Set();
    for (let i = 0; i < params.length; i++) {
        const arr = params[i]; if (!arr || !arr.length || !/%$/.test(arr[0])) continue;
        const pos = desc.indexOf('{' + i + '}');
        if (pos < 0) continue;
        const st = detectStat(desc.slice(0, pos), desc.slice(pos + ('{' + i + '}').length));
        if (!st) continue;
        const sentenceStart = desc.lastIndexOf('.', pos) + 1;
        const sentenceEndIdx = desc.indexOf('.', pos);
        const sentence = desc.slice(sentenceStart, sentenceEndIdx < 0 ? desc.length : sentenceEndIdx + 1);
        const conditional = pos > globalTriggerPos || TRIGGER.test(sentence);
        const key = st.stat + '|' + (st.scope ? st.scope.join('+') : '') + '|' + conditional;
        if (seen.has(key)) continue;
        seen.add(key);
        const stacks = stackMultiplierNear(desc, pos, params);
        const bo = { stat: st.stat, label: st.label, value: Math.round(parseFloat(arr[0]) * stacks * 100) / 100, conditional };
        if (stacks > 1) bo.label += ` · ${stacks} stacks`;
        if (st.scope) bo.appliesTo = st.scope;
        buffs.push(bo);
    }
    return buffs.sort((x, y) => (x.conditional === y.conditional ? 0 : x.conditional ? 1 : -1));
}
const passiveText = (desc, params) =>
    desc.replace(/\{(\d+)\}/g, (m, i) => (params[i] && params[i][0] != null ? params[i][0] : m)).replace(/\s+/g, ' ').trim();

async function load() {
    const dir = process.env.WW_CACHE;
    const cached = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const [wc, tm] = dir
        ? [cached('ww-weaponconf.json'), cached('ww-multitext.json')]
        : await Promise.all([get('ConfigDB/WeaponConf.json'), get('TextMap/en/MultiText.json')]);
    // Growth + PropertyIndex are small — always fetched.
    const [wg, pi] = await Promise.all([get('ConfigDB/WeaponPropertyGrowth.json'), get('ConfigDB/PropertyIndex.json')]);
    return { wc, tm, wg, pi };
}

(async () => {
    console.log('loading datamine…');
    const { wc, tm, wg, pi } = await load();
    const W = Array.isArray(wc) ? wc : Object.values(wc);
    const G = Array.isArray(wg) ? wg : Object.values(wg);
    const P = Array.isArray(pi) ? pi : Object.values(pi);
    const propOf = (id) => P.find((x) => x.Id === id);
    const maxLv = Math.max(...G.map((x) => x.Level));
    const curveAt = (cid) => { const r = G.find((x) => x.CurveId === cid && x.Level === maxLv && x.BreachLevel === 6) || G.filter((x) => x.CurveId === cid && x.Level === maxLv).pop(); return r ? r.CurveValue : null; };

    const seen = new Set(); const rows = []; let withBuffs = 0;
    for (const w of W) {
        const name = tm[w.WeaponName];
        if (!name || !w.FirstPropId || !TYPE[w.WeaponType] || !w.QualityId) continue;
        if (seen.has(name)) continue; seen.add(name);
        const id = slug(name);
        const baseAtk = Math.round(w.FirstPropId.Value * curveAt(w.FirstCurve) / 10000);
        let secStat = 'ATK%', secVal = 0;
        const sp = w.SecondPropId, prop = sp && propOf(sp.Id);
        if (prop && KEY[prop.Key]) {
            secStat = KEY[prop.Key];
            const raw = sp.Value * curveAt(w.SecondCurve) / 10000;
            secVal = +(sp.IsRatio ? raw * 100 : (prop.IsPercent ? raw / 100 : raw)).toFixed(1);
        }
        const desc = (tm[w.Desc] || '').replace(/<[^>]+>/g, '').replace(/\\n|\n/g, ' ');
        const params = (w.DescParams || []).map((p) => p.ArrayString);
        const selfBuffs = parseSelfBuffs(desc, params);
        const passive = passiveText(desc, params);
        if (selfBuffs.length) withBuffs++;
        let line = `    { id: ${JSON.stringify(id)}, name: ${JSON.stringify(name)}, weaponType: ${JSON.stringify(TYPE[w.WeaponType])}, rarity: ${w.QualityId}, baseAtk: ${baseAtk}, secondaryStat: ${JSON.stringify(secStat)}, secondaryValue: ${secVal}`;
        if (passive) line += `, passive: ${JSON.stringify(passive)}`;
        if (selfBuffs.length) line += `, selfBuffs: ${JSON.stringify(selfBuffs)}`;
        line += `, icon: ${JSON.stringify('icons/weapons/' + id + '.png')} },`;
        rows.push({ rarity: w.QualityId, name, line });
    }
    rows.sort((a, b) => b.rarity - a.rarity || a.name.localeCompare(b.name));

    const header = `/**\n * @fileoverview Wuthering Waves weapon database (FULL roster, auto-generated)\n * @module adapters/game-definitions/wuthering-waves/weapons\n *\n * Accurate lvl-90 base ATK + secondary from the Dimbreath datamine (WeaponConf x\n * WeaponPropertyGrowth, secondary type via PropertyIndex) + parsed passive self-buffs\n * (WeaponConf.Desc/DescParams). Regenerate:\n * WW_CACHE=<dir> node --max-old-space-size=3072 scripts/import-wuwa-weapon-passives.cjs. ${rows.length} weapons.\n */\nimport type { WeaponType, StatType } from '@shared/types/game-definition';\nexport interface WUWeapon {\n    id: string; name: string; weaponType: WeaponType; rarity: number;\n    baseAtk: number; secondaryStat: StatType; secondaryValue: number;\n    /** Passive description (human-readable, R1 values). */\n    passive?: string;\n    /** TEAM buffs the passive deploys to the party (support weapons only). */\n    buffs?: Array<{ stat: string; label: string; value: number }>;\n    /** SELF buffs the passive grants the wielder (R1). Unconditional (conditional:false) auto-apply; conditional are opt-in toggles / trigger-conditional. \`appliesTo\` scopes a DMG% buff. */\n    selfBuffs?: Array<{ stat: string; label: string; value: number; conditional?: boolean; appliesTo?: string[] }>;\n    icon: string;\n}\nexport const WEAPONS: WUWeapon[] = [\n`;
    const footer = '\n];\n\nexport const getWeapon = (id: string): WUWeapon | undefined => WEAPONS.find((w) => w.id === id);\n';
    fs.writeFileSync(OUT, header + rows.map((r) => r.line).join('\n') + footer);
    console.log(`Wrote ${rows.length} WuWa weapons; ${withBuffs} have self-buffs.`);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
