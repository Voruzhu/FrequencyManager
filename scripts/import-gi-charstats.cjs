/* GI character base-stat importer via genshin-db (precomputed lvl-90 ATK/HP/DEF).
 * Requires `npm i -D genshin-db`. Run from repo root after `npm run build:main`:
 *   node scripts/import-gi-charstats.cjs
 * Emits character-stats.generated.ts (merged over characters.ts in bundle.ts).
 * Our stored base ATK was systematically wrong (~700-800 for everyone); HP/DEF
 * mostly right but a few off. genshin-db gives exact fully-ascended lvl-90 stats. */
const fs = require('fs');
const gdb = require('genshin-db');
const ROOT = process.cwd();
const OUT = ROOT + '/adapters/game-definitions/genshin-impact';
const { CHARACTERS } = require(ROOT + '/dist/adapters/game-definitions/genshin-impact/characters.js');

const NAME_ALIAS = {
  'traveler-anemo': 'Aether', 'traveler-geo': 'Aether', 'traveler-electro': 'Aether',
  'traveler-dendro': 'Aether', 'traveler-hydro': 'Aether',
  childe: 'Tartaglia', yunjin: 'Yun Jin', wanderer: 'Wanderer',
};

const gen = {}; const rows = []; let ok = 0, notFound = 0, atkFix = 0;
for (const c of CHARACTERS) {
  const g = gdb.characters(NAME_ALIAS[c.id] || c.name, { matchCategories: false });
  if (!g || !g.stats) { rows.push(`  NOT FOUND (kept): ${c.id} (${c.name})`); notFound++; continue; }
  const s = g.stats(90);
  if (!s) { rows.push(`  NO STATS: ${c.id}`); notFound++; continue; }
  const baseAtk = Math.round(s.attack), baseHp = Math.round(s.hp), baseDef = Math.round(s.defense);
  gen[c.id] = { baseAtk, baseHp, baseDef };
  const changed = baseAtk !== c.baseAtk || baseHp !== c.baseHp || baseDef !== c.baseDef;
  if (Math.abs(baseAtk - c.baseAtk) > 2) atkFix++;
  if (changed) rows.push(`  ${c.id.padEnd(16)} ATK ${c.baseAtk}->${baseAtk}  HP ${c.baseHp}->${baseHp}  DEF ${c.baseDef}->${baseDef}`);
  else ok++;
}

const body = Object.entries(gen).map(([id, v]) =>
  `    ${JSON.stringify(id)}: { baseAtk: ${v.baseAtk}, baseHp: ${v.baseHp}, baseDef: ${v.baseDef} }`).join(',\n');
const ts = `/**
 * @fileoverview AUTO-GENERATED accurate character base stats (Genshin Impact)
 * @module adapters/game-definitions/genshin-impact/character-stats.generated
 *
 * Fully-ascended level-90 base ATK / HP / DEF from genshin-db. Overrides the
 * authored base stats in bundle.ts (our stored base ATK was systematically wrong).
 * Traveler variants share Aether's base stats. DO NOT edit by hand — re-run
 * scripts/import-gi-charstats.cjs. ${Object.keys(gen).length} characters.
 */

export const CHARACTER_STAT_OVERRIDES: Record<string, { baseAtk: number; baseHp: number; baseDef: number }> = {
${body},
};

export default CHARACTER_STAT_OVERRIDES;
`;
fs.writeFileSync(OUT + '/character-stats.generated.ts', ts);
console.log(`Characters: ${CHARACTERS.length} | overrides: ${Object.keys(gen).length} | unchanged: ${ok} | base-ATK fixes(>2): ${atkFix} | not-found: ${notFound}`);
console.log('\n--- changes (first 40) ---');
rows.slice(0, 40).forEach((r) => console.log(r));
if (rows.length > 40) console.log(`  ...and ${rows.length - 40} more`);
