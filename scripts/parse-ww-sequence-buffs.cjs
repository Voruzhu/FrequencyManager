/**
 * parse-ww-sequence-buffs.cjs
 *
 * Adds `selfBuffs` / `buffs` (team) to WW Sequence nodes — reuses the EXACT stat-
 * detection architecture already validated for WW weapon passives
 * (import-wuwa-weapon-passives.cjs): raw MultiText template + `{i}` placeholders +
 * AttributesDescriptionParams, percentage params only (stacks/durations/flat-energy
 * skipped), stat inferred from text before/after the placeholder, DEF-ignore/heal/
 * amplification excluded. NEW for sequences: "all team members" / "nearby
 * resonators" / etc. language routes the buff to `buffs` (team, deployed via Party
 * Setup) instead of `selfBuffs` — WW Sequence 4 is commonly (not universally) a
 * team-wide ATK/DMG buff, same class of effect as the GI weapon team-buffs fixed
 * earlier this session. A buff NEVER appears in both fields for the same node.
 *
 * Run from repo root after `npm run build:main`: node scripts/parse-ww-sequence-buffs.cjs
 * (accepts `WW_CACHE=<dir>` to skip the slow 23MB TextMap fetch.)
 * Rewrites adapters/game-definitions/wuthering-waves/sequences.generated.ts in place
 * (merges into the existing level/name/description nodes from import-ww-sequences.cjs).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const RAW = 'https://raw.githubusercontent.com/Dimbreath/WutheringData/master/';
const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, 'adapters', 'game-definitions', 'wuthering-waves', 'sequences.generated.ts');
const { CHARACTERS } = require(path.join(ROOT, 'dist', 'adapters', 'game-definitions', 'wuthering-waves', 'characters.js'));
const get = async (f) => { const r = await fetch(RAW + f, { signal: AbortSignal.timeout(60000) }); if (!r.ok) throw new Error(f); return r.json(); };
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

// ── stat/team detection (same architecture as import-wuwa-weapon-passives.cjs) ──
const TRIGGER = /\b(when|after|upon|every|while|once|casting|is cast|dealing|providing|within|hitting|on hit|picked up|knocked out)\b/i;
// A leading "In <State>," clause (e.g. "In Instant Response, Heavy Attack gains...")
// is also a conditional marker but doesn't contain any TRIGGER keyword — narrowly
// matched (capitalized word right after "In", not the generic word "in") to avoid
// false-positives on ordinary prose like "increases DMG in Basic Attacks".
const IN_STATE_CLAUSE = /^In [A-Z][a-zA-Z]*(?:\s[A-Z][a-zA-Z]*)*,/;
const NOT_A_BUFF = /ignore|\bRES\b|resistance|Amplif|Frazzle|Erosion|Deepen|reduc|pen\b|DMG dealt by|DMG taken|healing|heals|Heal(?:ing)?\s+is|restor|revive/i;
const TEAM = /\b(all team members|all nearby (?:team members|resonators|characters)|other team members|team members'|nearby (?:team members|resonators|characters))\b/i;
const CONNECT = '(?:\\s+(?:is\\s+)?increased)?(?:\\s+by)?';
const PRE = '(?:of\\s+|a\\s+|an\\s+|their\\s+|the\\s+|her\\s+|his\\s+)?';
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
// Sequence phrasing often inserts a target clause between the stat name and "is
// increased by" that weapon passives never do — "the ATK **of all team members**
// is increased by {0}". Strip it so the shared CONNECT-suffix check still matches;
// team-scoping itself is decided separately via the TEAM regex on the full text.
const TARGET_CLAUSE = /\s+of\s+(?:all\s+)?(?:team members|nearby (?:team members|resonators|characters)|resonators|characters)/gi;
function detectStat(before, after) {
    const b = before.replace(TARGET_CLAUSE, '').replace(/\s+$/, '');
    for (const [core, stat, scope, label] of STAT_TESTS)
        if (new RegExp(core + CONNECT + '$', 'i').test(b)) return { stat, scope, label };
    const a = after.replace(/^[\s,]+/, '');
    if (NOT_A_BUFF.test(before.slice(-40)) || NOT_A_BUFF.test(a.slice(0, 40))) return null;
    for (const [core, stat, scope, label] of STAT_TESTS)
        if (new RegExp('^' + PRE + core + '\\b', 'i').test(a)) return { stat, scope, label };
    return null;
}
function parseBuffs(desc, params) {
    const trig = desc.search(TRIGGER);
    // A leading "In <State>," clause makes EVERYTHING after it conditional on that
    // state — treat its end (position 0, since it's always sentence-initial) as an
    // even earlier trigger boundary than any TRIGGER keyword found later.
    const inState = IN_STATE_CLAUSE.test(desc) ? 0 : -1;
    const triggerPos = Math.min(trig < 0 ? Infinity : trig, inState < 0 ? Infinity : inState);
    const self = [], team = [], seen = new Set();
    for (let i = 0; i < params.length; i++) {
        const arr = params[i]; if (!arr || !arr.length || !/%$/.test(arr[0])) continue;
        const pos = desc.indexOf('{' + i + '}');
        if (pos < 0) continue;
        const st = detectStat(desc.slice(0, pos), desc.slice(pos + ('{' + i + '}').length));
        if (!st) continue;
        // Is this specific value team-scoped? Check the nearest TEAM mention around the placeholder.
        const isTeam = TEAM.test(desc.slice(Math.max(0, pos - 60), pos + 20));
        const conditional = pos > triggerPos;
        const key = st.stat + '|' + (st.scope ? st.scope.join('+') : '') + '|' + isTeam;
        if (seen.has(key)) continue;
        seen.add(key);
        const bo = { stat: st.stat, label: st.label, value: parseFloat(arr[0]), conditional };
        if (st.scope) bo.appliesTo = st.scope;
        (isTeam ? team : self).push(isTeam ? { stat: bo.stat, label: bo.label, value: bo.value, ...(st.scope ? { appliesTo: st.scope } : {}) } : bo);
    }
    self.sort((x, y) => (x.conditional === y.conditional ? 0 : x.conditional ? 1 : -1));
    return { self, team };
}

(async () => {
    console.log('fetching datamine...');
    const cacheDir = process.env.WW_CACHE;
    const tmPromise = cacheDir
        ? Promise.resolve(JSON.parse(fs.readFileSync(path.join(cacheDir, 'ww-multitext.json'), 'utf8')))
        : get('TextMap/en/MultiText.json');
    const [role, chain, tm] = await Promise.all([get('ConfigDB/RoleInfo.json'), get('ConfigDB/ResonantChain.json'), tmPromise]);
    const R = (Array.isArray(role) ? role : Object.values(role)).filter((x) => x.Id >= 1000 && x.Id < 2000);
    const C = Array.isArray(chain) ? chain : Object.values(chain);
    const nm = (k) => tm[k] || '';
    const byGroup = {}; for (const c of C) (byGroup[c.GroupId] ??= []).push(c);
    const ALIAS = { 'Rover (Spectro)': 'Rover: Spectro', 'Rover (Havoc)': 'Rover: Havoc', 'Rover (Aero)': 'Rover: Aero' };
    const byNameNorm = {}; for (const r of R) byNameNorm[norm(nm(r.Name))] = r;

    const src = fs.readFileSync(FILE, 'utf8');
    const body = src.match(/SEQUENCE_OVERRIDES[^=]*= (\{[\s\S]*?\n\});\n/)[1];
    const data = eval('(' + body + ')');

    let selfCount = 0, teamCount = 0;
    for (const c of CHARACTERS) {
        const nodes = data[c.id];
        if (!nodes) continue;
        const want = norm(ALIAS[c.name] || c.name);
        const ri = byNameNorm[want] || R.find((x) => norm(nm(x.Name)).includes(want) || want.includes(norm(nm(x.Name))));
        const chainNodes = ri && byGroup[ri.Id];
        if (!chainNodes) continue;
        for (const cn of chainNodes) {
            const target = nodes.find((n) => n.level === cn.GroupIndex);
            if (!target) continue;
            const rawDesc = nm(cn.AttributesDescription);
            // ResonantChain params are a FLAT array (one value per placeholder index), not
            // per-index R1-R5 arrays like weapon DescParams — wrap each in a 1-element array
            // so parseBuffs' arr[0] lookup (shared with the weapon-passive parser) still works.
            const flat = cn.AttributesDescriptionParams || [];
            const perIndex = flat.map((v) => [v]);
            const { self, team } = parseBuffs(rawDesc.replace(/<[^>]+>/g, ''), perIndex);
            if (self.length) { target.selfBuffs = self; selfCount++; }
            if (team.length) { target.buffs = team; teamCount++; }
        }
    }

    const outBody = Object.entries(data).map(([id, nodes]) => {
        const inner = nodes.map((n) => {
            let extra = '';
            if (n.selfBuffs) extra += `, selfBuffs: ${JSON.stringify(n.selfBuffs)}`;
            if (n.buffs) extra += `, buffs: ${JSON.stringify(n.buffs)}`;
            return `        { level: ${n.level}, name: ${JSON.stringify(n.name)}, description: ${JSON.stringify(n.description)}${extra} }`;
        }).join(',\n');
        return `    ${JSON.stringify(id)}: [\n${inner},\n    ],`;
    }).join('\n');

    const banner = `/**\n * @fileoverview AUTO-GENERATED WW Sequence text + buffs (Dimbreath datamine)\n * @module adapters/game-definitions/wuthering-waves/sequences.generated\n *\n * Sequence 1-6 name + description + parsed stat buffs per resonator, for the Talents\n * window and (selfBuffs/buffs) the Calculator's toggle system. DO NOT edit by hand —\n * re-run scripts/import-ww-sequences.cjs then scripts/parse-ww-sequence-buffs.cjs.\n */\n\n`;
    const ts = `${banner}export const SEQUENCE_OVERRIDES: Record<string, Array<{ level: number; name: string; description: string; selfBuffs?: Array<{ stat: string; label: string; value: number; conditional?: boolean; appliesTo?: string[] }>; buffs?: Array<{ stat: string; label: string; value: number; appliesTo?: string[] }> }>> = {\n${outBody}\n};\n\nexport default SEQUENCE_OVERRIDES;\n`;
    fs.writeFileSync(FILE, ts);
    console.log(`self-buff nodes: ${selfCount} | team-buff nodes: ${teamCount}`);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
