/**
 * import-gi-constellations.cjs
 *
 * Imports Constellation 1-6 name + description (read-only flavor/effect text — NOT
 * applied to damage calc) for every GI character, from genshin-db's `constellations()`
 * query (clean, structured: c1..c6, each {name, description} — description is already
 * HTML/color-tag-sanitized per the package's own type comment).
 *
 * Run: NODE_PATH=<dir with genshin-db installed> node scripts/import-gi-constellations.cjs
 * Emits: adapters/game-definitions/genshin-impact/constellations.generated.ts
 *
 * WARNING: this is a FULL reimport — re-running it wipes any `boostsSkillId`/
 * `selfBuffs`/`buffs` added by the two scripts below. Correct re-run order after a
 * base reimport: this script → identify-gi-constellation-skill-boosts.cjs (C3/C5
 * skill-level-boost targets) → curate-gi-constellations.cjs (hand-curated C1/C2/C4/C6
 * stat buffs).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const gdb = require('genshin-db');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'adapters', 'game-definitions', 'genshin-impact', 'constellations.generated.ts');
const { CHARACTERS } = require(path.join(ROOT, 'dist', 'adapters', 'game-definitions', 'genshin-impact', 'characters.js'));

const gen = {};
let matched = 0;
const missing = [];
for (const c of CHARACTERS) {
    // Roster names are sometimes disambiguated, e.g. "Wanderer (Scaramouche)" /
    // "Childe (Tartaglia)" — genshin-db only knows the base name.
    const baseName = c.name.replace(/\s*\([^)]*\)\s*$/, '');
    const g = gdb.constellations(c.name) || gdb.constellations(baseName);
    if (!g || !g.c1) { missing.push(c.id); continue; }
    const nodes = [];
    for (let i = 1; i <= 6; i++) {
        const node = g[`c${i}`];
        if (!node || !node.name) continue;
        nodes.push({ level: i, name: node.name, description: node.description });
    }
    if (nodes.length === 6) { gen[c.id] = nodes; matched++; } else { missing.push(c.id); }
}

const body = Object.entries(gen).map(([id, nodes]) => {
    const inner = nodes.map((n) => `        { level: ${n.level}, name: ${JSON.stringify(n.name)}, description: ${JSON.stringify(n.description)} }`).join(',\n');
    return `    ${JSON.stringify(id)}: [\n${inner},\n    ],`;
}).join('\n');

const ts = `/**
 * @fileoverview AUTO-GENERATED GI Constellation text (genshin-db)
 * @module adapters/game-definitions/genshin-impact/constellations.generated
 *
 * Constellation 1-6 name + description per character — read-only flavor/effect text
 * for the Talents window. NOT applied to damage calc (see CharacterEntry.constellations
 * doc comment in shared/types/game-bundle.ts). DO NOT edit by hand — re-run
 * scripts/import-gi-constellations.cjs. ${matched} characters, ${matched * 6} nodes.
 */

import type { BuffEntry } from '@shared/types/game-bundle';
type BuffScaleOff = BuffEntry['scaleOff'];

export const CONSTELLATION_OVERRIDES: Record<string, Array<{ level: number; name: string; description: string; boostsSkillId?: string; selfBuffs?: Array<{ stat: string; label: string; value: number; conditional?: boolean; appliesTo?: string[]; scaleOff?: BuffScaleOff }>; buffs?: Array<{ stat: string; label: string; value: number; appliesTo?: string[]; scaleOff?: BuffScaleOff }> }>> = {
${body}
};

export default CONSTELLATION_OVERRIDES;
`;
fs.writeFileSync(OUT, ts);
console.log(`GI constellations: ${matched}/${CHARACTERS.length} characters matched (${matched * 6} nodes). Missing: ${missing.length}`);
if (missing.length) console.log('  ' + missing.slice(0, 20).join(', ') + (missing.length > 20 ? '…' : ''));
