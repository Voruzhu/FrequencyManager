/* GI weapon stat importer via genshin-db → weapon-stats.generated.ts override.
 * Corrects baseAtk + secondary (mapped to OUR SECONDARY_KEY labels) at max level.
 * Requires `npm i -D genshin-db`. Run from repo root after `npm run build:main`:
 *   node scripts/import-gi-weapons.cjs */
const fs = require('fs');
const gdb = require('genshin-db');
const ROOT = process.cwd();
const OUT = ROOT + '/adapters/game-definitions/genshin-impact';
const { WEAPONS } = require(ROOT + '/dist/adapters/game-definitions/genshin-impact/weapons.js');

// FIGHT_PROP → OUR StatType label (must match SECONDARY_KEY in optimizer.ts).
const PROP_LABEL = {
  FIGHT_PROP_ATTACK_PERCENT: 'ATK%', FIGHT_PROP_CRITICAL: 'Crit Rate', FIGHT_PROP_CRITICAL_HURT: 'Crit DMG',
  FIGHT_PROP_CHARGE_EFFICIENCY: 'Energy Regen', FIGHT_PROP_ELEMENT_MASTERY: 'Elemental Mastery',
  FIGHT_PROP_HP_PERCENT: 'HP%', FIGHT_PROP_DEFENSE_PERCENT: 'DEF%', FIGHT_PROP_PHYSICAL_ADD_HURT: 'Physical DMG Bonus',
  FIGHT_PROP_HEAL_ADD: 'Healing Bonus',
};
const FLAT = new Set(['FIGHT_PROP_ELEMENT_MASTERY']);

const gen = {}; const rows = []; let ok = 0, notFound = 0;
for (const w of WEAPONS) {
  const g = gdb.weapons(w.name, { matchCategories: false });
  if (!g || !g.stats) { rows.push(`  NOT FOUND (kept as-is): ${w.id} (${w.name})`); notFound++; continue; }
  const s = g.stats(g.rarity <= 2 ? 70 : 90);
  if (!s) { rows.push(`  NO STATS: ${w.id}`); notFound++; continue; }
  const baseAtk = Math.round(s.attack);
  let secStat = w.secondaryStat, secVal = w.secondaryValue;
  if (g.mainStatType && PROP_LABEL[g.mainStatType]) {
    secStat = PROP_LABEL[g.mainStatType];
    secVal = FLAT.has(g.mainStatType) ? Math.round(s.specialized) : +(s.specialized * 100).toFixed(1);
  } else { secVal = 0; } // no secondary (1-2★): keep label, zero value
  const changed = baseAtk !== w.baseAtk || secStat !== w.secondaryStat || Math.abs(secVal - w.secondaryValue) > 0.05;
  gen[w.id] = { baseAtk, secondaryStat: secStat, secondaryValue: secVal };
  if (changed) rows.push(`  ${w.id.padEnd(24)} atk ${w.baseAtk}->${baseAtk}   sec ${w.secondaryStat}/${w.secondaryValue}->${secStat}/${secVal}`);
  else ok++;
}

// emit override TS
const body = Object.entries(gen).map(([id, v]) =>
  `    ${JSON.stringify(id)}: { baseAtk: ${v.baseAtk}, secondaryStat: ${JSON.stringify(v.secondaryStat)}, secondaryValue: ${v.secondaryValue} }`).join(',\n');
const ts = `/**
 * @fileoverview AUTO-GENERATED accurate weapon stats (Genshin Impact)
 * @module adapters/game-definitions/genshin-impact/weapon-stats.generated
 *
 * Max-level base ATK + secondary stat/value from genshin-db (precomputed lvl-90,
 * or lvl-70 for 1-2*). Secondary labels are mapped to our SECONDARY_KEY vocabulary.
 * Overrides the authored stats in bundle.ts (keeps passive/buffs/icon). DO NOT edit
 * by hand — re-run scripts/import-gi-weapons.cjs. ${Object.keys(gen).length} weapons.
 */

export const WEAPON_STAT_OVERRIDES: Record<string, { baseAtk: number; secondaryStat: string; secondaryValue: number }> = {
${body},
};

export default WEAPON_STAT_OVERRIDES;
`;
fs.writeFileSync(OUT + '/weapon-stats.generated.ts', ts);
console.log(`Weapons: ${WEAPONS.length} | overrides written: ${Object.keys(gen).length} | already-correct: ${ok} | not-found: ${notFound}`);
console.log('\n--- corrections ---');
rows.forEach((r) => console.log(r));
