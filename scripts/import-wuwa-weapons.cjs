/* WuWa weapon stat importer from the Dimbreath datamine.
 * Run from repo root after `npm run build:main`:  node scripts/import-wuwa-weapons.cjs
 * baseAtk@90 = WeaponConf.FirstPropId.Value x WeaponPropertyGrowth[FirstCurve, 90, breach6].
 * Secondary stat/value resolved via PropertyIndex.json (Id 8=Crit,9=CritDMG,11=EnergyRegen,
 * 10007=ATK%,10002=HP%,10010=DEF%). Verified: Verdant Summit 587 ATK / 48.6% Crit DMG.
 * Emits weapon-stats.generated.ts. */
const fs = require('fs');
const RAW = 'https://raw.githubusercontent.com/Dimbreath/WutheringData/master/';
const ROOT = process.cwd();
const OUT = ROOT + '/adapters/game-definitions/wuthering-waves';
const { WEAPONS } = require(ROOT + '/dist/adapters/game-definitions/wuthering-waves/weapons.js');
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const get = async (f) => { const r = await fetch(RAW + f, { signal: AbortSignal.timeout(60000) }); if (!r.ok) throw new Error(f); return r.json(); };
// PropertyIndex Key -> our SECONDARY_KEY label (optimizer.ts)
const KEY_LABEL = { Crit: 'Crit Rate', CritDamage: 'Crit DMG', EnergyEfficiency: 'Energy Regen', GreenAtk: 'ATK%', GreenLifeMax: 'HP%', GreenDef: 'DEF%', Atk: 'ATK' };

(async () => {
  console.log('fetching...');
  const [wc, wg, pi, tm] = await Promise.all([get('ConfigDB/WeaponConf.json'), get('ConfigDB/WeaponPropertyGrowth.json'), get('ConfigDB/PropertyIndex.json'), get('TextMap/en/MultiText.json')]);
  const W = Array.isArray(wc) ? wc : Object.values(wc);
  const G = Array.isArray(wg) ? wg : Object.values(wg);
  const P = Array.isArray(pi) ? pi : Object.values(pi);
  const propOf = (id) => P.find((x) => x.Id === id);
  const maxLv = Math.max(...G.map((x) => x.Level));
  const curveAt = (cid) => { const r = G.find((x) => x.CurveId === cid && x.Level === maxLv && x.BreachLevel === 6) || G.filter((x) => x.CurveId === cid && x.Level === maxLv).pop(); return r ? r.CurveValue : null; };
  const byName = {}; for (const w of W) byName[norm(tm[w.WeaponName] || '')] = w;

  const gen = {}; const rows = []; let notFound = 0;
  for (const w of WEAPONS) {
    const dc = byName[norm(w.name)] || W.find((x) => norm(tm[x.WeaponName] || '').includes(norm(w.name)));
    if (!dc || !dc.FirstPropId) { rows.push(`  NOT FOUND (kept): ${w.id} (${w.name})`); notFound++; continue; }
    const baseAtk = Math.round(dc.FirstPropId.Value * curveAt(dc.FirstCurve) / 10000);
    let secondaryStat = w.secondaryStat, secondaryValue = w.secondaryValue;
    const sp = dc.SecondPropId, prop = sp && propOf(sp.Id);
    if (prop && KEY_LABEL[prop.Key]) {
      secondaryStat = KEY_LABEL[prop.Key];
      const c2 = curveAt(dc.SecondCurve);
      const rawAt90 = sp.Value * c2 / 10000;
      // flat: raw ; centi-percent (Crit/CritDMG/ER): raw/100 ; ratio (Green*): raw*100
      secondaryValue = +(sp.IsRatio ? rawAt90 * 100 : (prop.IsPercent ? rawAt90 / 100 : rawAt90)).toFixed(1);
    }
    gen[w.id] = { baseAtk, secondaryStat, secondaryValue };
    rows.push(`  ${w.id.padEnd(22)} atk ${w.baseAtk}->${baseAtk}  sec ${w.secondaryStat}/${w.secondaryValue} -> ${secondaryStat}/${secondaryValue}`);
  }

  const body = Object.entries(gen).map(([id, v]) => `    ${JSON.stringify(id)}: { baseAtk: ${v.baseAtk}, secondaryStat: ${JSON.stringify(v.secondaryStat)}, secondaryValue: ${v.secondaryValue} }`).join(',\n');
  const ts = `/**
 * @fileoverview AUTO-GENERATED WuWa weapon base ATK (Dimbreath datamine)
 * @module adapters/game-definitions/wuthering-waves/weapon-stats.generated
 *
 * Level-90 base ATK + secondary stat/value = WeaponConf x WeaponPropertyGrowth curve,
 * secondary type resolved via PropertyIndex.json. Overrides baseAtk + secondary in
 * bundle.ts. DO NOT edit by hand — re-run
 * scripts/import-wuwa-weapons.cjs. ${Object.keys(gen).length} weapons.
 */

export const WEAPON_STAT_OVERRIDES: Record<string, { baseAtk: number; secondaryStat: string; secondaryValue: number }> = {
${body},
};

export default WEAPON_STAT_OVERRIDES;
`;
  fs.writeFileSync(OUT + '/weapon-stats.generated.ts', ts);
  console.log(`WuWa weapons: ${WEAPONS.length} | overrides: ${Object.keys(gen).length} | not-found: ${notFound}`);
  rows.forEach((r) => console.log(r));
})();
