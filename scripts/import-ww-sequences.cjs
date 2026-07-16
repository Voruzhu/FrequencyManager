/**
 * import-ww-sequences.cjs
 *
 * Imports Sequence 1-6 name + description (read-only flavor/effect text — NOT applied
 * to damage calc) for every WW resonator, from the Dimbreath datamine's
 * `ResonantChain.json` — grouped by `GroupId` (= RoleInfo character Id), ordered by
 * `GroupIndex` (1-6). `AttributesDescription` is a MultiText template with `{0}`/`{1}`
 * placeholders filled from `AttributesDescriptionParams` (exact values, same pattern as
 * WW weapon passives' DescParams). `<color=...>...</color>` tags are stripped.
 *
 * Run from repo root after `npm run build:main`: node scripts/import-ww-sequences.cjs
 * (accepts `WW_CACHE=<dir>` with ww-multitext.json to skip the slow 23MB TextMap fetch.)
 * Emits: adapters/game-definitions/wuthering-waves/sequences.generated.ts
 */
'use strict';
const fs = require('fs');
const path = require('path');
const RAW = 'https://raw.githubusercontent.com/Dimbreath/WutheringData/master/';
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'adapters', 'game-definitions', 'wuthering-waves', 'sequences.generated.ts');
const { CHARACTERS } = require(path.join(ROOT, 'dist', 'adapters', 'game-definitions', 'wuthering-waves', 'characters.js'));

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const get = async (f) => { const r = await fetch(RAW + f, { signal: AbortSignal.timeout(60000) }); if (!r.ok) throw new Error(f); return r.json(); };
// Strips ALL markup tags (color/size/term-link/etc.) while keeping their inner text —
// covers <color=...>, <size=...>, <te href=...>, <SapTag=...>, and any future variant.
const stripTags = (s) => String(s).replace(/<\/?[a-zA-Z][^>]*>/g, '');
const fillTemplate = (tmpl, params) => stripTags(tmpl).replace(/\{(\d+)\}/g, (_, i) => (params && params[+i] != null ? params[+i] : `{${i}}`));

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
    const byRoleId = {}; for (const r of R) byRoleId[r.Id] = r;
    const byGroup = {}; for (const c of C) (byGroup[c.GroupId] ??= []).push(c);
    // RoleInfo names Rover "Rover: <Element>" (colon, not parens) and has duplicate
    // male/female entries per element — either is fine, their sequence text is identical.
    const ALIAS = { 'Rover (Spectro)': 'Rover: Spectro', 'Rover (Havoc)': 'Rover: Havoc', 'Rover (Aero)': 'Rover: Aero' };

    const byNameNorm = {}; for (const r of R) byNameNorm[norm(nm(r.Name))] = r;
    const gen = {};
    let matched = 0;
    const missing = [];
    for (const c of CHARACTERS) {
        const want = norm(ALIAS[c.name] || c.name);
        const ri = byNameNorm[want] || R.find((x) => norm(nm(x.Name)).includes(want) || want.includes(norm(nm(x.Name))));
        const nodes = ri && byGroup[ri.Id];
        if (!nodes || nodes.length !== 6) { missing.push(c.id); continue; }
        const sorted = [...nodes].sort((a, b) => a.GroupIndex - b.GroupIndex);
        const out = sorted.map((n) => ({
            level: n.GroupIndex,
            name: stripTags(nm(n.NodeName)),
            description: fillTemplate(nm(n.AttributesDescription), n.AttributesDescriptionParams),
        }));
        if (out.some((n) => !n.name || !n.description)) { missing.push(c.id); continue; }
        gen[c.id] = out;
        matched++;
    }

    const body = Object.entries(gen).map(([id, nodes]) => {
        const inner = nodes.map((n) => `        { level: ${n.level}, name: ${JSON.stringify(n.name)}, description: ${JSON.stringify(n.description)} }`).join(',\n');
        return `    ${JSON.stringify(id)}: [\n${inner},\n    ],`;
    }).join('\n');

    const ts = `/**
 * @fileoverview AUTO-GENERATED WW Sequence text (Dimbreath datamine)
 * @module adapters/game-definitions/wuthering-waves/sequences.generated
 *
 * Sequence 1-6 name + description per resonator — read-only flavor/effect text for the
 * Talents window. NOT applied to damage calc (see CharacterEntry.constellations doc
 * comment in shared/types/game-bundle.ts). DO NOT edit by hand — re-run
 * scripts/import-ww-sequences.cjs. ${matched} resonators, ${matched * 6} nodes.
 */

export const SEQUENCE_OVERRIDES: Record<string, Array<{ level: number; name: string; description: string }>> = {
${body}
};

export default SEQUENCE_OVERRIDES;
`;
    fs.writeFileSync(OUT, ts);
    console.log(`WW sequences: ${matched}/${CHARACTERS.length} resonators matched (${matched * 6} nodes). Missing: ${missing.length}`);
    if (missing.length) console.log('  ' + missing.join(', '));
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
