/* WuWa character base-stat importer from the Dimbreath datamine.
 * Run from repo root after `npm run build:main`:
 *   node scripts/import-wuwa-charstats.cjs
 * Computes level-90 base ATK/HP/DEF = BaseProperty[PropertyId](Lv1) x
 * RolePropertyGrowth[level 90, breach 6] ratio. This is the PURE game base — it
 * excludes the fixed skill-tree stat nodes (a documented follow-up). Our authored
 * WuWa base ATK/DEF were grossly wrong (e.g. Jiyan ATK 858 vs real base ~438).
 * Emits character-stats.generated.ts, merged over characters.ts in bundle.ts. */
const fs = require('fs');
const RAW = 'https://raw.githubusercontent.com/Dimbreath/WutheringData/master/';
const ROOT = process.cwd();
const OUT = ROOT + '/adapters/game-definitions/wuthering-waves';
const { CHARACTERS } = require(ROOT + '/dist/adapters/game-definitions/wuthering-waves/characters.js');

const ALIAS = { // our display name -> datamine name (when they differ)
  'Rover (Spectro)': 'Rover', 'Xiangli Yao': 'Xiangli Yao', 'The Shorekeeper': 'Shorekeeper', Shorekeeper: 'Shorekeeper',
};
const norm = (s) => String(s).toLowerCase().replace(/[^a-z]/g, '');

async function get(f) { const r = await fetch(RAW + f, { signal: AbortSignal.timeout(60000) }); if (!r.ok) throw new Error(f + ' ' + r.status); return r.json(); }

(async () => {
  console.log('fetching datamine...');
  const [role, base, growth, tm] = await Promise.all([
    get('ConfigDB/RoleInfo.json'), get('ConfigDB/BaseProperty.json'),
    get('ConfigDB/RolePropertyGrowth.json'), get('TextMap/en/MultiText.json'),
  ]);
  const R = (Array.isArray(role) ? role : Object.values(role)).filter((x) => x.Id >= 1000 && x.Id < 2000);
  const B = Array.isArray(base) ? base : Object.values(base);
  const G = Array.isArray(growth) ? growth : Object.values(growth);
  const nameOf = (x) => tm[x.Name] || String(x.Name);
  // level-90 breach-6 growth ratios (single shared curve)
  const maxLv = Math.max(...G.map((x) => x.Level));
  const g = G.find((x) => x.Level === maxLv && x.BreachLevel === 6) || G.filter((x) => x.Level === maxLv).pop();

  // build datamine name -> RoleInfo
  const byName = {};
  for (const x of R) byName[norm(nameOf(x))] = x;

  const gen = {}; const rows = []; let notFound = 0;
  for (const c of CHARACTERS) {
    const want = norm(ALIAS[c.name] || c.name);
    const ri = byName[want] || R.find((x) => norm(nameOf(x)).includes(want) || want.includes(norm(nameOf(x))));
    if (!ri) { rows.push(`  NOT FOUND (kept): ${c.id} (${c.name})`); notFound++; continue; }
    const bp = B.find((x) => x.Id === ri.PropertyId && x.Lv === 1) || B.find((x) => x.Id === ri.PropertyId);
    if (!bp) { rows.push(`  NO BASE: ${c.id} (PropertyId ${ri.PropertyId})`); notFound++; continue; }
    const baseAtk = Math.round(bp.Atk * g.AtkRatio / 10000);
    const baseHp = Math.round(bp.LifeMax * g.LifeMaxRatio / 10000);
    const baseDef = Math.round(bp.Def_ * g.DefRatio / 10000);
    gen[c.id] = { baseAtk, baseHp, baseDef };
    rows.push(`  ${c.id.padEnd(14)} ATK ${c.baseAtk}->${baseAtk}  HP ${c.baseHp}->${baseHp}  DEF ${c.baseDef}->${baseDef}   [${nameOf(ri)} #${ri.Id}]`);
  }

  const body = Object.entries(gen).map(([id, v]) =>
    `    ${JSON.stringify(id)}: { baseAtk: ${v.baseAtk}, baseHp: ${v.baseHp}, baseDef: ${v.baseDef} }`).join(',\n');
  const ts = `/**
 * @fileoverview AUTO-GENERATED WuWa character base stats (Dimbreath datamine)
 * @module adapters/game-definitions/wuthering-waves/character-stats.generated
 *
 * Level-90 PURE base ATK/HP/DEF = BaseProperty(Lv1) x RolePropertyGrowth(90,breach6).
 * Excludes the fixed skill-tree stat nodes (displayed HP is ~+2400 higher). Our
 * authored base ATK/DEF were grossly wrong. DO NOT edit by hand — re-run
 * scripts/import-wuwa-charstats.cjs. ${Object.keys(gen).length} characters.
 */

export const CHARACTER_STAT_OVERRIDES: Record<string, { baseAtk: number; baseHp: number; baseDef: number }> = {
${body},
};

export default CHARACTER_STAT_OVERRIDES;
`;
  fs.writeFileSync(OUT + '/character-stats.generated.ts', ts);
  console.log(`WuWa characters: ${CHARACTERS.length} | overrides: ${Object.keys(gen).length} | not-found: ${notFound}`);
  console.log('growth@90:', JSON.stringify(g));
  console.log('\n--- changes ---');
  rows.forEach((r) => console.log(r));
})();
