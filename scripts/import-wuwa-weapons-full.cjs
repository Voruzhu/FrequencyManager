/* Generate the FULL WuWa weapon roster into weapons.ts from the Dimbreath datamine.
 * Run from repo root: node --max-old-space-size=2048 scripts/import-wuwa-weapons-full.cjs
 * Accurate lvl-90 base ATK + secondary (WeaponConf x WeaponPropertyGrowth, PropertyIndex). */
const fs = require('fs');
const RAW = 'https://raw.githubusercontent.com/Dimbreath/WutheringData/master/';
const OUT = process.cwd() + '/adapters/game-definitions/wuthering-waves/weapons.ts';
const get = async (f) => { const r = await fetch(RAW + f, { signal: AbortSignal.timeout(60000) }); if (!r.ok) throw new Error(f); return r.json(); };
const slug = (s) => s.toLowerCase().replace(/[''’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const TYPE = { 1: 'Broadblade', 2: 'Sword', 3: 'Pistols', 4: 'Gauntlets', 5: 'Rectifier' };
const KEY = { Crit: 'CRIT Rate', CritDamage: 'CRIT DMG', EnergyEfficiency: 'Energy Regen', GreenAtk: 'ATK%', GreenLifeMax: 'HP%', GreenDef: 'DEF%', Atk: 'ATK' };

(async () => {
  console.log('fetching...');
  const [wc, wg, pi, tm] = await Promise.all([get('ConfigDB/WeaponConf.json'), get('ConfigDB/WeaponPropertyGrowth.json'), get('ConfigDB/PropertyIndex.json'), get('TextMap/en/MultiText.json')]);
  const W = Array.isArray(wc) ? wc : Object.values(wc);
  const G = Array.isArray(wg) ? wg : Object.values(wg);
  const P = Array.isArray(pi) ? pi : Object.values(pi);
  const propOf = (id) => P.find((x) => x.Id === id);
  const maxLv = Math.max(...G.map((x) => x.Level));
  const curveAt = (cid) => { const r = G.find((x) => x.CurveId === cid && x.Level === maxLv && x.BreachLevel === 6) || G.filter((x) => x.CurveId === cid && x.Level === maxLv).pop(); return r ? r.CurveValue : null; };

  const seen = new Set(); const rows = [];
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
    rows.push({ rarity: w.QualityId, name, line: `    { id: ${JSON.stringify(id)}, name: ${JSON.stringify(name)}, weaponType: ${JSON.stringify(TYPE[w.WeaponType])}, rarity: ${w.QualityId}, baseAtk: ${baseAtk}, secondaryStat: ${JSON.stringify(secStat)}, secondaryValue: ${secVal}, icon: ${JSON.stringify('icons/weapons/' + id + '.png')} },` });
  }
  rows.sort((a, b) => b.rarity - a.rarity || a.name.localeCompare(b.name));

  const header = `/**\n * @fileoverview Wuthering Waves weapon database (FULL roster, auto-generated)\n * @module adapters/game-definitions/wuthering-waves/weapons\n *\n * All weapons with accurate lvl-90 base ATK + secondary from the Dimbreath datamine\n * (WeaponConf x WeaponPropertyGrowth, secondary type via PropertyIndex). Regenerate:\n * node --max-old-space-size=2048 scripts/import-wuwa-weapons-full.cjs. ${rows.length} weapons.\n */\nimport type { WeaponType, StatType } from '@shared/types/game-definition';\nexport interface WUWeapon {\n    id: string; name: string; weaponType: WeaponType; rarity: number;\n    baseAtk: number; secondaryStat: StatType; secondaryValue: number;\n    /** Passive description (human-readable). */\n    passive?: string;\n    /** TEAM buffs the passive deploys to the party (support weapons only). */\n    buffs?: Array<{ stat: string; label: string; value: number }>;\n    icon: string;\n}\nexport const WEAPONS: WUWeapon[] = [\n`;
  const footer = '\n];\n\nexport const getWeapon = (id: string): WUWeapon | undefined => WEAPONS.find((w) => w.id === id);\n';
  fs.writeFileSync(OUT, header + rows.map((r) => r.line).join('\n') + footer);
  console.log(`Wrote ${rows.length} WuWa weapons to weapons.ts`);
})();
