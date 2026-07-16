/* GI HP/DEF-scaled skill-multiplier importer via genshin-db.
 * Requires `npm i -D genshin-db`. Run from repo root after `npm run build:main`:
 *   node scripts/import-gi-scaled-multipliers.cjs
 * Our authored HP/DEF multipliers were largely fabricated (23/24 matched no real
 * component). This pulls the real DAMAGE component (matching the authored scaling
 * stat, excluding heal/shield/absorb labels) per level → skill-multipliers-scaled.generated.ts. */
const fs = require('fs');
const gdb = require('genshin-db');
const ROOT = process.cwd();
const OUT = ROOT + '/adapters/game-definitions/genshin-impact';
const { CHARACTER_SKILLS } = require(ROOT + '/dist/adapters/game-definitions/genshin-impact/skills.js');
const { CHARACTERS } = require(ROOT + '/dist/adapters/game-definitions/genshin-impact/characters.js');

const NAME = { neuvillette: 'Neuvillette', noelle: 'Noelle', yelan: 'Yelan', furina: 'Furina', zhongli: 'Zhongli',
  nilou: 'Nilou', candace: 'Candace', layla: 'Layla', yaoyao: 'Yaoyao', baizhu: 'Baizhu', sigewinne: 'Sigewinne' };
const STAT_RE = { hp: /Max HP/i, def: /\bDEF\b/i, em: /Elemental Mastery|\bEM\b/i };
const nodeOf = (sid) => (sid === 'burst' ? 'combat3' : (sid === 'skill' ? 'combat2' : 'combat1'));
const NON_DMG = /(absorb|shield|heal|restore|bonus|\bloss\b|duration|regen|stamina|\bcd\b|interval)/i;

// components matching the scaling stat, each with its param array (levels 1-15)
function dmgComponents(attr, statRe, sid) {
  const out = [];
  (attr.labels || []).forEach((l) => {
    const label = l.split('|')[0].trim();
    const rest = l.slice(l.indexOf('|') + 1);
    if (!statRe.test(rest)) return;
    if (!/DMG/i.test(label) || NON_DMG.test(label)) return;
    const m = rest.match(/\{param(\d+)[:}]/);
    if (!m) return;
    const arr = attr.parameters['param' + m[1]];
    if (arr && arr.length >= 10) out.push({ label, arr });
  });
  return out;
}
// pick the representative DMG component: exact canonical first, else the first.
function pick(comps, sid) {
  const canon = sid === 'burst' ? /^burst dmg$/i : sid === 'skill' ? /^skill dmg$/i : /^1-?hit dmg$/i;
  return comps.find((c) => canon.test(c.label)) || comps[0] || null;
}

const gen = {}; const rows = [];
for (const c of CHARACTERS) {
  const skills = CHARACTER_SKILLS[c.id];
  if (!skills) continue;
  for (const s of skills) {
    const sc = s.scaling ?? 'atk';
    if (sc === 'atk') continue;
    const g = gdb.talents(NAME[c.id] || c.name);
    if (!g) { rows.push(`  ${c.id}/${s.id}: no talent data (kept)`); continue; }
    const node = g[nodeOf(s.id)];
    const comps = dmgComponents(node.attributes, STAT_RE[sc] || /./, s.id);
    const chosen = pick(comps, s.id);
    if (!chosen) { rows.push(`  ${c.id}/${s.id} (${sc}): no DMG component (healer/shield) — kept authored ${s.multipliers[0]}`); continue; }
    const vals = chosen.arr.slice(0, 10).map((x) => +(+x).toFixed(4));
    (gen[c.id] ??= {})[s.id] = vals;
    rows.push(`  ${c.id}/${s.id} (${sc}): ${s.multipliers[0]}..${s.multipliers[9]} -> ${vals[0]}..${vals[9]}  ("${chosen.label}")`);
  }
}

const body = Object.entries(gen).map(([cid, sk]) => {
  const inner = Object.entries(sk).map(([sid, arr]) => `        ${sid}: [${arr.join(', ')}]`).join(',\n');
  return `    ${JSON.stringify(cid)}: {\n${inner},\n    },`;
}).join('\n');
const total = Object.values(gen).reduce((n, s) => n + Object.keys(s).length, 0);
const ts = `/**
 * @fileoverview AUTO-GENERATED HP/DEF-scaled skill multipliers (Genshin Impact)
 * @module adapters/game-definitions/genshin-impact/skill-multipliers-scaled.generated
 *
 * Real DAMAGE-component multipliers (per level) for HP/DEF-scaled skills, from
 * genshin-db — the labeled component matching the authored scaling stat, excluding
 * heal/shield/absorb. Our previous authored values here were largely fabricated.
 * Merged over authored tables in bundle.ts alongside the ATK overrides. DO NOT edit
 * by hand — re-run scripts/import-gi-scaled-multipliers.cjs. ${total} entries.
 */

export const SCALED_SKILL_MULTIPLIER_OVERRIDES: Record<string, Record<string, number[]>> = {
${body}
};

export default SCALED_SKILL_MULTIPLIER_OVERRIDES;
`;
fs.writeFileSync(OUT + '/skill-multipliers-scaled.generated.ts', ts);
console.log(`HP/DEF-scaled overrides written: ${total} entries across ${Object.keys(gen).length} chars.`);
console.log('\n--- changes ---');
rows.forEach((r) => console.log(r));
