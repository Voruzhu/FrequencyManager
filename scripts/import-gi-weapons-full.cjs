/* Generate the FULL Genshin weapon roster into weapons.ts from genshin-db.
 * Requires `npm i -D genshin-db`. Run from repo root:
 *   node scripts/import-gi-weapons-full.cjs
 * Accurate max-level base ATK + secondary (mapped to our SECONDARY_KEY labels).
 * Preserves hand-authored team-buffs for support weapons (Thrilling Tales, Elegy). */
const fs = require('fs');
const gdb = require('genshin-db');
const OUT = process.cwd() + '/adapters/game-definitions/genshin-impact/weapons.ts';
const GL = 'https://gitlab.com/Dimbreath/AnimeGameData/-/raw/master/ExcelBinOutput/';
const getGL = async (f) => (await (await fetch(GL + f, { signal: AbortSignal.timeout(20000) })).json());

// addProps propType -> {stat,label,pct}. These are the UNCONDITIONAL passive stats.
const ADDPROP = {
  FIGHT_PROP_ATTACK_PERCENT: { stat: 'atkPct', label: 'ATK%', pct: true },
  FIGHT_PROP_HP_PERCENT: { stat: 'hpPct', label: 'HP%', pct: true },
  FIGHT_PROP_DEFENSE_PERCENT: { stat: 'defPct', label: 'DEF%', pct: true },
  FIGHT_PROP_CRITICAL: { stat: 'critRate', label: 'Crit Rate', pct: true },
  FIGHT_PROP_CRITICAL_HURT: { stat: 'critDmg', label: 'Crit DMG', pct: true },
  FIGHT_PROP_CHARGE_EFFICIENCY: { stat: 'energyRegen', label: 'Energy Recharge', pct: true },
  FIGHT_PROP_ADD_HURT: { stat: 'elemDmg', label: 'DMG Bonus', pct: true },
  FIGHT_PROP_ELEMENT_MASTERY: { stat: 'elementalMastery', label: 'EM', pct: false },
  FIGHT_PROP_HEAL_ADD: { stat: 'healingBonus', label: 'Healing Bonus', pct: true },
};

// -> StatType vocabulary (weapons.ts); derive.ts statTypeToLabel maps CRIT->Crit for the calc.
const PROP = {
  FIGHT_PROP_ATTACK_PERCENT: 'ATK%', FIGHT_PROP_CRITICAL: 'CRIT Rate', FIGHT_PROP_CRITICAL_HURT: 'CRIT DMG',
  FIGHT_PROP_CHARGE_EFFICIENCY: 'Energy Regen', FIGHT_PROP_ELEMENT_MASTERY: 'Elemental Mastery',
  FIGHT_PROP_HP_PERCENT: 'HP%', FIGHT_PROP_DEFENSE_PERCENT: 'DEF%',
  FIGHT_PROP_PHYSICAL_ADD_HURT: 'Physical DMG Bonus', FIGHT_PROP_HEAL_ADD: 'Healing Bonus',
};
const FLAT = new Set(['FIGHT_PROP_ELEMENT_MASTERY']);

// --- weapon passive -> self-buffs (best-effort, R1) via template + values ---
function statOf(ctx) {
  ctx = ctx.toLowerCase();
  if (/^\s*of\b/i.test(ctx) && /max hp|energy|def\b/i.test(ctx)) return null; // conversion — skip
  if (/party members|all nearby|team/.test(ctx)) return null;
  if (/elemental mastery/.test(ctx)) return { stat: 'elementalMastery', label: 'EM' };
  if (/elemental dmg|elemental damage/.test(ctx)) return { stat: 'elemDmg', label: 'Elemental DMG' };
  if (/\bdmg\b|\bdamage\b/.test(ctx)) return { stat: 'elemDmg', label: 'DMG' };
  if (/crit(?:ical)? rate/.test(ctx)) return { stat: 'critRate', label: 'Crit Rate' };
  if (/crit(?:ical)? dmg|crit(?:ical)? damage/.test(ctx)) return { stat: 'critDmg', label: 'Crit DMG' };
  if (/energy recharge/.test(ctx)) return { stat: 'energyRegen', label: 'Energy Recharge' };
  if (/\batk\b|attack/.test(ctx)) return { stat: 'atkPct', label: 'ATK%' };
  if (/\bhp\b/.test(ctx)) return { stat: 'hpPct', label: 'HP%' };
  if (/\bdef\b/.test(ctx)) return { stat: 'defPct', label: 'DEF%' };
  return null;
}
function parsePassive(w) {
  const tmpl = (w.effectTemplateRaw || '').replace(/<[^>]+>/g, '');
  const vals = (w.r1 && w.r1.values) || [];
  const out = {}; const re = /\{(\d+)\}/g; let m;
  while ((m = re.exec(tmpl))) {
    const i = +m[1]; const raw = vals[i]; if (raw == null) continue;
    if (!/%|^\d+$|\//.test(String(raw))) continue;
    const num = +String(raw).split('/').pop().replace('%', ''); if (!num || num > 300) continue;
    const before = tmpl.slice(Math.max(0, m.index - 40), m.index);
    const after = tmpl.slice(m.index + m[0].length, m.index + m[0].length + 50);
    if (/^\s*of\b/i.test(after) && /max hp|energy|def\b/i.test(after)) continue;
    const s = statOf(before.slice(-24)) || statOf(after.slice(0, 40)); if (!s) continue;
    out[s.stat] = { stat: s.stat, label: s.label + ' (R1)', value: +(((out[s.stat] || {}).value || 0) + num).toFixed(1) };
  }
  return Object.values(out);
}
const slug = (s) => s.toLowerCase().replace(/[''’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
// preserved support-weapon buffs (R1) keyed by slug
const SUPPORT = {
  'thrilling-tales-of-dragon-slayers': { passive: 'On swap, grants the incoming character +24% ATK for 10s (R1; +48% at R5).', buffs: [{ stat: 'atkPct', label: 'ATK% (R1)', value: 24 }] },
  'elegy-for-the-end': { passive: 'At 4 sigils: party gains +100 EM and +20% ATK for 12s (R1; EM scales to +200 at R5).', buffs: [{ stat: 'elementalMastery', label: 'Elemental Mastery (R1)', value: 100 }, { stat: 'atkPct', label: 'ATK% (R1)', value: 20 }] },
};

(async () => {
// weapon.id -> R1 addProps self-buffs (exact, unconditional)
const [affix, weap] = await Promise.all([getGL('EquipAffixExcelConfigData.json'), getGL('WeaponExcelConfigData.json')]);
const affixR1 = {}; for (const a of (Array.isArray(affix) ? affix : Object.values(affix))) if (a.level === 0) affixR1[a.id] = a.addProps || [];
const staticBuffsFor = (weaponId) => {
  const wc = (Array.isArray(weap) ? weap : Object.values(weap)).find((x) => x.id === weaponId);
  if (!wc || !wc.skillAffix || !wc.skillAffix[0]) return [];
  const props = affixR1[wc.skillAffix[0]] || [];
  const out = [];
  for (const p of props) { const m = ADDPROP[p.propType]; if (!m || !p.value) continue; out.push({ stat: m.stat, label: m.label + ' (R1)', value: +(m.pct ? p.value * 100 : p.value).toFixed(1), conditional: false }); }
  return out;
};

const names = gdb.weapons('names', { matchCategories: true });
const seen = new Set(); const rows = [];
for (const n of names) {
  const w = gdb.weapons(n); if (!w || !w.stats) continue;
  if (seen.has(w.name)) continue; seen.add(w.name);
  const maxLv = w.rarity <= 2 ? 70 : 90;
  const s = w.stats(maxLv); if (!s) continue;
  const id = slug(w.name);
  const baseAtk = Math.round(s.attack);
  let secStat = 'ATK%', secVal = 0;
  if (w.mainStatType && PROP[w.mainStatType]) { secStat = PROP[w.mainStatType]; secVal = FLAT.has(w.mainStatType) ? Math.round(s.specialized) : +(s.specialized * 100).toFixed(1); }
  const sup = SUPPORT[id];
  // exact unconditional (addProps) + conditional (parser, excluding stats already covered)
  const staticB = staticBuffsFor(w.id);
  const staticStats = new Set(staticB.map((b) => b.stat));
  const condB = parsePassive(w).filter((b) => !staticStats.has(b.stat)).map((b) => ({ ...b, conditional: true }));
  const self = [...staticB, ...condB];
  const selfStr = self.length && !sup ? `, selfBuffs: ${JSON.stringify(self)}` : '';
  const extra = (sup ? `, passive: ${JSON.stringify(sup.passive)}, buffs: ${JSON.stringify(sup.buffs)}` : '') + selfStr;
  rows.push({ rarity: w.rarity, name: w.name, line: `    { id: ${JSON.stringify(id)}, name: ${JSON.stringify(w.name)}, weaponType: ${JSON.stringify(w.weaponText)}, rarity: ${w.rarity}, baseAtk: ${baseAtk}, secondaryStat: ${JSON.stringify(secStat)}, secondaryValue: ${secVal}${extra}, icon: ${JSON.stringify('icons/weapons/' + id + '.png')} },` });
}
rows.sort((a, b) => b.rarity - a.rarity || a.name.localeCompare(b.name));

const header = `/**\n * @fileoverview Genshin Impact weapon database (FULL roster, auto-generated)\n * @module adapters/game-definitions/genshin-impact/weapons\n *\n * All released weapons with accurate max-level base ATK + secondary from genshin-db.\n * Support-weapon team-buffs (Thrilling Tales, Elegy) hand-preserved at R1. Regenerate:\n * node scripts/import-gi-weapons-full.cjs (needs \`npm i -D genshin-db\`). ${rows.length} weapons.\n */\n\nimport type { WeaponType, StatType } from '@shared/types/game-definition';\n\nexport interface GIWeapon {\n    id: string;\n    name: string;\n    weaponType: WeaponType;\n    rarity: number;\n    baseAtk: number;\n    secondaryStat: StatType;\n    secondaryValue: number;\n    /** Passive description (human-readable). */\n    passive?: string;\n    /** TEAM buffs the passive deploys to the party (support weapons only). */\n    buffs?: Array<{ stat: string; label: string; value: number }>;\n    /** SELF buffs the passive grants (R1). Unconditional (from addProps) auto-apply;\n     * conditional ones are opt-in calc toggles. */\n    selfBuffs?: Array<{ stat: string; label: string; value: number; conditional?: boolean }>;\n    icon: string;\n}\n\nexport const WEAPONS: GIWeapon[] = [\n`;
const footer = '\n];\n\nexport const getWeapon = (id: string): GIWeapon | undefined => WEAPONS.find((w) => w.id === id);\n';
fs.writeFileSync(OUT, header + rows.map((r) => r.line).join('\n') + footer);
const sc = rows.filter((r) => /"conditional":false/.test(r.line)).length;
console.log(`Wrote ${rows.length} GI weapons. Weapons with exact (unconditional) passive stats: ${sc}.`);
})();
